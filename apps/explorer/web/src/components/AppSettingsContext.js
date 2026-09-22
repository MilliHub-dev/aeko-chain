import { createContext, useContext } from 'react';

export const AppSettingsContext = createContext(null);

export function useAppSettings() {
  const value = useContext(AppSettingsContext);
  if (!value) {
    throw new Error('useAppSettings must be used within AppSettingsProvider');
  }
  return value;
}
