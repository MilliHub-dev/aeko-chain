import type { PublicKeyString } from './types';
export type PermissionRole = 'owner' | 'spender' | 'viewer';
export type PermissionStatus = 'active' | 'revoked' | 'expired' | 'frozen';
export type ProgramPolicyMode = 'deny_by_default' | 'allow_by_default';
export interface TokenSpendCap {
    mint: PublicKeyString;
    maxSingleTx?: number;
    maxDaily?: number;
}
export interface SpendLimitPolicy {
    maxSingleTxAeko?: number;
    maxDailyAeko?: number;
    tokenCaps: TokenSpendCap[];
}
export interface DelegatePermission {
    delegate: PublicKeyString;
    role: PermissionRole;
    label?: string;
    status: PermissionStatus;
    validFromEpoch: number;
    validUntilEpoch?: number;
    spendLimit: SpendLimitPolicy;
    programAllowlist: PublicKeyString[];
    tokenAllowlist: PublicKeyString[];
    appScopeHashes: string[];
    requiresReauth: boolean;
}
export interface WalletPermissionAccounts {
    permissionState: PublicKeyString;
    auditLog: PublicKeyString;
    owner: PublicKeyString;
}
export interface PermissionActionRequest<TPayload> {
    programId: PublicKeyString;
    action: 'initialize_permission_account' | 'grant_delegate' | 'update_delegate' | 'revoke_delegate' | 'freeze_wallet' | 'unfreeze_wallet' | 'record_delegate_usage' | 'read_effective_permissions';
    accounts: WalletPermissionAccounts | {
        permissionState: PublicKeyString;
    };
    payload: TPayload;
}
export declare function walletPermissionsProgramId(): PublicKeyString;
export declare function buildInitializePermissionsRequest(input: {
    accounts: WalletPermissionAccounts;
    wallet: PublicKeyString;
    did: string;
    currentEpoch: number;
    defaultProgramPolicy: ProgramPolicyMode;
}): PermissionActionRequest<{
    wallet: PublicKeyString;
    did: string;
    currentEpoch: number;
    defaultProgramPolicy: ProgramPolicyMode;
}>;
export declare function buildGrantDelegateRequest(input: {
    accounts: WalletPermissionAccounts;
    delegatePermission: DelegatePermission;
    currentEpoch: number;
    currentSlot: number;
}): PermissionActionRequest<{
    delegatePermission: DelegatePermission;
    currentEpoch: number;
    currentSlot: number;
}>;
export declare function buildUpdateDelegateRequest(input: {
    accounts: WalletPermissionAccounts;
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
}): PermissionActionRequest<typeof input>;
export declare function buildRevokeDelegateRequest(input: {
    accounts: WalletPermissionAccounts;
    delegate: PublicKeyString;
    currentEpoch: number;
    currentSlot: number;
}): PermissionActionRequest<Omit<typeof input, 'accounts'>>;
export declare function buildFreezeWalletRequest(input: {
    accounts: WalletPermissionAccounts;
    reasonCode?: number;
    reauthRequiredUntilEpoch?: number;
    currentEpoch: number;
    currentSlot: number;
}): PermissionActionRequest<Omit<typeof input, 'accounts'>>;
export declare function buildUnfreezeWalletRequest(input: {
    accounts: WalletPermissionAccounts;
    currentEpoch: number;
    currentSlot: number;
}): PermissionActionRequest<Omit<typeof input, 'accounts'>>;
export declare function buildRecordDelegateUsageRequest(input: {
    accounts: WalletPermissionAccounts;
    delegate: PublicKeyString;
    targetProgram?: PublicKeyString;
    mint?: PublicKeyString;
    amount: number;
    dayIndex: number;
    currentEpoch: number;
    currentSlot: number;
}): PermissionActionRequest<Omit<typeof input, 'accounts'>>;
export declare function buildReadEffectivePermissionsRequest(input: {
    permissionState: PublicKeyString;
    delegate: PublicKeyString;
    currentEpoch: number;
}): PermissionActionRequest<Omit<typeof input, 'permissionState'>>;
