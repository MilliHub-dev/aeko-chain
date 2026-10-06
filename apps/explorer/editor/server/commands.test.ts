import assert from 'node:assert/strict'
import test from 'node:test'
import { availableCommands } from './commands.js'

test('Rust smart-contract projects expose only project-scoped build operations', () => {
  assert.deepEqual(availableCommands('rust-program').sort(), ['build', 'clean', 'test'])
})

test('DApp client templates expose only supported actions', () => {
  assert.deepEqual(availableCommands('typescript-client').sort(), ['build', 'run', 'test'])
  assert.deepEqual(availableCommands('python-client').sort(), ['run', 'test'])
})

test('AEKO Console does not expose deploy or an arbitrary shell action', () => {
  for (const template of ['rust-program', 'typescript-client', 'python-client'] as const) {
    const commands = availableCommands(template) as string[]
    assert.equal(commands.includes('deploy'), false)
    assert.equal(commands.includes('shell'), false)
    assert.equal(commands.includes('terminal'), false)
  }
})
