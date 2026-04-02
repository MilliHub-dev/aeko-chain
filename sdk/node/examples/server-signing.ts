import {
  AekoNodeClient,
  type ServerSideSigner,
  signAndSendPreparedTransactionBatch,
} from '../src/index.js';

class ExampleSigner implements ServerSideSigner {
  async signPreparedTransaction(preparedTransactionBase64: string): Promise<string> {
    return preparedTransactionBase64;
  }
}

async function main() {
  const client = new AekoNodeClient('https://api.testnet.aeko.chain', {
    appName: 'aeko-backend',
  });

  const results = await signAndSendPreparedTransactionBatch(
    client,
    new ExampleSigner(),
    ['PreparedTransactionBase64'],
  );

  console.log(results);
}

void main();
