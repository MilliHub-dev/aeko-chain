import type { PublicKeyString } from './types';
import type { DelegatePermission, PermissionRole, ProgramPolicyMode, SpendLimitPolicy } from './permissions';
export interface Token721Attribute {
    traitType: string;
    value: string;
}
export interface Token721MetadataInput {
    name: string;
    uri: string;
    description?: string | null;
    imageUri?: string | null;
    attributes?: Token721Attribute[];
    symbol?: string;
    baseUri?: string | null;
}
export interface Token721ActionInput {
    payer: PublicKeyString;
    recentBlockhash: PublicKeyString;
    action: 'initializeCollection' | 'mint' | 'freeze' | 'thaw' | 'transfer' | 'update';
    collection?: PublicKeyString;
    token?: PublicKeyString;
    authority: PublicKeyString;
    owner?: PublicKeyString;
    recipient?: PublicKeyString;
    tokenId?: number;
    royaltyBps?: number;
    metadata: Token721MetadataInput;
}
export interface CollectionSetupInput {
    payer: PublicKeyString;
    recentBlockhash: PublicKeyString;
    base: PublicKeyString;
    collectionAddress: PublicKeyString;
    collectionSeed: string;
    lamports: number;
    space: number;
    authority: PublicKeyString;
    name: string;
    symbol: string;
    baseUri?: string | null;
}
export interface MintWithAccountSetupInput {
    payer: PublicKeyString;
    recentBlockhash: PublicKeyString;
    base: PublicKeyString;
    tokenAddress: PublicKeyString;
    tokenSeed: string;
    lamports: number;
    space: number;
    collection: PublicKeyString;
    authority: PublicKeyString;
    owner: PublicKeyString;
    tokenId: number;
    royaltyBps: number;
    metadata: Token721MetadataInput;
}
export interface WalletPermissionAccountsInput {
    permissionState: PublicKeyString;
    auditLog: PublicKeyString;
    owner: PublicKeyString;
}
export interface WalletPermissionsTransactionInput {
    payer: PublicKeyString;
    recentBlockhash: PublicKeyString;
    accounts: WalletPermissionAccountsInput;
}
export interface InitializeWalletPermissionsTransactionInput extends WalletPermissionsTransactionInput {
    wallet: PublicKeyString;
    did: string;
    currentEpoch: number;
    defaultProgramPolicy: ProgramPolicyMode;
}
export interface GrantDelegateTransactionInput extends WalletPermissionsTransactionInput {
    delegatePermission: DelegatePermission;
    currentEpoch: number;
    currentSlot: number;
}
export interface UpdateDelegateTransactionInput extends WalletPermissionsTransactionInput {
    delegate: PublicKeyString;
    role?: PermissionRole;
    label?: string | null;
    validUntilEpoch?: number | null;
    spendLimit?: SpendLimitPolicy;
    programAllowlist?: PublicKeyString[];
    tokenAllowlist?: PublicKeyString[];
    appScopeHashes?: string[];
    requiresReauth?: boolean;
    currentEpoch: number;
    currentSlot: number;
}
export interface RevokeDelegateTransactionInput extends WalletPermissionsTransactionInput {
    delegate: PublicKeyString;
    currentEpoch: number;
    currentSlot: number;
}
export interface FreezeWalletTransactionInput extends WalletPermissionsTransactionInput {
    reasonCode?: number;
    reauthRequiredUntilEpoch?: number;
    currentEpoch: number;
    currentSlot: number;
}
export interface UnfreezeWalletTransactionInput extends WalletPermissionsTransactionInput {
    currentEpoch: number;
    currentSlot: number;
}
export interface RecordDelegateUsageTransactionInput extends WalletPermissionsTransactionInput {
    delegate: PublicKeyString;
    targetProgram?: PublicKeyString;
    mint?: PublicKeyString;
    amount: number;
    dayIndex: number;
    currentEpoch: number;
    currentSlot: number;
}
export declare function token721ProgramId(): PublicKeyString;
export declare function nftMarketplaceProgramId(): PublicKeyString;
export declare const PROGRAM_IDS: {
    readonly TOKEN_721: string;
    readonly NFT_MARKETPLACE: string;
};
export declare function buildPreparedToken721Transaction(input: Token721ActionInput): string;
export declare function estimateCollectionAccountSpace(input: {
    name: string;
    symbol: string;
    baseUri?: string | null;
}): number;
export declare function estimateTokenAccountSpace(input: {
    metadata: Token721MetadataInput;
}): number;
export declare function buildPreparedCollectionSetupTransaction(input: CollectionSetupInput): string;
export declare function buildPreparedMintWithAccountSetupTransaction(input: MintWithAccountSetupInput): string;
export declare function buildPreparedInitializeWalletPermissionsTransaction(input: InitializeWalletPermissionsTransactionInput): string;
export declare function buildPreparedGrantDelegateTransaction(input: GrantDelegateTransactionInput): string;
export declare function buildPreparedUpdateDelegateTransaction(input: UpdateDelegateTransactionInput): string;
export declare function buildPreparedRevokeDelegateTransaction(input: RevokeDelegateTransactionInput): string;
export declare function buildPreparedFreezeWalletTransaction(input: FreezeWalletTransactionInput): string;
export declare function buildPreparedUnfreezeWalletTransaction(input: UnfreezeWalletTransactionInput): string;
export interface ListNftTransactionInput {
    payer: PublicKeyString;
    recentBlockhash: PublicKeyString;
    listingAccount: PublicKeyString;
    tokenAccount: PublicKeyString;
    seller: PublicKeyString;
    collection: PublicKeyString;
    creator: PublicKeyString;
    priceLamports: number;
    royaltyBps: number;
    expiresAtSlot?: number | null;
}
export interface BuyNftTransactionInput {
    payer: PublicKeyString;
    recentBlockhash: PublicKeyString;
    listingAccount: PublicKeyString;
    buyer: PublicKeyString;
}
export interface CancelListingTransactionInput {
    payer: PublicKeyString;
    recentBlockhash: PublicKeyString;
    listingAccount: PublicKeyString;
    seller: PublicKeyString;
}
export declare function buildPreparedListNftTransaction(input: ListNftTransactionInput): string;
export declare function buildPreparedBuyNftTransaction(input: BuyNftTransactionInput): string;
export declare function buildPreparedCancelListingTransaction(input: CancelListingTransactionInput): string;
export declare function buildPreparedRecordDelegateUsageTransaction(input: RecordDelegateUsageTransactionInput): string;
