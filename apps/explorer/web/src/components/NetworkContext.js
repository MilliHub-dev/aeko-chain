import { createContext, useContext } from 'react';

// Shared context object for the global network selection. Kept in its own
// module (same pattern as AppSettingsContext) so the provider file only
// exports the component.

export const NetworkContext = createContext(null);

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) throw new Error('useNetwork must be used inside NetworkProvider');
  return context;
}
