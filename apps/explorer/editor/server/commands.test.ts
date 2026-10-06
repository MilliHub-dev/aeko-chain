import assert from 'node:assert/strict'
import test from 'node:test'
import { availableCommands } from './commands.js'
test('Rust smart-contract projects expose project-scoped build operations',()=>{assert.deepEqual(availableCommands('rust-program').sort(),['build','clean','test'])})
test('client and DApp templates expose supported actions',()=>{assert.deepEqual(availableCommands('typescript-client').sort(),['build','run','test']);assert.deepEqual(availableCommands('typescript-dapp').sort(),['build','clean','run','test']);assert.deepEqual(availableCommands('python-client').sort(),['run','test'])})
test('one-click AEKO tasks do not smuggle arbitrary shell actions',()=>{for(const template of ['rust-program','typescript-client','typescript-dapp','python-client'] as const){const commands=availableCommands(template) as string[];assert.equal(commands.includes('deploy'),false);assert.equal(commands.includes('shell'),false);assert.equal(commands.includes('terminal'),false)}})
