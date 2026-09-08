import {
  AekoConnection,
  buildGrantDelegateRequest,
  detectInjectedAekoWalletAdapter,
} from '../src/index';

async function main() {
  const connection = new AekoConnection('https://api.testnet.aeko.chain');
  const wallet = detectInjectedAekoWalletAdapter();
  const latestBlockhash = await connection.getLatestBlockhash();

  const request = buildGrantDelegateRequest({
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
      validUntilEpoch: 10,
      spendLimit: {
        maxSingleTxAeko: 100,
        maxDailyAeko: 500,
        tokenCaps: [],
      },
      programAllowlist: [],
      tokenAllowlist: [],
      appScopeHashes: [],
      requiresReauth: false,
    },
    currentEpoch: 1,
    currentSlot: 10,
  });

  console.log({
    latestBlockhash,
    wallet: wallet?.publicKey ?? null,
    request,
  });
}

void main();
