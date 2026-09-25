import { useCallback, useMemo, useState } from 'react';
import {
  getDefaultExplorerNetwork,
  getNetworkConfig,
  isTestSurfaceNetwork,
  resolveExplorerNetwork,
} from '../utils/networkConfig';
import { NetworkContext } from './NetworkContext';

// Global network selection shared by every Explorer UI surface. The toggle
// writes here once; all pages read the same value, so switching networks in
// one place switches it everywhere. Selection persists across reloads and is
// re-validated against the deploy's available networks on boot (e.g. a
// stored mainnet falls back when the deploy no longer configures it).
//
// Mainnet rule: test-only surfaces (network console, NTF demo, Social E2E
// lab, developer simulation) are visible only off mainnet. `testSurfacesVisible`
// is false on mainnet regardless of API visibility flags, so route guards and
// navigation hide test prototypes and simulations even when the backend
// enables them.

const STORAGE_KEY = 'aeko:selected-network';

function readStoredNetwork() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeNetwork(network) {
  try {
    window.localStorage.setItem(STORAGE_KEY, network);
  } catch {
    // Private mode / blocked storage must never break network selection.
  }
}

export function NetworkProvider({ children }) {
  const [network, setNetworkState] = useState(() =>
    resolveExplorerNetwork(readStoredNetwork() ?? getDefaultExplorerNetwork()),
  );

  const setNetwork = useCallback((next) => {
    setNetworkState((current) => {
      const resolved = resolveExplorerNetwork(next ?? current);
      storeNetwork(resolved);
      return resolved;
    });
  }, []);

  const value = useMemo(() => {
    const config = getNetworkConfig(network);
    const testNetwork = isTestSurfaceNetwork(network);
    return {
      network,
      setNetwork,
      config,
      isMainnet: config.key === 'mainnet',
      isTestNetwork: testNetwork,
      testSurfacesVisible: testNetwork,
    };
  }, [network, setNetwork]);

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}
