import { AekoNodeClient } from './client.js';
import { type AnchorPostTransactionInput, type CanonicalPostPayloadInput, type PublicKeyString } from './socialPosts.js';
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
export interface HashPostRequest {
    content: string;
    metadata: JsonValue;
    canonicalPayload: CanonicalPostPayloadInput;
}
export interface VerifyPostRequest {
    payload: string;
    signer: PublicKeyString;
    signature: string;
    signatureEncoding?: 'base64' | 'hex' | 'base58';
}
export interface AnchorPostRequest {
    anchor: AnchorPostTransactionInput;
    signedTransactionBase64?: string;
}
export type ApiErrorCode = 'not_found' | 'bad_request' | 'invalid_signature' | 'invalid_payload' | 'rpc_submission_failed';
export interface StoredVerificationRecord {
    postId: string;
    creator: PublicKeyString;
    payload?: string;
    payloadHashHex?: string;
    payloadHashBase58?: string;
    contentHashHex?: string;
    contentHashBase58?: string;
    metadataHashHex?: string;
    metadataHashBase58?: string;
    signatureValid?: boolean;
    signer?: PublicKeyString;
    verificationMode?: 'backend-only' | 'anchored-reference' | 'onchain-verified';
    anchorStatus: 'draft' | 'hashed' | 'signed' | 'verified' | 'anchor_pending' | 'anchored' | 'anchor_failed';
    preparedTransactionBase64?: string;
    anchorTransactionSignature?: string;
    lastErrorCode?: ApiErrorCode;
    lastErrorMessage?: string;
    updatedAtUnix: number;
}
export interface PostVerificationStore {
    get(postId: string): Promise<StoredVerificationRecord | null>;
    upsert(postId: string, patch: Partial<StoredVerificationRecord> & Pick<StoredVerificationRecord, 'postId' | 'creator'>): Promise<StoredVerificationRecord>;
}
export declare class JsonFilePostVerificationStore implements PostVerificationStore {
    private readonly filePath;
    constructor(filePath: string);
    get(postId: string): Promise<StoredVerificationRecord | null>;
    upsert(postId: string, patch: Partial<StoredVerificationRecord> & Pick<StoredVerificationRecord, 'postId' | 'creator'>): Promise<StoredVerificationRecord>;
    private loadStore;
    private saveStore;
}
export declare class SocialBackendError extends Error {
    readonly code: ApiErrorCode;
    readonly statusCode: number;
    readonly extra?: Record<string, unknown> | undefined;
    constructor(code: ApiErrorCode, message: string, statusCode: number, extra?: Record<string, unknown> | undefined);
}
export declare class SocialPostVerificationService {
    private readonly client;
    private readonly store;
    constructor(client: AekoNodeClient, store: PostVerificationStore);
    hashPost(request: HashPostRequest): Promise<{
        payload: string;
        payloadHashHex: string;
        payloadHashBase58: string;
        contentHashHex: string;
        contentHashBase58: string;
        metadataHashHex: string;
        metadataHashBase58: string;
        verificationRecord: StoredVerificationRecord;
    }>;
    verifyPost(request: VerifyPostRequest): Promise<{
        signatureValid: true;
        signer: string;
        errorCode: null;
        verificationRecord: StoredVerificationRecord | null;
    }>;
    submitAnchor(request: AnchorPostRequest): Promise<{
        mode: "prepared";
        preparedTransactionBase64: string;
        verificationRecord: StoredVerificationRecord;
        transactionSignature?: undefined;
    } | {
        mode: "submitted";
        transactionSignature: string;
        preparedTransactionBase64: string;
        verificationRecord: StoredVerificationRecord;
    }>;
    getVerification(postId: string): Promise<StoredVerificationRecord>;
}
