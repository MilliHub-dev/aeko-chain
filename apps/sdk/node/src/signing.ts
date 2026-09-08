import type { AekoConnection } from '@aeko-chain/web3.js/connection';
import {
  sendAndConfirmTransaction,
  type ConfirmedTransactionResult,
  type SendAndConfirmOptions,
} from '@aeko-chain/web3.js/transactions';

export interface ServerSideSigner {
  signPreparedTransaction(preparedTransactionBase64: string): Promise<string>;
}

export interface BatchSendResult {
  index: number;
  signature?: string;
  confirmed?: ConfirmedTransactionResult;
  error?: unknown;
}

export async function signPreparedTransaction(
  signer: ServerSideSigner,
  preparedTransactionBase64: string,
): Promise<string> {
  return signer.signPreparedTransaction(preparedTransactionBase64);
}

export async function sendSignedTransactionBatch(
  connection: AekoConnection,
  signedTransactionsBase64: string[],
  options: SendAndConfirmOptions = {},
): Promise<BatchSendResult[]> {
  const results: BatchSendResult[] = [];

  for (const [index, signedTransaction] of signedTransactionsBase64.entries()) {
    try {
      const confirmed = await sendAndConfirmTransaction(connection, signedTransaction, options);
      results.push({
        index,
        signature: confirmed.signature,
        confirmed,
      });
    } catch (error) {
      results.push({
        index,
        error,
      });
    }
  }

  return results;
}

export async function signAndSendPreparedTransactionBatch(
  connection: AekoConnection,
  signer: ServerSideSigner,
  preparedTransactionsBase64: string[],
  options: SendAndConfirmOptions = {},
): Promise<BatchSendResult[]> {
  const signedTransactions: string[] = [];
  for (const prepared of preparedTransactionsBase64) {
    signedTransactions.push(await signPreparedTransaction(signer, prepared));
  }
  return sendSignedTransactionBatch(connection, signedTransactions, options);
}
