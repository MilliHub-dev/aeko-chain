import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeEditorTransfer,
  parseEditorTransferArgs,
  prepareEditorTransfer,
} from '../features/editor/transactions/transfer.js';
import { encodeBase58 } from './aekoTransaction.js';
import { generateTestWallet } from './aekoTestKeypair.js';

const sender = generateTestWallet('sender');
const recipient = encodeBase58(new Uint8Array(32).fill(7));
const blockhash = encodeBase58(new Uint8Array(32).fill(8));
const context = {
  network: 'testnet',
  rpcUrl: 'https://rpc.example.invalid',
  wallet: sender,
};

function planningClient({
  balance = 2_000_000_000,
  fee = 5000,
} = {}) {
  return {
    getBalance: async () => balance,
    getLatestBlockhash: async () => blockhash,
    getFeeForMessage: async () => fee,
  };
}

test('transfer argument parsing is exact to AEKO lamport precision', () => {
  assert.deepEqual(
    parseEditorTransferArgs([recipient, '1.000000001']),
    {
      recipient,
      amountAeko: '1.000000001',
      lamports: 1_000_000_001,
    },
  );
  assert.throws(
    () => parseEditorTransferArgs([recipient, '0.0000000001']),
    /at most 9 decimal places/,
  );
  assert.throws(
    () => parseEditorTransferArgs(['not-a-key', '1']),
    /valid AEKO public key/,
  );
});

test('preparing a transfer reads balance and fee but never submits', async () => {
  let sent = false;
  const result = await prepareEditorTransfer(
    [recipient, '1.5'],
    context,
    {
      ...planningClient({ balance: 4_000_000_000 }),
      getFeeForMessage: async (_rpcUrl, messageBase64) => {
        assert.equal(typeof messageBase64, 'string');
        assert.ok(messageBase64.length > 20);
        return 5000;
      },
      sendTransaction: async () => {
        sent = true;
        return 'unexpected';
      },
    },
  );

  assert.equal(result.kind, 'transaction_request');
  assert.equal(result.transaction.amountLamports, 1_500_000_000);
  assert.equal(result.transaction.totalLamports, 1_500_005_000);
  assert.equal(sent, false);
});

test('preparing a transfer fails before review when amount plus fee is not spendable', async () => {
  await assert.rejects(
    prepareEditorTransfer(
      [recipient, '1'],
      context,
      planningClient({
        balance: 1_000_004_999,
        fee: 5000,
      }),
    ),
    /Insufficient balance/,
  );
});

test('approved transfer signs locally, submits once, and waits for confirmation', async () => {
  const review = await prepareEditorTransfer(
    [recipient, '1'],
    context,
    planningClient(),
  );
  let submitted = 0;
  const progress = [];

  const result = await executeEditorTransfer(
    review.transaction,
    {
      ...context,
      onProgress: (message) => progress.push(message),
    },
    {
      ...planningClient(),
      sendTransaction: async (_rpcUrl, signedTransaction) => {
        submitted += 1;
        assert.equal(typeof signedTransaction, 'string');
        assert.ok(signedTransaction.length > 40);
        return 'signature-confirmed';
      },
      confirmSignature: async (_rpcUrl, signature) => {
        assert.equal(signature, 'signature-confirmed');
        return {
          confirmationStatus: 'confirmed',
          slot: 4242,
        };
      },
    },
  );

  assert.equal(submitted, 1);
  assert.equal(result.signature, 'signature-confirmed');
  assert.equal(result.status.slot, 4242);
  assert.deepEqual(
    progress.map((message) => message.split(' ')[0]),
    ['Rechecking', 'Signing', 'Submitting', 'Submitted'],
  );
});

test('approved transfer requires re-review when network or wallet changes', async () => {
  const review = await prepareEditorTransfer(
    [recipient, '1'],
    context,
    planningClient(),
  );
  let submitted = false;
  const executionClient = {
    ...planningClient(),
    sendTransaction: async () => {
      submitted = true;
      return 'unexpected';
    },
    confirmSignature: async () => ({
      confirmationStatus: 'confirmed',
    }),
  };

  await assert.rejects(
    executeEditorTransfer(
      review.transaction,
      { ...context, network: 'mainnet' },
      executionClient,
    ),
    /network changed after review/,
  );

  await assert.rejects(
    executeEditorTransfer(
      review.transaction,
      {
        ...context,
        wallet: generateTestWallet('other'),
      },
      executionClient,
    ),
    /wallet changed after review/,
  );

  assert.equal(submitted, false);
});

test('approved transfer requires re-review if the network fee increases', async () => {
  const review = await prepareEditorTransfer(
    [recipient, '1'],
    context,
    planningClient({ fee: 5000 }),
  );
  let submitted = false;

  await assert.rejects(
    executeEditorTransfer(
      review.transaction,
      context,
      {
        ...planningClient({ fee: 6000 }),
        sendTransaction: async () => {
          submitted = true;
          return 'unexpected';
        },
        confirmSignature: async () => ({
          confirmationStatus: 'confirmed',
        }),
      },
    ),
    /fee changed after review/,
  );

  assert.equal(submitted, false);
});

test('confirmation timeout preserves the submitted signature to prevent blind resubmission', async () => {
  const review = await prepareEditorTransfer(
    [recipient, '1'],
    context,
    planningClient(),
  );

  await assert.rejects(
    executeEditorTransfer(
      review.transaction,
      context,
      {
        ...planningClient(),
        sendTransaction: async () => 'signature-pending',
        confirmSignature: async () => {
          throw new Error('confirmation timeout');
        },
      },
    ),
    (error) => {
      assert.equal(
        error.submittedSignature,
        'signature-pending',
      );
      return true;
    },
  );
});

test('execution rejects malformed reviewed payloads before RPC or signing', async () => {
  let rpcTouched = false;
  await assert.rejects(
    executeEditorTransfer(
      {
        type: 'transfer',
        network: 'testnet',
        from: sender.address,
        to: recipient,
        amountLamports: -1,
        feeLamports: 5000,
      },
      context,
      {
        getBalance: async () => {
          rpcTouched = true;
          return 2_000_000_000;
        },
      },
    ),
    /Reviewed transfer payload is invalid/,
  );
  assert.equal(rpcTouched, false);
});
