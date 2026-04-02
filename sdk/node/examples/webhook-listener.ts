import { AekoNodeClient, watchAccountState, watchSignatureStatus } from '../src/index.js';

async function main() {
  const client = new AekoNodeClient('https://api.testnet.aeko.chain', {
    appName: 'aeko-webhook-worker',
  });

  const signatureWatcher = watchSignatureStatus(
    client,
    'ExampleSignature',
    (status) => {
      console.log('Signature status update:', status);
    },
    { intervalMs: 2_000 },
  );

  const accountWatcher = watchAccountState(
    client,
    'ExampleAccountPubkey',
    (account) => {
      console.log('Account state update:', account);
    },
    { intervalMs: 5_000 },
  );

  setTimeout(() => {
    signatureWatcher.stop();
    accountWatcher.stop();
    console.log('Watchers stopped.');
  }, 15_000);
}

void main();
