import {
  AekoConnection,
  buildPreparedGrantDelegateTransaction,
  buildReadEffectivePermissionsRequest,
  walletPermissionsProgramId,
} from '../src/index';

async function main() {
  const connection = new AekoConnection('https://api.testnet.aeko.chain');
  const recentBlockhash = await connection.getLatestBlockhash();

  const prepared = buildPreparedGrantDelegateTransaction({
    payer: 'OwnerPubkey',
    recentBlockhash,
    accounts: {
      permissionState: 'PermissionStatePubkey',
      auditLog: 'AuditLogPubkey',
      owner: 'OwnerPubkey',
    },
    delegatePermission: {
      delegate: 'DelegatePubkey',
      role: 'spender',
      status: 'active',
      validFromEpoch: 1,
      validUntilEpoch: 30,
      spendLimit: {
        maxSingleTxAeko: 100,
        maxDailyAeko: 500,
        tokenCaps: [],
      },
      programAllowlist: ['ProgramPubkey'],
      tokenAllowlist: [],
      appScopeHashes: [],
      requiresReauth: false,
    },
    currentEpoch: 1,
    currentSlot: 42,
  });

  const readRequest = buildReadEffectivePermissionsRequest({
    permissionState: 'PermissionStatePubkey',
    delegate: 'DelegatePubkey',
    currentEpoch: 2,
  });

  console.log({
    recentBlockhash,
    walletPermissionsProgramId: walletPermissionsProgramId(),
    preparedGrantDelegateTransaction: prepared,
    readEffectivePermissionsRequest: readRequest,
  });
}

void main();
