import { getNetworkConfig } from './networkConfig';

export const SAFE_APP_SETTINGS = Object.freeze({
  networkConsoleEnabled: false,
  nftDemoEnabled: false,
  nftLiveFlowEnabled: false,
  nftAdvancedToolsEnabled: false,
  explorerListSize: 6,
  settingsRefreshSeconds: 30,
});

function booleanOr(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function integerInRange(value, min, max, fallback) {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export function normalizeAppSettingsPayload(data) {
  const application = data?.application || {};
  return {
    revision: Number.isInteger(data?.revision) && data.revision >= 0 ? data.revision : 0,
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : '',
    application: {
      networkConsoleEnabled: booleanOr(application.networkConsoleEnabled, SAFE_APP_SETTINGS.networkConsoleEnabled),
      nftDemoEnabled: booleanOr(application.nftDemoEnabled, SAFE_APP_SETTINGS.nftDemoEnabled),
      nftLiveFlowEnabled: booleanOr(application.nftLiveFlowEnabled, SAFE_APP_SETTINGS.nftLiveFlowEnabled),
      nftAdvancedToolsEnabled: booleanOr(application.nftAdvancedToolsEnabled, SAFE_APP_SETTINGS.nftAdvancedToolsEnabled),
      explorerListSize: integerInRange(application.explorerListSize, 3, 12, SAFE_APP_SETTINGS.explorerListSize),
      settingsRefreshSeconds: integerInRange(application.settingsRefreshSeconds, 10, 300, SAFE_APP_SETTINGS.settingsRefreshSeconds),
    },
    blockchain: {
      network: typeof data?.blockchain?.network === 'string' ? data.blockchain.network : '',
      genesisHash: typeof data?.blockchain?.genesisHash === 'string' ? data.blockchain.genesisHash : '',
      socialIndexingEnabled: Boolean(data?.blockchain?.socialIndexingEnabled),
      socialReadinessRequired: Boolean(data?.blockchain?.socialReadinessRequired),
      maxReadyLagSlots: Number.isInteger(data?.blockchain?.maxReadyLagSlots) ? data.blockchain.maxReadyLagSlots : null,
      readinessPolicySource: typeof data?.blockchain?.readinessPolicySource === 'string' ? data.blockchain.readinessPolicySource : '',
      configurationSource: typeof data?.blockchain?.configurationSource === 'string' ? data.blockchain.configurationSource : '',
    },
  };
}

export async function fetchPublicAppSettings() {
  const explorerApiUrl = getNetworkConfig('testnet').explorerApiUrl;
  if (!explorerApiUrl) throw new Error('Explorer API is not configured for application settings');

  const response = await fetch(`${explorerApiUrl}/settings`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Settings request failed: ${response.status}`);
  }
  if (!payload?.data) throw new Error('Settings response is missing data');
  return normalizeAppSettingsPayload(payload.data);
}
