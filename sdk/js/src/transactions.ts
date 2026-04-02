import { AekoConnection } from './connection';

export interface ConfirmTransactionOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  requireFinalized?: boolean;
}

export interface SendAndConfirmOptions extends ConfirmTransactionOptions {
  skipPreflight?: boolean;
  preflightCommitment?: 'processed' | 'confirmed' | 'finalized';
}

export interface ConfirmedTransactionResult {
  signature: string;
  confirmationStatus: 'processed' | 'confirmed' | 'finalized' | null;
  slot: number | null;
  err: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForSignatureConfirmation(
  connection: AekoConnection,
  signature: string,
  options: ConfirmTransactionOptions = {},
): Promise<ConfirmedTransactionResult> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const [status] = await connection.getSignatureStatuses([signature]);
    if (status) {
      const confirmed =
        status.err !== null ||
        status.confirmationStatus === 'confirmed' ||
        status.confirmationStatus === 'finalized';
      const finalized = status.confirmationStatus === 'finalized';

      if (confirmed && (!options.requireFinalized || finalized)) {
        return {
          signature,
          confirmationStatus: status.confirmationStatus ?? null,
          slot: status.slot ?? null,
          err: status.err,
        };
      }
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(`Timed out while waiting for signature ${signature} to confirm.`);
}

export async function sendAndConfirmTransaction(
  connection: AekoConnection,
  signedTransactionBase64: string,
  options: SendAndConfirmOptions = {},
): Promise<ConfirmedTransactionResult> {
  const signature = await connection.sendTransaction(signedTransactionBase64, {
    skipPreflight: options.skipPreflight,
    preflightCommitment: options.preflightCommitment,
  });

  return waitForSignatureConfirmation(connection, signature, options);
}
