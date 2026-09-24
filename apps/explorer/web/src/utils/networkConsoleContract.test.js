import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('active test console delegates to the end-to-end implementation', async () => {
  const wrapper = await source('components/NetworkConsoleModal.jsx');
  const implementation = await source('components/NetworkConsoleModalV2.jsx');

  assert.match(wrapper, /NetworkConsoleModalV2/);
  assert.match(wrapper, /websocketUrl/);
  assert.match(implementation, /new AekoWsClient/);
  assert.match(implementation, /fetchConsoleOverview/);
  assert.match(implementation, /fetchWalletProfile/);
  assert.match(implementation, /fetchSocialStatus/);
  assert.match(implementation, /fetchSocialProjection/);
  assert.match(implementation, /requestConsoleAirdrop/);
  assert.doesNotMatch(implementation, /requestAirdrop|requestTestnetFunding/);
  assert.match(implementation, /buildSignedTransfer/);
  assert.match(implementation, /buildSignedAnchorPostTx/);
  assert.match(implementation, /buildSignedLikeTx/);
  assert.doesNotMatch(implementation, /mock|dummy|fixture/i);
});

test('console reads are API-first and direct RPC is limited to unsupported write primitives', async () => {
  const implementation = await source('components/NetworkConsoleModalV2.jsx');

  assert.doesNotMatch(implementation, /\bgetBalance\b/);
  assert.doesNotMatch(implementation, /\bgetHealth\b/);
  assert.doesNotMatch(implementation, /\bgetFinalizedSlot\b/);
  assert.doesNotMatch(implementation, /discoverSocialPostsStateAccount/);

  assert.match(implementation, /fetchWalletProfile\(explorerApiUrl, address\)/);
  assert.match(implementation, /fetchConsoleOverview\(explorerApiUrl\)/);
  assert.match(implementation, /fetchSocialStatus\(explorerApiUrl\)/);
  assert.match(implementation, /fetchSocialProjection\(explorerApiUrl/);

  assert.doesNotMatch(implementation, /\brequestAirdrop\b/);
  assert.doesNotMatch(implementation, /\brequestTestnetFunding\b/);
  for (const rpcWritePrimitive of ['getLatestBlockhash', 'sendTransaction', 'confirmSignature']) {
    assert.match(implementation, new RegExp(`\\b${rpcWritePrimitive}\\b`), rpcWritePrimitive);
  }
});

test('nested social modal keeps normal balance reads behind the Explorer API and gates writes for unfunded personas', async () => {
  const social = await source('components/social/NetworkSocialModal.jsx');

  assert.doesNotMatch(social, /\bgetBalance\b/);
  assert.match(social, /fetchWalletProfile\(explorerApiUrl, persona\.address\)/);
  assert.match(social, /Promise\.allSettled/);
  assert.match(social, /setPersonaAccountState\('unfunded'\)/);
  assert.match(social, /not funded on-chain yet/i);
  assert.match(social, /getEpochInfo\(rpcUrl\)/);
});

test('social acceptance lab includes post to nft rpc and indexer verification', async () => {
  const socialE2e = await source('pages/SocialTestV2.jsx');

  assert.match(socialE2e, /mintSocialPostAsNft/);
  assert.match(socialE2e, /async function runNft/);
  assert.match(socialE2e, /await runNft\(target, post\)/);
  assert.match(socialE2e, /result\.indexed/);
  assert.match(socialE2e, /Post → NFT → Explorer/);
});

test('console websocket drives slot, wallet and API-derived social state subscriptions', async () => {
  const implementation = await source('components/NetworkConsoleModalV2.jsx');
  assert.match(implementation, /subscribeSlot/);
  assert.match(implementation, /subscribeAccount\(wallet\.address/);
  assert.match(implementation, /socialStatus\?\.domains\?\.posts\?\.stateAccount/);
  assert.match(implementation, /subscribeAccount\(socialStateAccount/);
  assert.match(implementation, /refreshWallet\(wallet\.address\)/);
});

test('wallet and social interactions remain wired while source ownership changes', async () => {
  const implementation = await source('components/NetworkConsoleModalV2.jsx');
  assert.match(implementation, /renameWallet/);
  assert.match(implementation, /postKind: composer\.kind/);
  assert.match(implementation, /parentPostId: composer\.parent\?\.postId/);
  assert.match(implementation, /kind: 'reply'/);
  assert.match(implementation, /kind: 'quote'/);
  assert.match(implementation, /setFeedCreator/);
  assert.match(implementation, /projection\?\.posts\?\.data/);
  assert.match(implementation, /projection\?\.engagement\?\.data/);
});


test('network social composes original posts inline with functional attachment and visibility controls', async () => {
  const social = await source('components/social/NetworkSocialModal.jsx');

  assert.match(social, /Share an update on AEKO Social/);
  assert.match(social, /Attach image URL/);
  assert.match(social, /Followers-only visibility/);
  assert.match(social, /Permissioned visibility/);
  assert.match(social, /visibility: composerVisibility/);
  assert.match(social, /AEKO_IMAGE:/);
  assert.match(social, /alt="Post attachment"/);
  assert.doesNotMatch(social, /dialog==='compose'/);
});


test('social payout actions preflight live program-owned vault liquidity', async () => {
  const social = await source('components/social/NetworkSocialModal.jsx');

  assert.match(social, /ensureVaultLiquidity/);
  assert.match(social, /Creator reward vault/);
  assert.match(social, /Stake reward vault/);
  assert.match(social, /Monetization treasury/);
  assert.match(social, /testnet operator must seed the payout vault/i);
});


test('accounts workspace keeps public funding approval separate from direct Test Console airdrops', async () => {
  const implementation = await source('components/NetworkConsoleModalV2.jsx');
  const funding = await source('components/TestnetFundingRequest.jsx');
  const networkTools = await source('pages/NetworkTools.jsx');

  assert.match(implementation, /profileIssue\?\.status === 404/);
  assert.match(implementation, /Not funded yet/);
  assert.match(implementation, /Local wallet only/);
  assert.match(implementation, /Test Console airdrop/);
  assert.match(implementation, /Request airdrop/);
  assert.match(implementation, /hasSpendableBalance/);
  assert.match(implementation, /requestConsoleAirdrop\(fundingUrl, wallet\.address, value\)/);
  assert.match(implementation, /lg:grid-cols-2/);
  assert.doesNotMatch(implementation, /\brequestAirdrop\b|\brequestTestnetFunding\b|FUNDING_GATEWAY_KEY/);
  assert.match(networkTools, /fundingUrl=\{config\.fundingUrl\}/);

  assert.match(networkTools, /<TestnetFundingRequest fundingUrl=\{config\.fundingUrl\} \/>/);
  assert.match(funding, /Your AEKO wallet address/);
  assert.match(funding, /operator approval/i);
  assert.match(funding, /requestFundingApproval\(fundingUrl, address\.trim\(\)\)/);
});


test('funding API URLs resolve from the configured origin and reject HTML 200 responses', async () => {
  const rpcClient = await source('utils/aekoRpcClient.js');

  assert.match(rpcClient, /base\.origin/);
  assert.match(rpcClient, /new URL\(path,/);
  assert.match(rpcClient, /content-type/);
  assert.match(rpcClient, /non-JSON/);
  assert.match(rpcClient, /requestFundingApproval/);
  assert.match(rpcClient, /requestConsoleAirdrop/);
  assert.match(rpcClient, /requestConsoleAirdrop\(config\.fundingUrl, address, lamportsToAeko\(lamports\)\)/);
});


test('Operations Web separates public approval requests from direct Test Console airdrops', async () => {
  const store = await source('../../../admin/src/lib/funding-store.ts');
  const publicRoute = await source('../../../admin/src/app/api/funding/request/route.ts');
  const consoleRoute = await source('../../../admin/src/app/api/funding/airdrop/route.ts');
  const adminRoute = await source('../../../admin/src/app/api/admin/funding/requests/route.ts');

  assert.match(store, /requestFundingApproval/);
  assert.match(store, /decideFundingRequest/);
  assert.match(store, /status: 'pending'/);
  assert.match(store, /GrantSource = 'public' \| 'backend' \| 'admin' \| 'console'/);
  assert.match(store, /FUNDING_MAX_CONSOLE_AIRDROP_AEKO/);
  assert.match(store, /makeRoomForFundingRequest/);
  assert.match(store, /REQUEST_QUEUE_FULL/);
  assert.match(publicRoute, /requestFundingApproval\(address, trusted \? 'backend' : 'public'\)/);
  assert.match(publicRoute, /status: 202/);
  assert.doesNotMatch(publicRoute, /\bgrant\(|requestAirdrop/);
  assert.match(consoleRoute, /source: 'console'/);
  assert.match(consoleRoute, /throttle\(clientIp\(req\.headers\)\)/);
  assert.match(adminRoute, /decideFundingRequest/);
  assert.match(adminRoute, /approve/);
  assert.match(adminRoute, /reject/);
});

test('Admin funding polling preserves an operator policy draft', async () => {
  const adminPage = await source('../../../admin/src/app/(admin)/funding-grants/page.tsx');

  assert.match(adminPage, /setInterval/);
  assert.match(adminPage, /setDraft\(\(current\) => current \?\? s\.data\.settings\)/);
  assert.match(adminPage, /setDraft\(json\.data\.settings\)/);
});


test('production Explorer endpoint configuration is runtime-injected rather than domain-hardcoded', async () => {
  const networkConfig = await source('utils/networkConfig.js');
  const rpcClient = await source('utils/aekoRpcClient.js');
  const productionEnv = await source('../.env.production');
  const html = await source('../index.html');

  assert.match(html, /runtime-config\.js/);
  assert.match(networkConfig, /__AEKO_RUNTIME_CONFIG__/);
  assert.doesNotMatch(networkConfig, /aeko\.online/);
  assert.doesNotMatch(rpcClient, /aeko\.online/);
  assert.doesNotMatch(productionEnv, /https?:\/\//);
});
