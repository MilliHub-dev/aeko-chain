export type PublicKeyString = string;
export type SocialPostKind = 'original' | 'reply' | 'repost' | 'quote';
export type SocialVisibilityClass = 'public' | 'followersOnly' | 'permissioned' | 'paid';
export interface CanonicalPostPayloadInput {
    version?: number;
    postId: string;
    creator: PublicKeyString;
    contentHash: string;
    metadataHash: string;
    contentUri: string;
    parentPostId?: string | null;
    postKind: SocialPostKind;
    createdAtUnix: number;
    visibility: SocialVisibilityClass;
}
export interface VerifiedPostEnvelopeInput {
    signer: PublicKeyString;
    payload: string | Uint8Array;
    signature: string | Uint8Array;
    signatureEncoding?: 'base64' | 'hex' | 'base58';
}
export interface AnchorPostTransactionInput {
    payer: PublicKeyString;
    recentBlockhash: PublicKeyString;
    stateAccount: PublicKeyString;
    creator: PublicKeyString;
    postId: string;
    contentHash: string;
    metadataHash: string;
    contentUri: string;
    parentPostId?: string | null;
    postKind: SocialPostKind;
    createdAtUnix: number;
    visibility: SocialVisibilityClass;
    signatureRef?: string | null;
}
export interface PostHashBundle {
    contentHashHex: string;
    contentHashBase58: string;
    metadataHashHex: string;
    metadataHashBase58: string;
    payloadHashHex: string;
    payloadHashBase58: string;
    payloadBytes: Uint8Array;
}
export declare function socialPostsProgramId(): PublicKeyString;
export declare function buildCanonicalPostPayload(input: CanonicalPostPayloadInput): string;
export declare function serializeCanonicalPostPayload(input: CanonicalPostPayloadInput): Uint8Array;
export declare function sha256Bytes(input: string | Uint8Array): Uint8Array;
export declare function sha256Hex(input: string | Uint8Array): string;
export declare function buildPostHashBundle(input: {
    content: string | Uint8Array;
    metadata: string | Uint8Array;
    canonicalPayload: CanonicalPostPayloadInput;
}): PostHashBundle;
export declare function verifyPostSignature(input: VerifiedPostEnvelopeInput): boolean;
export declare function buildPreparedAnchorPostTransaction(input: AnchorPostTransactionInput): string;
