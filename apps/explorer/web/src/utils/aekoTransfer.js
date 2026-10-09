import {
  buildSignedLegacyTransaction,
  createSystemTransferInstruction,
  decodeBase58,
} from './aekoTransaction.js';
import { getSecretKeyBytes } from './aekoTestKeypair.js';

/**
 * Compatibility helper used by the existing Network Console.
 *
 * Transaction encoding and signing live in aekoTransaction.js so browser
 * transfers share one canonical legacy-transaction implementation.
 */
export function buildSignedTransfer({ fromWallet, toAddress, lamports, recentBlockhash }) {
  return buildSignedLegacyTransaction({
    feePayer: fromWallet,
    recentBlockhash,
    instructions: [
      createSystemTransferInstruction({
        from: fromWallet.address,
        to: toAddress,
        lamports,
      }),
    ],
  });
}

export function ensureSecretKeyMatchesAddress(wallet) {
  const secretKey = getSecretKeyBytes(wallet);
  const derived = secretKey.slice(32);
  const expected = decodeBase58(wallet.address);
  return derived.length === expected.length
    && derived.every((byte, index) => byte === expected[index]);
}
