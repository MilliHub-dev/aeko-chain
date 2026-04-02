import { AekoConnection } from '../src/index';

async function main() {
  const connection = new AekoConnection('https://api.testnet.aeko.chain', {
    websocketFactory: (url) => new WebSocket(url),
  });

  const subscription = connection.subscribeAccount('ExampleAccountPubkey', (notification) => {
    console.log('Account update received:', notification);
  });

  console.log('Watching account updates. Call unsubscribe() when done.');

  setTimeout(() => {
    subscription.unsubscribe();
    console.log('Subscription closed.');
  }, 10_000);
}

void main();
