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
export declare function waitForSignatureConfirmation(connection: AekoConnection, signature: string, options?: ConfirmTransactionOptions): Promise<ConfirmedTransactionResult>;
export declare function sendAndConfirmTransaction(connection: AekoConnection, signedTransactionBase64: string, options?: SendAndConfirmOptions): Promise<ConfirmedTransactionResult>;
