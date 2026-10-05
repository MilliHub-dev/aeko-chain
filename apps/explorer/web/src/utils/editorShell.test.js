import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeEditorShellCommand,
  getEditorShellSuggestions,
  parseEditorShellCommand,
  tokenizeEditorShell,
} from '../features/editor/shell/commands.js';
import { encodeBase58 } from './aekoTransaction.js';
import { generateTestWallet } from './aekoTestKeypair.js';

const wallet = generateTestWallet('shell');
const context = {
  network: 'testnet',
  rpcUrl: 'https://rpc.example.invalid',
  wallet,
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
  assert.deepEqual(
    getEditorShellSuggestions('tra').map((item) => item.name),
    ['transfer'],
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

  const result = await executeEditorShellCommand(
    'balance',
    context,
    fakeClient,
  );

  assert.equal(result.kind, 'output');
  assert.match(result.lines.join('\n'), /2\.5 AEKO/);
  assert.deepEqual(calls, [[
    'balance',
    'https://rpc.example.invalid',
    wallet.address,
  ]]);
});

test('transfer command prepares review data without signing or submitting', async () => {
  const recipient = encodeBase58(new Uint8Array(32).fill(7));
  const recentBlockhash = encodeBase58(new Uint8Array(32).fill(8));
  const calls = [];
  const fakeClient = {
    getBalance: async () => 5_000_000_000,
    getLatestBlockhash: async () => recentBlockhash,
    getFeeForMessage: async (_rpcUrl, messageBase64) => {
      calls.push(['fee', messageBase64]);
      return 5000;
    },
    sendTransaction: async () => {
      calls.push(['send']);
      return 'must-not-send';
    },
  };

  const result = await executeEditorShellCommand(
    'aeko transfer ' + recipient + ' 1.25',
    context,
    fakeClient,
  );

  assert.equal(result.kind, 'transaction_request');
  assert.equal(result.transaction.type, 'transfer');
  assert.equal(result.transaction.from, wallet.address);
  assert.equal(result.transaction.to, recipient);
  assert.equal(result.transaction.amountLamports, 1_250_000_000);
  assert.equal(result.transaction.feeLamports, 5000);
  assert.equal(calls.some(([kind]) => kind === 'send'), false);
});

test('operating-system and incomplete transaction commands fail closed', async () => {
  const osCommand = await executeEditorShellCommand(
    'bash -c "echo nope"',
    context,
    {},
  );
  assert.equal(osCommand.kind, 'error');
  assert.match(
    osCommand.lines[0],
    /never forwards input to Bash/,
  );

  const programCommand = await executeEditorShellCommand(
    'program deploy ./out.so',
    context,
    {},
  );
  assert.equal(programCommand.kind, 'error');
  assert.match(
    programCommand.lines[0],
    /not enabled in the structured editor shell yet/,
  );
});
