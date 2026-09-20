import assert from 'node:assert/strict';
import test from 'node:test';
import { signPreparedTransactionWithTestWallet } from './aekoPreparedTransaction.js';
import { encodeBase58, generateTestWallet } from './aekoTestKeypair.js';
import { buildPreparedToken721Transaction } from './nftTransactionBuilder.js';

function key(fill) {
  return encodeBase58(Uint8Array.from({ length: 32 }, () => fill));
}

test('browser test-wallet signer replaces the prepared zero signature without changing the message', () => {
  const wallet = generateTestWallet('prepared signer');
  const prepared = buildPreparedToken721Transaction({
    payer: wallet.address,
    recentBlockhash: key(61),
    action: 'freeze',
    collection: key(62),
    token: key(63),
    authority: wallet.address,
    owner: wallet.address,
    recipient: key(64),
    tokenId: 1,
    royaltyBps: 0,
    metadata: {
      name: 'Prepared NFT',
      description: null,
      uri: 'https://example.test/nft.json',
      imageUri: null,
      attributes: [],
    },
  });

  const fromBase64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const preparedBytes = fromBase64(prepared);
  const signed = signPreparedTransactionWithTestWallet(wallet, prepared);
  const signedBytes = fromBase64(signed);

  assert.equal(preparedBytes[0], 1);
  assert.equal(signedBytes[0], 1);
  assert.deepEqual(signedBytes.slice(65), preparedBytes.slice(65));
  assert.equal(preparedBytes.slice(1, 65).every((byte) => byte === 0), true);
  assert.equal(signedBytes.slice(1, 65).some((byte) => byte !== 0), true);
});
