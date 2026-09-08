const DEFAULT_WALLET_PERMISSIONS_PROGRAM_ID = 'gBxS1f6uyyGPuW5MzGBukidSb71jdsCb5fZaoSzULE5';
export function walletPermissionsProgramId() {
    return DEFAULT_WALLET_PERMISSIONS_PROGRAM_ID;
}
export function buildInitializePermissionsRequest(input) {
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
export function buildGrantDelegateRequest(input) {
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
export function buildUpdateDelegateRequest(input) {
    return {
        programId: walletPermissionsProgramId(),
        action: 'update_delegate',
        accounts: input.accounts,
        payload: input,
    };
}
export function buildRevokeDelegateRequest(input) {
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
export function buildFreezeWalletRequest(input) {
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
export function buildUnfreezeWalletRequest(input) {
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
export function buildRecordDelegateUsageRequest(input) {
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
export function buildReadEffectivePermissionsRequest(input) {
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
