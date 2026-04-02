import type { AekoConnection } from '@aeko-chain/web3.js/connection';
import { type ConfirmedTransactionResult, type SendAndConfirmOptions } from '@aeko-chain/web3.js/transactions';
export interface ServerSideSigner {
    signPreparedTransaction(preparedTransactionBase64: string): Promise<string>;
}
export interface BatchSendResult {
    index: number;
    signature?: string;
    confirmed?: ConfirmedTransactionResult;
    error?: unknown;
}
export declare function signPreparedTransaction(signer: ServerSideSigner, preparedTransactionBase64: string): Promise<string>;
export declare function sendSignedTransactionBatch(connection: AekoConnection, signedTransactionsBase64: string[], options?: SendAndConfirmOptions): Promise<BatchSendResult[]>;
export declare function signAndSendPreparedTransactionBatch(connection: AekoConnection, signer: ServerSideSigner, preparedTransactionsBase64: string[], options?: SendAndConfirmOptions): Promise<BatchSendResult[]>;
