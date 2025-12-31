Send Transaction (Stateless)
const intent = {
  action: "SEND",
  to,
  amount,
  nonce
};

const sig = await wallet.sign(intent);
await client.submitSignedIntent(intent, sig);