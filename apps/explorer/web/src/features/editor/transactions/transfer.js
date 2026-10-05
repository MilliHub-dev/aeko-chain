import {
  confirmSignature,
  formatAeko,
  getBalance,
  getFeeForMessage,
  getLatestBlockhash,
  sendTransaction,
} from '../../../utils/aekoRpcClient.js';
import {
  buildLegacyMessageBase64,
  buildSignedLegacyTransaction,
  createSystemTransferInstruction,
  decodeBase58,
} from '../../../utils/aekoTransaction.js';

const LAMPORTS_PER_AEKO = 1_000_000_000n;
const MAX_SAFE_LAMPORTS = BigInt(Number.MAX_SAFE_INTEGER);

const DEFAULT_CLIENT = Object.freeze({
  confirmSignature,
  getBalance,
  getFeeForMessage,
  getLatestBlockhash,
  sendTransaction,
});

function requireTransactionContext(context) {
  const rpcUrl = String(context?.rpcUrl || '').trim();
  if (!rpcUrl) {
    throw new Error('The selected network does not have an RPC endpoint configured.');
  }
  if (!context?.wallet?.address || !context?.wallet?.secretKeyB64) {
    throw new Error('Create or select a browser-local development wallet before sending AEKO.');
  }
  return {
    rpcUrl,
    wallet: context.wallet,
    network: String(context.network || 'unknown'),
  };
}

function parseAekoAmount(rawAmount) {
  const value = String(rawAmount || '').trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,9}))?$/.exec(value);
  if (!match) {
    throw new Error('Transfer amount must be a positive AEKO decimal with at most 9 decimal places.');
  }

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] || '').padEnd(9, '0') || '0');
  const lamports = (whole * LAMPORTS_PER_AEKO) + fraction;
  if (lamports <= 0n) {
    throw new Error('Transfer amount must be greater than zero AEKO.');
  }
  if (lamports > MAX_SAFE_LAMPORTS) {
    throw new Error('Transfer amount is too large for the browser transaction builder.');
  }

  const trimmedFraction = (match[2] || '').replace(/0+$/, '');
  return {
    amountAeko: trimmedFraction ? match[1] + '.' + trimmedFraction : match[1],
    lamports: Number(lamports),
  };
}

export function parseEditorTransferArgs(args) {
  if (!Array.isArray(args) || args.length !== 2) {
    throw new Error('Usage: transfer <recipient> <amount-aeko>');
  }

  const recipient = String(args[0] || '').trim();
  try {
    decodeBase58(recipient);
  } catch {
    throw new Error('Transfer recipient must be a valid AEKO public key.');
  }

  return {
    recipient,
    ...parseAekoAmount(args[1]),
  };
}

async function loadTransferSnapshot({ rpcUrl, from, to, lamports }, client) {
  const [balanceLamports, recentBlockhash] = await Promise.all([
    client.getBalance(rpcUrl, from),
    client.getLatestBlockhash(rpcUrl),
  ]);
  if (!recentBlockhash) {
    throw new Error('RPC did not return a recent blockhash.');
  }

  const instruction = createSystemTransferInstruction({
    from,
    to,
    lamports,
  });
  const messageBase64 = buildLegacyMessageBase64({
    feePayerAddress: from,
    recentBlockhash,
    instructions: [instruction],
  });
  const feeLamports = await client.getFeeForMessage(rpcUrl, messageBase64);
  const totalLamports = lamports + feeLamports;
  if (!Number.isSafeInteger(totalLamports)) {
    throw new Error('Transfer total exceeds the browser transaction builder limit.');
  }

  return {
    balanceLamports,
    recentBlockhash,
    instruction,
    feeLamports,
    totalLamports,
  };
}

function requireSpendableBalance(snapshot) {
  if (snapshot.balanceLamports < snapshot.totalLamports) {
    throw new Error(
      'Insufficient balance. Transfer plus network fee requires '
        + formatAeko(snapshot.totalLamports)
        + ', but the selected wallet has '
        + formatAeko(snapshot.balanceLamports)
        + '.',
    );
  }
}

export async function prepareEditorTransfer(args, context, client = DEFAULT_CLIENT) {
  const { rpcUrl, wallet, network } = requireTransactionContext(context);
  const parsed = parseEditorTransferArgs(args);
  const snapshot = await loadTransferSnapshot({
    rpcUrl,
    from: wallet.address,
    to: parsed.recipient,
    lamports: parsed.lamports,
  }, client);
  requireSpendableBalance(snapshot);

  return {
    kind: 'transaction_request',
    transaction: {
      type: 'transfer',
      network,
      from: wallet.address,
      to: parsed.recipient,
      amountAeko: parsed.amountAeko,
      amountLamports: parsed.lamports,
      feeLamports: snapshot.feeLamports,
      totalLamports: snapshot.totalLamports,
      balanceLamports: snapshot.balanceLamports,
    },
  };
}

export async function executeEditorTransfer(transaction, context, client = DEFAULT_CLIENT) {
  const { rpcUrl, wallet, network } = requireTransactionContext(context);
  const onProgress = typeof context?.onProgress === 'function'
    ? context.onProgress
    : () => {};

  if (transaction?.type !== 'transfer') {
    throw new Error('Unsupported editor transaction request.');
  }
  if (
    !Number.isSafeInteger(transaction.amountLamports)
    || transaction.amountLamports <= 0
    || !Number.isSafeInteger(transaction.feeLamports)
    || transaction.feeLamports < 0
  ) {
    throw new Error('Reviewed transfer payload is invalid. Run the transfer command again.');
  }
  try {
    decodeBase58(transaction.from);
    decodeBase58(transaction.to);
  } catch {
    throw new Error('Reviewed transfer contains an invalid AEKO public key.');
  }
  if (network !== transaction.network) {
    throw new Error('Selected network changed after review. Run the transfer command again.');
  }
  if (wallet.address !== transaction.from) {
    throw new Error('Selected wallet changed after review. Run the transfer command again.');
  }

  onProgress('Rechecking wallet balance and network fee…');
  const snapshot = await loadTransferSnapshot({
    rpcUrl,
    from: transaction.from,
    to: transaction.to,
    lamports: transaction.amountLamports,
  }, client);

  if (snapshot.feeLamports > transaction.feeLamports) {
    throw new Error('Network fee changed after review. Run the transfer command again to review the new fee.');
  }
  requireSpendableBalance(snapshot);

  onProgress('Signing reviewed transaction with the selected browser-local wallet…');
  const signedTransaction = buildSignedLegacyTransaction({
    feePayer: wallet,
    recentBlockhash: snapshot.recentBlockhash,
    instructions: [snapshot.instruction],
  });

  onProgress('Submitting signed transaction to the selected AEKO RPC…');
  const signature = await client.sendTransaction(rpcUrl, signedTransaction);

  try {
    onProgress('Submitted ' + signature + '; waiting for confirmed chain status…');
    const status = await client.confirmSignature(rpcUrl, signature, {
      attempts: 40,
      intervalMs: 750,
    });
    return {
      type: 'transfer',
      signature,
      status,
      from: transaction.from,
      to: transaction.to,
      amountLamports: transaction.amountLamports,
      feeLamports: snapshot.feeLamports,
    };
  } catch (cause) {
    const error = cause instanceof Error
      ? cause
      : new Error(String(cause || 'Transaction confirmation failed.'));
    throw Object.assign(error, { submittedSignature: signature });
  }
}
