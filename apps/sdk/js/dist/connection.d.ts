import type { AccountInfoResponse, JsonRpcId, ProgramAccount, PublicKeyString, RpcAccountNotification, SignatureStatusesResponse, TokenAccountOwnerResult } from './types';
export interface AekoConnectionOptions {
    fetchImpl?: typeof fetch;
    websocketFactory?: (url: string) => WebSocket;
    defaultCommitment?: 'processed' | 'confirmed' | 'finalized';
}
export interface SendTransactionOptions {
    encoding?: 'base64';
    skipPreflight?: boolean;
    preflightCommitment?: 'processed' | 'confirmed' | 'finalized';
}
export declare class AekoRpcError extends Error {
    readonly code?: number | undefined;
    readonly data?: unknown | undefined;
    constructor(message: string, code?: number | undefined, data?: unknown | undefined);
}
export declare class AekoConnection {
    readonly endpoint: string;
    readonly websocketEndpoint: string;
    private readonly fetchImpl;
    private readonly websocketFactory?;
    private readonly defaultCommitment;
    constructor(endpoint: string, options?: AekoConnectionOptions);
    rpc<TResult = unknown, TParams = unknown>(method: string, params?: TParams, id?: JsonRpcId): Promise<TResult>;
    getLatestBlockhash(): Promise<string>;
    getBalance(address: PublicKeyString): Promise<number>;
    getAccountInfo(address: PublicKeyString): Promise<AccountInfoResponse['value']>;
    getProgramAccounts(programId: PublicKeyString): Promise<ProgramAccount[]>;
    getTokenAccountsByOwner(owner: PublicKeyString, filter: {
        mint?: PublicKeyString;
        programId?: PublicKeyString;
    }): Promise<TokenAccountOwnerResult[]>;
    sendTransaction(signedTransactionBase64: string, options?: SendTransactionOptions): Promise<string>;
    getSignatureStatuses(signatures: string[]): Promise<SignatureStatusesResponse['value']>;
    subscribeAccount(address: PublicKeyString, onMessage: (notification: RpcAccountNotification) => void): {
        unsubscribe: () => void;
    };
}
