import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeAppSettingsPayload, SAFE_APP_SETTINGS } from './appSettings.js';

const root = new URL('../', import.meta.url);
async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('application settings normalize valid values and fail closed for missing optional surfaces', () => {
  const valid = normalizeAppSettingsPayload({
    revision: 7,
    application: {
      networkConsoleEnabled: true,
      nftDemoEnabled: true,
      nftLiveFlowEnabled: false,
      nftAdvancedToolsEnabled: true,
      explorerListSize: 9,
      settingsRefreshSeconds: 60,
    },
  });
  assert.equal(valid.revision, 7);
  assert.equal(valid.application.networkConsoleEnabled, true);
  assert.equal(valid.application.nftLiveFlowEnabled, false);
  assert.equal(valid.application.explorerListSize, 9);
  assert.equal(valid.application.settingsRefreshSeconds, 60);

  const invalid = normalizeAppSettingsPayload({
    application: { explorerListSize: 99, settingsRefreshSeconds: 1 },
  });
  assert.deepEqual(invalid.application, SAFE_APP_SETTINGS);
});

test('settings are wired to route and component visibility instead of being display-only controls', async () => {
  const app = await source('App.jsx');
  const layout = await source('components/Layout.jsx');
  const networkTools = await source('pages/NetworkTools.jsx');
  const nftDemo = await source('pages/NftDemo.jsx');
  const explorer = await source('pages/Explorer.jsx');

  assert.match(app, /settings\.networkConsoleEnabled/);
  assert.match(app, /settings\.nftDemoEnabled/);
  assert.match(layout, /settings\.nftDemoEnabled/);
  assert.match(networkTools, /settings\.networkConsoleEnabled/);
  assert.match(nftDemo, /settings\.nftLiveFlowEnabled/);
  assert.match(nftDemo, /settings\.nftAdvancedToolsEnabled/);
  assert.match(explorer, /settings\.explorerListSize/);
});
