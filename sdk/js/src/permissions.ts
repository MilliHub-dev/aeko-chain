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
  action:
    | 'initialize_permission_account'
    | 'grant_delegate'
    | 'update_delegate'
    | 'revoke_delegate'
    | 'freeze_wallet'
    | 'unfreeze_wallet'
    | 'record_delegate_usage'
    | 'read_effective_permissions';
  accounts: WalletPermissionAccounts | { permissionState: PublicKeyString };
  payload: TPayload;
}

const DEFAULT_WALLET_PERMISSIONS_PROGRAM_ID = 'gBxS1f6uyyGPuW5MzGBukidSb71jdsCb5fZaoSzULE5';

export function walletPermissionsProgramId(): PublicKeyString {
  return DEFAULT_WALLET_PERMISSIONS_PROGRAM_ID;
}

export function buildInitializePermissionsRequest(input: {
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
}> {
  return {
    programId: walletPermissionsProgramId(),
    action: 'initialize_permission_account',
    accounts: input.accounts,
    payload: {
      wallet: input.wallet,
      did: input.did,
      currentEpoch: input.currentEpoch,
      defaultProgramPolicy: input.defaultProgramPolicy,
    },
  };
}

export function buildGrantDelegateRequest(input: {
  accounts: WalletPermissionAccounts;
  delegatePermission: DelegatePermission;
  currentEpoch: number;
  currentSlot: number;
}): PermissionActionRequest<{
  delegatePermission: DelegatePermission;
  currentEpoch: number;
  currentSlot: number;
}> {
  return {
    programId: walletPermissionsProgramId(),
    action: 'grant_delegate',
    accounts: input.accounts,
    payload: {
      delegatePermission: input.delegatePermission,
      currentEpoch: input.currentEpoch,
      currentSlot: input.currentSlot,
    },
  };
}

export function buildUpdateDelegateRequest(input: {
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
}): PermissionActionRequest<typeof input> {
  return {
    programId: walletPermissionsProgramId(),
    action: 'update_delegate',
    accounts: input.accounts,
    payload: input,
  };
}

export function buildRevokeDelegateRequest(input: {
  accounts: WalletPermissionAccounts;
  delegate: PublicKeyString;
  currentEpoch: number;
  currentSlot: number;
}): PermissionActionRequest<Omit<typeof input, 'accounts'>> {
  return {
    programId: walletPermissionsProgramId(),
    action: 'revoke_delegate',
    accounts: input.accounts,
    payload: {
      delegate: input.delegate,
      currentEpoch: input.currentEpoch,
      currentSlot: input.currentSlot,
    },
  };
}

export function buildFreezeWalletRequest(input: {
  accounts: WalletPermissionAccounts;
  reasonCode?: number;
  reauthRequiredUntilEpoch?: number;
  currentEpoch: number;
  currentSlot: number;
}): PermissionActionRequest<Omit<typeof input, 'accounts'>> {
  return {
    programId: walletPermissionsProgramId(),
    action: 'freeze_wallet',
    accounts: input.accounts,
    payload: {
      reasonCode: input.reasonCode,
      reauthRequiredUntilEpoch: input.reauthRequiredUntilEpoch,
      currentEpoch: input.currentEpoch,
      currentSlot: input.currentSlot,
    },
  };
}

export function buildUnfreezeWalletRequest(input: {
  accounts: WalletPermissionAccounts;
  currentEpoch: number;
  currentSlot: number;
}): PermissionActionRequest<Omit<typeof input, 'accounts'>> {
  return {
    programId: walletPermissionsProgramId(),
    action: 'unfreeze_wallet',
    accounts: input.accounts,
    payload: {
      currentEpoch: input.currentEpoch,
      currentSlot: input.currentSlot,
    },
  };
}

export function buildRecordDelegateUsageRequest(input: {
  accounts: WalletPermissionAccounts;
  delegate: PublicKeyString;
  targetProgram?: PublicKeyString;
  mint?: PublicKeyString;
  amount: number;
  dayIndex: number;
  currentEpoch: number;
  currentSlot: number;
}): PermissionActionRequest<Omit<typeof input, 'accounts'>> {
  return {
    programId: walletPermissionsProgramId(),
    action: 'record_delegate_usage',
    accounts: input.accounts,
    payload: {
      delegate: input.delegate,
      targetProgram: input.targetProgram,
      mint: input.mint,
      amount: input.amount,
      dayIndex: input.dayIndex,
      currentEpoch: input.currentEpoch,
      currentSlot: input.currentSlot,
    },
  };
}

export function buildReadEffectivePermissionsRequest(input: {
  permissionState: PublicKeyString;
  delegate: PublicKeyString;
  currentEpoch: number;
}): PermissionActionRequest<Omit<typeof input, 'permissionState'>> {
  return {
    programId: walletPermissionsProgramId(),
    action: 'read_effective_permissions',
    accounts: { permissionState: input.permissionState },
    payload: {
      delegate: input.delegate,
      currentEpoch: input.currentEpoch,
    },
  };
}
