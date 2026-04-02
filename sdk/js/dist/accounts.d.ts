import { AekoConnection } from './connection';
import type { AccountInfoValue, ProgramAccount, PublicKeyString, TokenAccountOwnerResult } from './types';
export interface MetadataAttribute {
    traitType: string;
    value: string;
}
export interface Token721Metadata {
    name: string;
    description: string | null;
    uri: string;
    imageUri: string | null;
    attributes: MetadataAttribute[];
}
export interface DecodedToken721Collection {
    authority: PublicKeyString;
    name: string;
    symbol: string;
    baseUri: string | null;
    totalMinted: number;
    isInitialized: boolean;
}
export interface DecodedToken721Token {
    collection: PublicKeyString;
    tokenId: number;
    owner: PublicKeyString;
    creator: PublicKeyString;
    royaltyBps: number;
    metadata: Token721Metadata;
    frozen: boolean;
    isInitialized: boolean;
}
export declare function validateProgramOwner(owner: PublicKeyString): {
    expectedOwner: PublicKeyString;
    matches: boolean;
};
export declare function decodeToken721Collection(account: AccountInfoValue): DecodedToken721Collection;
export declare function decodeToken721Token(account: AccountInfoValue): DecodedToken721Token;
export declare function getProgramAccounts(connection: AekoConnection, programId: PublicKeyString): Promise<ProgramAccount[]>;
export declare function getTokenAccountsByOwner(connection: AekoConnection, owner: PublicKeyString, filter: {
    mint?: PublicKeyString;
    programId?: PublicKeyString;
}): Promise<TokenAccountOwnerResult[]>;
export declare function getToken721Collection(connection: AekoConnection, account: PublicKeyString): Promise<DecodedToken721Collection>;
export declare function getToken721Token(connection: AekoConnection, account: PublicKeyString): Promise<DecodedToken721Token>;
export declare function derivePublicKeyString(bytes: Uint8Array): PublicKeyString;
export declare function publicKeyBytes(value: PublicKeyString): Uint8Array;
