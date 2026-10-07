import type { DevelopmentWallet } from './wallet'
import { encodeBase58, signMessage } from './wallet'

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111'

export interface TransactionAccountMeta {
  address: string
  isSigner?: boolean
  isWritable?: boolean
}

export interface TransactionInstruction {
  programId: string
  keys: TransactionAccountMeta[]
  data: Uint8Array
}

export function decodeBase58(value: string): Uint8Array {
  const input = String(value || '').trim()
  if (!input) throw new Error('Missing base58 value.')
  const bytes: number[] = []
  for (const character of input) {
    const index = ALPHABET.indexOf(character)
    if (index < 0) throw new Error(`Invalid base58 character "${character}".`)
    let carry = index
    for (let offset = 0; offset < bytes.length; offset += 1) {
      const next = (bytes[offset] ?? 0) * 58 + carry
      bytes[offset] = next & 0xff
      carry = next >> 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  for (let index = 0; index < input.length && input[index] === '1'; index += 1) bytes.push(0)
  const decoded = Uint8Array.from(bytes.reverse())
  if (decoded.length !== 32) throw new Error(`Expected a 32-byte public key, got ${decoded.length}.`)
  return decoded
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

export function encodeShortVec(value: number): Uint8Array {
  const output: number[] = []
  let remaining = value >>> 0
  do {
    let next = remaining & 0x7f
    remaining >>>= 7
    if (remaining) next |= 0x80
    output.push(next)
  } while (remaining)
  return Uint8Array.from(output)
}

export function encodeU32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  return bytes
}

export function encodeU64(value: number | bigint): Uint8Array {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function keyOf(bytes: Uint8Array): string { return Array.from(bytes).join(',') }

export function createSystemTransferInstruction({ from, to, lamports }: {
  from: string
  to: string
  lamports: number
}): TransactionInstruction {
  const amount = BigInt(lamports)
  if (amount <= 0n) throw new Error('Transfer amount must be greater than zero lamports.')
  return {
    programId: SYSTEM_PROGRAM_ID,
    keys: [
      { address: from, isSigner: true, isWritable: true },
      { address: to, isWritable: true },
    ],
    data: concatBytes(encodeU32(2), encodeU64(amount)),
  }
}

interface CompiledMeta {
  bytes: Uint8Array
  isSigner: boolean
  isWritable: boolean
}

function compileLegacyMessage({ feePayerAddress, recentBlockhash, instructions }: {
  feePayerAddress: string
  recentBlockhash: string
  instructions: TransactionInstruction[]
}): { message: Uint8Array; ordered: CompiledMeta[]; requiredSignatures: number } {
  if (!feePayerAddress) throw new Error('A fee payer address is required.')
  if (!instructions.length) throw new Error('At least one instruction is required.')

  const metas = new Map<string, CompiledMeta>()
  const merge = (address: string | Uint8Array, isSigner = false, isWritable = false) => {
    const bytes = typeof address === 'string' ? decodeBase58(address) : address
    const id = keyOf(bytes)
    const existing = metas.get(id)
    if (existing) {
      existing.isSigner ||= isSigner
      existing.isWritable ||= isWritable
      return
    }
    metas.set(id, { bytes, isSigner, isWritable })
  }

  const payerBytes = decodeBase58(feePayerAddress)
  merge(payerBytes, true, true)
  for (const instruction of instructions) {
    for (const account of instruction.keys) merge(account.address, Boolean(account.isSigner), Boolean(account.isWritable))
    merge(instruction.programId)
  }

  const payerKey = keyOf(payerBytes)
  const payer = metas.get(payerKey)
  if (!payer) throw new Error('Fee payer was not compiled into the transaction message.')
  metas.delete(payerKey)
  const remaining = Array.from(metas.values())
  const ordered = [
    payer,
    ...remaining.filter((item) => item.isSigner && item.isWritable),
    ...remaining.filter((item) => item.isSigner && !item.isWritable),
    ...remaining.filter((item) => !item.isSigner && item.isWritable),
    ...remaining.filter((item) => !item.isSigner && !item.isWritable),
  ]
  if (ordered.length > 256) throw new Error('Transaction contains too many account keys.')

  const requiredSignatures = ordered.filter((item) => item.isSigner).length
  const readonlySigned = ordered.filter((item) => item.isSigner && !item.isWritable).length
  const readonlyUnsigned = ordered.filter((item) => !item.isSigner && !item.isWritable).length
  const indices = new Map(ordered.map((item, index) => [keyOf(item.bytes), index]))
  const compiled = instructions.map((instruction) => {
    const accountIndices = instruction.keys.map((account) => {
      const index = indices.get(keyOf(decodeBase58(account.address)))
      if (index === undefined) throw new Error(`Instruction account ${account.address} is missing.`)
      return index
    })
    const programIndex = indices.get(keyOf(decodeBase58(instruction.programId)))
    if (programIndex === undefined) throw new Error(`Program ${instruction.programId} is missing.`)
    return concatBytes(
      Uint8Array.from([programIndex]),
      encodeShortVec(accountIndices.length),
      Uint8Array.from(accountIndices),
      encodeShortVec(instruction.data.length),
      instruction.data,
    )
  })

  return {
    ordered,
    requiredSignatures,
    message: concatBytes(
      Uint8Array.from([requiredSignatures, readonlySigned, readonlyUnsigned]),
      encodeShortVec(ordered.length),
      ...ordered.map((item) => item.bytes),
      decodeBase58(recentBlockhash),
      encodeShortVec(compiled.length),
      ...compiled,
    ),
  }
}

export function buildLegacyMessageBase64(input: {
  feePayerAddress: string
  recentBlockhash: string
  instructions: TransactionInstruction[]
}): string {
  return bytesToBase64(compileLegacyMessage(input).message)
}

export async function buildSignedLegacyTransaction({
  feePayer,
  recentBlockhash,
  instructions,
}: {
  feePayer: DevelopmentWallet
  recentBlockhash: string
  instructions: TransactionInstruction[]
}): Promise<string> {
  const compiled = compileLegacyMessage({ feePayerAddress: feePayer.address, recentBlockhash, instructions })
  if (compiled.requiredSignatures !== 1 || encodeBase58(compiled.ordered[0]?.bytes ?? new Uint8Array()) !== feePayer.address) {
    throw new Error('This browser transaction requires unsupported additional signers.')
  }
  const signature = await signMessage(feePayer, compiled.message)
  if (signature.length !== 64) throw new Error('Ed25519 signing did not return a 64-byte signature.')
  const transaction = concatBytes(encodeShortVec(1), signature, compiled.message)
  if (transaction.length > 1232) throw new Error(`Transaction is ${transaction.length} bytes; AEKO legacy transactions must fit within 1232 bytes.`)
  return bytesToBase64(transaction)
}
