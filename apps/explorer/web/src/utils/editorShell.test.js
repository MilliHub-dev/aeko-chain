import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeEditorShellCommand,
  getEditorShellSuggestions,
  parseEditorShellCommand,
  tokenizeEditorShell,
} from './editorShell.js';

const context = {
  network: 'testnet',
  rpcUrl: 'https://rpc.example.invalid',
  wallet: { address: 'Wallet111111111111111111111111111111111' },
  history: ['network', 'balance'],
};

test('editor shell tokenizes quoted arguments without evaluating shell syntax', () => {
  assert.deepEqual(
    tokenizeEditorShell('aeko account "Address With Spaces"'),
    ['aeko', 'account', 'Address With Spaces'],
  );
  assert.throws(() => tokenizeEditorShell('account "unterminated'));
});

test('editor shell accepts optional aeko prefix and aliases', () => {
  assert.deepEqual(
    parseEditorShellCommand('aeko epoch'),
    { command: 'epoch-info', args: [] },
  );
});

test('editor shell suggestions are command-manifest driven', () => {
  assert.deepEqual(
    getEditorShellSuggestions('aeko val').map((item) => item.name),
    ['validators'],
  );
});

test('read commands use structured RPC functions instead of shell execution', async () => {
  const calls = [];
  const fakeClient = {
    getBalance: async (rpcUrl, address) => {
      calls.push(['balance', rpcUrl, address]);
      return 2_500_000_000;
    },
  };

  const result = await executeEditorShellCommand('balance', context, fakeClient);
  assert.equal(result.kind, 'output');
  assert.match(result.lines.join('\n'), /2\.5 AEKO/);
  assert.deepEqual(calls, [[
    'balance',
    'https://rpc.example.invalid',
    'Wallet111111111111111111111111111111111',
  ]]);
});

test('operating-system and transaction commands fail closed', async () => {
  const osCommand = await executeEditorShellCommand('bash -c "echo nope"', context, {});
  assert.equal(osCommand.kind, 'error');
  assert.match(osCommand.lines[0], /never forwards input to Bash/);

  const transactionCommand = await executeEditorShellCommand('program deploy ./out.so', context, {});
  assert.equal(transactionCommand.kind, 'error');
  assert.match(transactionCommand.lines[0], /not enabled in the read-only editor shell/);
});
