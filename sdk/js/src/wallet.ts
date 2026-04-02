export interface AekoWalletCapabilities {
  connect: boolean;
  disconnect: boolean;
  signMessage: boolean;
  signAndSendTransaction: boolean;
}

export interface AekoWalletAdapter {
  id: string;
  name: string;
  publicKey: string;
  isConnected: boolean;
  capabilities: AekoWalletCapabilities;
  connect(): Promise<string>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array | string): Promise<unknown>;
  signAndSendTransaction(preparedTransactionBase64: string): Promise<unknown>;
}

function normalizePublicKey(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'toBase58' in value && typeof (value as { toBase58: () => string }).toBase58 === 'function') {
    return (value as { toBase58: () => string }).toBase58();
  }
  if (typeof value === 'object' && value && 'toString' in value && typeof (value as { toString: () => string }).toString === 'function') {
    return (value as { toString: () => string }).toString();
  }
  return '';
}

function detectCandidates() {
  const scope = globalThis as typeof globalThis & {
    aeko?: unknown;
    aekoChain?: unknown;
    phantom?: { aeko?: unknown };
    backpack?: { aeko?: unknown };
  };

  return [
    { key: 'aeko', label: 'AEKO Wallet', provider: scope.aeko },
    { key: 'aekoChain', label: 'AEKO Chain Wallet', provider: scope.aekoChain },
    { key: 'phantom.aeko', label: 'Phantom AEKO', provider: scope.phantom?.aeko },
    { key: 'backpack.aeko', label: 'Backpack AEKO', provider: scope.backpack?.aeko },
  ].filter((candidate) => Boolean(candidate.provider));
}

function createAdapter(candidate: { key: string; label: string; provider: unknown }): AekoWalletAdapter {
  const provider = candidate.provider as {
    name?: string;
    label?: string;
    publicKey?: unknown;
    address?: unknown;
    isConnected?: boolean;
    connected?: boolean;
    connect?: () => Promise<unknown>;
    disconnect?: () => Promise<void>;
    signMessage?: (message: Uint8Array | string) => Promise<unknown>;
    signAndSendTransaction?: (transaction: string | Uint8Array, options?: unknown) => Promise<unknown>;
    request?: (args: { method: string; params?: unknown }) => Promise<unknown>;
  };

  return {
    id: candidate.key,
    name: provider.name ?? provider.label ?? candidate.label,
    get publicKey() {
      return normalizePublicKey(provider.publicKey ?? provider.address);
    },
    get isConnected() {
      return Boolean(provider.isConnected ?? provider.connected ?? this.publicKey);
    },
    capabilities: {
      connect: typeof provider.connect === 'function' || typeof provider.request === 'function',
      disconnect: typeof provider.disconnect === 'function' || typeof provider.request === 'function',
      signMessage: typeof provider.signMessage === 'function' || typeof provider.request === 'function',
      signAndSendTransaction:
        typeof provider.signAndSendTransaction === 'function' || typeof provider.request === 'function',
    },
    async connect() {
      if (typeof provider.connect === 'function') {
        const response = await provider.connect();
        return normalizePublicKey(
          (response as { publicKey?: unknown; address?: unknown })?.publicKey ??
            (response as { publicKey?: unknown; address?: unknown })?.address ??
            provider.publicKey ??
            provider.address,
        );
      }
      if (typeof provider.request === 'function') {
        const response = await provider.request({ method: 'connect' });
        return normalizePublicKey(
          (response as { publicKey?: unknown; address?: unknown })?.publicKey ??
            (response as { publicKey?: unknown; address?: unknown })?.address ??
            provider.publicKey ??
            provider.address,
        );
      }
      throw new Error('The detected wallet does not support connect.');
    },
    async disconnect() {
      if (typeof provider.disconnect === 'function') {
        await provider.disconnect();
        return;
      }
      if (typeof provider.request === 'function') {
        await provider.request({ method: 'disconnect' });
        return;
      }
      throw new Error('The detected wallet does not support disconnect.');
    },
    async signMessage(message: Uint8Array | string) {
      if (typeof provider.signMessage === 'function') {
        return provider.signMessage(message);
      }
      if (typeof provider.request === 'function') {
        return provider.request({ method: 'signMessage', params: { message } });
      }
      throw new Error('The detected wallet does not support message signing.');
    },
    async signAndSendTransaction(preparedTransactionBase64: string) {
      if (typeof provider.signAndSendTransaction === 'function') {
        return provider.signAndSendTransaction(preparedTransactionBase64, {
          encoding: 'base64',
          network: 'testnet',
        });
      }
      if (typeof provider.request === 'function') {
        return provider.request({
          method: 'signAndSendTransaction',
          params: {
            transaction: preparedTransactionBase64,
            encoding: 'base64',
            network: 'testnet',
          },
        });
      }
      throw new Error('The detected wallet does not support transaction signing.');
    },
  };
}

export function listInjectedAekoWalletAdapters(): AekoWalletAdapter[] {
  return detectCandidates().map(createAdapter);
}

export function detectInjectedAekoWalletAdapter(): AekoWalletAdapter | null {
  return listInjectedAekoWalletAdapters()[0] ?? null;
}
