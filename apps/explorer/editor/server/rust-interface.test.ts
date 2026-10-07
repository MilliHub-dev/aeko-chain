import assert from 'node:assert/strict'
import test from 'node:test'
import {
  encodeRawInstruction,
  encodeRustOperation,
  parseRawAccountMetas,
  parseRustProgramInterface,
} from '../src/aeko/rust-interface.js'

const SOURCE = String.raw`use {
  aeko_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program,
  },
  borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub enum DemoInstruction {
  CreateItem {
    title: String,
    amount: u64,
    owner: Pubkey,
  },
  DeleteItem,
}

pub fn create_item(
  program_id: &Pubkey,
  state_pubkey: &Pubkey,
  owner_pubkey: &Pubkey,
  title: String,
  amount: u64,
  owner: Pubkey,
) -> Instruction {
  Instruction::new_with_borsh(
    *program_id,
    &DemoInstruction::CreateItem { title, amount, owner },
    vec![
      AccountMeta::new(*state_pubkey, false),
      AccountMeta::new_readonly(*owner_pubkey, true),
      AccountMeta::new_readonly(system_program::id(), false),
    ],
  )
}

pub fn delete_item(
  program_id: &Pubkey,
  state_pubkey: &Pubkey,
  owner_pubkey: &Pubkey,
) -> Instruction {
  Instruction::new_with_borsh(
    *program_id,
    &DemoInstruction::DeleteItem,
    vec![
      AccountMeta::new(*state_pubkey, false),
      AccountMeta::new_readonly(*owner_pubkey, true),
    ],
  )
}
`

test('Rust interact parser derives Borsh methods, fields, CRUD groups, and account metas', () => {
  const parsed = parseRustProgramInterface([{ path: 'src/instruction.rs', content: SOURCE }])
  assert.equal(parsed.enumName, 'DemoInstruction')
  assert.equal(parsed.operations.length, 2)

  const create = parsed.operations[0]
  assert.equal(create?.variant, 'CreateItem')
  assert.equal(create?.functionName, 'create_item')
  assert.equal(create?.category, 'create')
  assert.equal(create?.supported, true)
  assert.deepEqual(create?.accounts, [
    { name: 'state', isSigner: false, isWritable: true, defaultAddress: null },
    { name: 'owner', isSigner: true, isWritable: false, defaultAddress: null },
    {
      name: 'system_program',
      isSigner: false,
      isWritable: false,
      defaultAddress: '11111111111111111111111111111111',
    },
  ])
  assert.deepEqual(
    create?.fields.map((field) => [field.name, field.kind, field.rustType]),
    [
      ['title', 'string', 'String'],
      ['amount', 'integer', 'u64'],
      ['owner', 'pubkey', 'Pubkey'],
    ],
  )

  const remove = parsed.operations[1]
  assert.equal(remove?.variantIndex, 1)
  assert.equal(remove?.category, 'delete')
})

test('Rust interact encoder emits Borsh enum tag and supported primitive payloads', () => {
  const parsed = parseRustProgramInterface([{ path: 'src/instruction.rs', content: SOURCE }])
  const create = parsed.operations[0]
  assert.ok(create)

  const owner = '11111111111111111111111111111111'
  const bytes = encodeRustOperation(create, {
    title: 'AEKO',
    amount: '513',
    owner,
  })
  assert.equal(bytes[0], 0)
  assert.deepEqual(Array.from(bytes.slice(1, 5)), [4, 0, 0, 0])
  assert.equal(new TextDecoder().decode(bytes.slice(5, 9)), 'AEKO')
  assert.deepEqual(Array.from(bytes.slice(9, 17)), [1, 2, 0, 0, 0, 0, 0, 0])
  assert.equal(bytes.length, 49)
})

test('Rust interact falls back safely when a Borsh interface is absent', () => {
  const parsed = parseRustProgramInterface([{
    path: 'src/lib.rs',
    content: 'pub fn process_instruction(instruction_data: &[u8]) { let _ = instruction_data; }',
  }])
  assert.equal(parsed.enumName, null)
  assert.deepEqual(parsed.operations, [])
  assert.deepEqual(Array.from(encodeRawInstruction('4145', 'hex')), [65, 69])
  assert.deepEqual(parseRawAccountMetas('11111111111111111111111111111111,true,false'), [{
    address: '11111111111111111111111111111111',
    isSigner: true,
    isWritable: false,
  }])
})
