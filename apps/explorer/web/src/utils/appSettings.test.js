import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeAppSettingsPayload, SAFE_APP_SETTINGS } from './appSettings.js';

const root = new URL('../', import.meta.url);
async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('application settings normalize public surfaces and Explorer behavior with safe defaults', () => {
  const valid = normalizeAppSettingsPayload({
    revision: 7,
    application: {
      networkToolsEnabled: false,
      networkConsoleEnabled: false,
      docsEnabled: false,
      developersEnabled: true,
      bridgeEnabled: false,
      nftDemoEnabled: true,
      nftLiveFlowEnabled: false,
      nftAdvancedToolsEnabled: true,
      explorerListSize: 9,
      explorerSearchResultLimit: 24,
      explorerAutoRefreshSeconds: 20,
      settingsRefreshSeconds: 60,
    },
  });

  assert.equal(valid.revision, 7);
  assert.equal(valid.application.networkToolsEnabled, false);
  assert.equal(valid.application.docsEnabled, false);
  assert.equal(valid.application.developersEnabled, true);
  assert.equal(valid.application.bridgeEnabled, false);
  assert.equal(valid.application.nftLiveFlowEnabled, false);
  assert.equal(valid.application.explorerListSize, 9);
  assert.equal(valid.application.explorerSearchResultLimit, 24);
  assert.equal(valid.application.explorerAutoRefreshSeconds, 20);
  assert.equal(valid.application.settingsRefreshSeconds, 60);

  const invalid = normalizeAppSettingsPayload({
    application: {
      explorerListSize: 99,
      explorerSearchResultLimit: 2,
      explorerAutoRefreshSeconds: 1,
      settingsRefreshSeconds: 1,
    },
  });
  assert.deepEqual(invalid.application, SAFE_APP_SETTINGS);
  assert.equal(SAFE_APP_SETTINGS.networkToolsEnabled, true);
  assert.equal(SAFE_APP_SETTINGS.nftDemoEnabled, true);
  assert.equal(SAFE_APP_SETTINGS.networkConsoleEnabled, false);
  assert.equal(SAFE_APP_SETTINGS.nftLiveFlowEnabled, false);
  assert.equal(SAFE_APP_SETTINGS.nftAdvancedToolsEnabled, false);
});

test('settings are wired to routes, navigation, search and refresh behavior', async () => {
  const app = await source('App.jsx');
  const layout = await source('components/Layout.jsx');
  const main = await source('main.jsx');
  const networkTools = await source('pages/NetworkTools.jsx');
  const nftDemo = await source('pages/NftDemo.jsx');
  const explorer = await source('pages/Explorer.jsx');
  const explorerApi = await source('utils/explorerApi.js');

  assert.match(app, /settings\.networkToolsEnabled/);
  assert.match(app, /settings\.networkConsoleEnabled/);
  assert.match(app, /settings\.docsEnabled/);
  assert.match(app, /settings\.developersEnabled/);
  assert.match(app, /settings\.bridgeEnabled/);
  assert.match(app, /settings\.nftDemoEnabled/);
  // Mainnet hides every test surface regardless of API visibility flags.
  assert.match(app, /testSurfacesVisible/);
  assert.match(app, /path="\/ntf"/);
  assert.match(app, /path="\/nft-demo"/);

  assert.match(main, /NetworkProvider/);

  assert.match(layout, /settings\.networkToolsEnabled/);
  assert.match(layout, /settings\.docsEnabled/);
  assert.match(layout, /settings\.developersEnabled/);
  assert.match(layout, /settings\.bridgeEnabled/);
  assert.match(layout, /settings\.nftDemoEnabled/);
  assert.match(layout, /testSurfacesVisible/);

  assert.match(networkTools, /settings\.networkConsoleEnabled/);
  assert.match(nftDemo, /settings\.nftLiveFlowEnabled/);
  assert.match(nftDemo, /settings\.nftAdvancedToolsEnabled/);
  assert.match(explorer, /settings\.explorerListSize/);
  assert.match(explorer, /settings\.explorerSearchResultLimit/);
  assert.match(explorer, /settings\.explorerAutoRefreshSeconds/);
  assert.match(explorerApi, /safeLimit/);
});
