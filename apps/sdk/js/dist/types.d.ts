export type PublicKeyString = string;
export type JsonRpcId = string | number;
export interface JsonRpcRequest<TParams = unknown> {
    jsonrpc: '2.0';
    id: JsonRpcId;
    method: string;
    params?: TParams;
}
export interface JsonRpcErrorShape {
    code: number;
    message: string;
    data?: unknown;
}
export interface JsonRpcResponse<TResult = unknown> {
    jsonrpc: '2.0';
    id: JsonRpcId;
    result?: TResult;
    error?: JsonRpcErrorShape;
}
export interface AccountInfoValue {
    data: [string, string] | string;
    executable: boolean;
    lamports: number;
    owner: PublicKeyString;
    rentEpoch?: number;
    space?: number;
}
export interface AccountInfoResponse {
    context?: {
        slot: number;
    };
    value: AccountInfoValue | null;
}
export interface ProgramAccount {
    pubkey: PublicKeyString;
    account: AccountInfoValue;
}
export interface TokenAccountOwnerResult {
    pubkey: PublicKeyString;
    account: AccountInfoValue;
}
export interface SignatureStatus {
    slot: number;
    confirmations: number | null;
    err: unknown;
    confirmationStatus?: 'processed' | 'confirmed' | 'finalized' | null;
}
export interface SignatureStatusesResponse {
    context?: {
        slot: number;
    };
    value: Array<SignatureStatus | null>;
}
export interface LatestBlockhashValue {
    blockhash: string;
    lastValidBlockHeight?: number;
}
export interface LatestBlockhashResponse {
    context?: {
        slot: number;
    };
    value?: LatestBlockhashValue;
    blockhash?: string;
}
export interface RpcAccountNotification {
    context: {
        slot: number;
    };
    value: AccountInfoValue;
}
