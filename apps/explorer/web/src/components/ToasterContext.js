import { createContext, useContext } from 'react';

export const ToasterContext = createContext(null);

export function useToaster() {
  const context = useContext(ToasterContext);
  if (!context) {
    throw new Error('useToaster must be used within <ToasterProvider>');
  }
  return context;
}
