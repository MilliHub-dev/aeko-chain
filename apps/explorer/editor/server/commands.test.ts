import assert from 'node:assert/strict'
import test from 'node:test'
import { availableCommands } from './commands.js'
test('Rust projects expose IDE quality and build operations',()=>{assert.deepEqual(availableCommands('rust-program').sort(),['build','check','clean','format','lint','test'])})
test('TypeScript projects expose Biome and typecheck operations',()=>{assert.deepEqual(availableCommands('typescript-client').sort(),['build','format','lint','run','test','typecheck']);assert.deepEqual(availableCommands('typescript-dapp').sort(),['build','clean','format','lint','test','typecheck']);assert.deepEqual(availableCommands('python-client').sort(),['run','test'])})
test('one-click tasks remain allowlisted',()=>{for(const template of ['rust-program','typescript-client','typescript-dapp','python-client'] as const){const commands=availableCommands(template) as string[];assert.equal(commands.includes('deploy'),false);assert.equal(commands.includes('shell'),false);assert.equal(commands.includes('terminal'),false)}})
