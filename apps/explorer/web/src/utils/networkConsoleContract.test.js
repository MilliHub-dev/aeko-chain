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
  assert.match(rpcClient, /new URL\(path\.replace\(/);
  assert.match(rpcClient, /same-origin Explorer proxy base/);
  assert.match(rpcClient, /content-type/);
  assert.match(rpcClient, /non-JSON/);
  assert.match(rpcClient, /requestFundingApproval/);
  assert.match(rpcClient, /requestConsoleAirdrop/);
  assert.match(rpcClient, /requestConsoleAirdrop\(config\.fundingUrl, address, lamportsToAeko\(lamports\)\)/);
});


test('funding runtime is owned by the Scan backend after the Admin gateway removal', async () => {
  const migration = await source('../../../explorer/backend/migrations/0010_funding.sql');
  const fundingFeature = await source('../../../explorer/backend/src/features/funding/mod.rs');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS funding_settings/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS funding_requests/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS funding_grants/);
  assert.match(fundingFeature, /\/funding\/request/);
  assert.match(fundingFeature, /\/funding\/airdrop/);
  assert.match(fundingFeature, /x-aeko-funding-admin-token/);
});

test('Admin funding polling preserves an operator policy draft', async () => {
  const adminPage = await source('../../../admin/src/app/(admin)/funding-grants/page.tsx');

  assert.match(adminPage, /setInterval/);
  assert.match(adminPage, /setDraft\(\(current\) => current \?\? s\.data\.settings\)/);
  assert.match(adminPage, /setDraft\(json\.data\.settings\)/);
  assert.match(adminPage, /setDraft\(\(current\) => current \? \{ \.\.\.current, enabled: nextEnabled \} : current\)/);
});


test('Operations Web paginates long datasets and keeps dense control pages focused', async () => {
  const dataTable = await source('../../../admin/src/components/data-table.tsx');
  const fundingPage = await source('../../../admin/src/app/(admin)/funding-grants/page.tsx');
  const settingsPage = await source('../../../admin/src/app/(admin)/settings/page.tsx');
  const socialPage = await source('../../../admin/src/app/(admin)/social/page.tsx');
  const protocolPage = await source('../../../admin/src/app/(admin)/protocol/page.tsx');

  assert.match(dataTable, /Rows per page/);
  assert.match(dataTable, /Table pagination/);
  assert.match(dataTable, /Previous page/);
  assert.match(dataTable, /Next page/);
  assert.match(dataTable, /Showing/);

  assert.match(fundingPage, /SectionTabs/);
  assert.match(fundingPage, /Approval queue/);
  assert.match(fundingPage, /Policy & manual grant/);
  assert.match(fundingPage, /Grant history/);

  assert.match(settingsPage, /Settings sections/);
  assert.match(settingsPage, /sticky top-14/);
  assert.match(settingsPage, /id="public-features"/);
  assert.match(settingsPage, /id="chain-binding"/);

  assert.match(socialPage, /Health & registry/);
  assert.match(socialPage, /Indexed activity/);
  assert.match(protocolPage, /Native programs/);
  assert.match(protocolPage, /State accounts/);
});


test('Admin section switches keep descriptions outside non-wrapping tab buttons', async () => {
  const sectionTabs = await source('../../../admin/src/components/section-tabs.tsx');

  assert.match(sectionTabs, /whitespace-nowrap/);
  assert.match(sectionTabs, /activeItem\?\.description/);
});


test('Explorer web is the multi-network boundary while services use one active environment', async () => {
  const example = await source('../.env.example');
  const deploymentEnv = await source('../../../../docker/env.public.example');
  const viteConfig = await source('../vite.config.js');
  const networkConfig = await source('utils/networkConfig.js');
  const entrypoint = await source('../../../../docker/explorer-ui-entrypoint.sh');
  const server = await source('../../../../docker/explorer-ui-server.mjs');
  const explorer = await source('pages/Explorer.jsx');
  const networkTools = await source('pages/NetworkTools.jsx');
  const networkToggle = await source('components/NetworkToggle.jsx');
  const demo = await source('data/nftDemoExamples.js');

  for (const key of [
    'AEKO_NETWORK',
    'AEKO_RPC_URL',
    'AEKO_WS_URL',
    'AEKO_EXPLORER_API_URL',
    'AEKO_MAINNET_RPC_URL',
    'AEKO_MAINNET_WS_URL',
    'AEKO_MAINNET_EXPLORER_API_URL',
    'AEKO_TESTNET_RPC_URL',
    'AEKO_TESTNET_WS_URL',
    'AEKO_TESTNET_EXPLORER_API_URL',
    'AEKO_DEVNET_RPC_URL',
    'AEKO_DEVNET_WS_URL',
    'AEKO_DEVNET_EXPLORER_API_URL',
  ]) {
    assert.match(example, new RegExp('^' + key + '=', 'm'));
    assert.match(deploymentEnv, new RegExp(key));
  }

  for (const retired of [
    'AEKO_ENV',
    'AEKO_PUBLIC_RPC_URL',
    'AEKO_PUBLIC_WS_URL',
    'AEKO_INTERNAL_RPC_URL',
    'AEKO_INTERNAL_EXPLORER_API_URL',
    'AEKO_PUBLIC_EXPLORER_API_URL',
    'VITE_AEKO_',
  ]) {
    assert.doesNotMatch(example, new RegExp(retired));
    assert.doesNotMatch(networkConfig, new RegExp(retired));
  }

  assert.match(viteConfig, /AEKO_NETWORK/);
  assert.match(viteConfig, /AEKO_RPC_URL/);
  assert.match(viteConfig, /AEKO_EXPLORER_API_URL/);
  assert.match(viteConfig, /network\.toUpperCase\(\)/);
  assert.match(viteConfig, /'mainnet', 'testnet', 'devnet', 'localnet'/);
  assert.match(viteConfig, /\/api\/explorer\/devnet/);
  assert.match(viteConfig, /__AEKO_DEV_RUNTIME_CONFIG__/);

  assert.match(server, /AEKO_NETWORK/);
  assert.match(server, /AEKO_EXPLORER_API_URL/);
  assert.match(server, /AEKO_DEVNET_EXPLORER_API_URL/);
  assert.match(server, /'mainnet', 'testnet', 'devnet', 'localnet'/);
  assert.match(server, /Explorer UI proxy is read-only/);

  assert.match(networkConfig, /runtime\.networks/);
  assert.match(networkConfig, /runtime\.network/);
  assert.match(networkConfig, /getActiveNetwork/);
  assert.match(networkConfig, /getDefaultExplorerNetwork/);
  assert.match(networkConfig, /getTestNetwork/);
  assert.match(networkConfig, /key === 'devnet'/);
  assert.doesNotMatch(networkConfig, /Legacy alias/);
  assert.doesNotMatch(networkConfig, /devnet.*localnet.*testnet/i);

  assert.match(networkToggle, /'mainnet', 'testnet', 'devnet', 'localnet'/);
  assert.match(networkToggle, /config\.rpcUrl/);
  assert.match(networkToggle, /Not configured/);
  assert.match(networkToggle, /useNetwork/);

  assert.match(explorer, /NetworkToggle/);
  assert.match(explorer, /useNetwork/);
  assert.match(networkTools, /NetworkToggle/);
  assert.match(networkTools, /useNetwork/);
  assert.match(networkTools, /isTestNetwork && settings\.networkConsoleEnabled/);

  assert.match(entrypoint, /AEKO_ACTIVE_NETWORK/);
  assert.match(entrypoint, /AEKO_RPC_URL/);
  assert.match(entrypoint, /AEKO_EXPLORER_API_URL/);
  assert.match(entrypoint, /networks\[activeNetwork\]/);
  assert.match(entrypoint, /network\.toUpperCase\(\)/);
  assert.match(entrypoint, /'mainnet', 'testnet', 'devnet', 'localnet'/);
  assert.doesNotMatch(entrypoint, /AEKO_ENV/);

  assert.match(demo, /getDemoConfig/);
  assert.doesNotMatch(demo, /AEKO_DEMO_/);
});

test('Explorer search is URL-driven, retryable and exposes a no-results state', async () => {
  const explorer = await source('pages/Explorer.jsx');
  const transaction = await source('pages/TransactionDetails.jsx');

  assert.match(explorer, /urlSearchQuery/);
  assert.match(explorer, /setSearchRetry/);
  assert.match(explorer, /No matching saved or live record/);
  assert.match(explorer, /match\.kind === 'tokenMint'/);
  assert.match(explorer, /match\.kind === 'collection'/);
  assert.match(transaction, /Failed/);
  assert.doesNotMatch(transaction, /Not confirmed/);
});


test('production Explorer endpoint configuration is runtime-injected rather than domain-hardcoded', async () => {
  const networkConfig = await source('utils/networkConfig.js');
  const rpcClient = await source('utils/aekoRpcClient.js');
  const runtimeConfig = await source('../public/runtime-config.js');
  const html = await source('../index.html');

  assert.match(html, /runtime-config\.js/);
  assert.match(runtimeConfig, /__AEKO_RUNTIME_CONFIG__ = \{\}/);
  assert.match(networkConfig, /__AEKO_RUNTIME_CONFIG__/);
  assert.doesNotMatch(networkConfig, /aeko\.online/);
  assert.doesNotMatch(rpcClient, /aeko\.online/);
});
