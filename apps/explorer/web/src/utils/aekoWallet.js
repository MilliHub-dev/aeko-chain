function decodeBase64ToBytes(base64) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function normalizePublicKey(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toBase58 === 'function') return value.toBase58();
  if (typeof value.toString === 'function') return value.toString();
  return '';
}

function detectCandidates() {
  if (typeof window === 'undefined') {
    return [];
  }

  return [
    { key: 'window.aeko', label: 'AEKO Wallet', provider: window.aeko },
    { key: 'window.aekoChain', label: 'AEKO Chain Wallet', provider: window.aekoChain },
    { key: 'window.phantom.aeko', label: 'Phantom AEKO', provider: window.phantom?.aeko },
    { key: 'window.backpack.aeko', label: 'Backpack AEKO', provider: window.backpack?.aeko },
  ].filter((candidate) => Boolean(candidate.provider));
}

function buildCapabilities(provider) {
  return {
    connect:
      typeof provider?.connect === 'function' ||
      typeof provider?.request === 'function',
    disconnect:
      typeof provider?.disconnect === 'function' ||
      typeof provider?.request === 'function',
    signMessage:
      typeof provider?.signMessage === 'function' ||
      typeof provider?.request === 'function',
    signAndSendTransaction:
      typeof provider?.signAndSendTransaction === 'function' ||
      typeof provider?.request === 'function',
  };
}

function createAdapter({ provider, label, key }) {
  const capabilities = buildCapabilities(provider);

  return {
    id: key,
    name: provider?.name || provider?.label || label,
    provider,
    capabilities,
    get publicKey() {
      return normalizePublicKey(provider?.publicKey || provider?.address);
    },
    get isConnected() {
      return Boolean(provider?.isConnected || provider?.connected || this.publicKey);
    },
    async connect() {
      if (typeof provider?.connect === 'function') {
        const response = await provider.connect();
        return normalizePublicKey(
          response?.publicKey || response?.address || provider?.publicKey || provider?.address,
        );
      }

      if (typeof provider?.request === 'function') {
        const response = await provider.request({ method: 'connect' });
        return normalizePublicKey(
          response?.publicKey || response?.address || provider?.publicKey || provider?.address,
        );
      }

      throw new Error('The detected wallet does not support connect.');
    },
    async disconnect() {
      if (typeof provider?.disconnect === 'function') {
        await provider.disconnect();
        return;
      }

      if (typeof provider?.request === 'function') {
        await provider.request({ method: 'disconnect' });
        return;
      }

      throw new Error('The detected wallet does not support disconnect.');
    },
    async signMessage(message) {
      if (typeof provider?.signMessage === 'function') {
        const response = await provider.signMessage(message);
        return response?.signature || response;
      }

      if (typeof provider?.request === 'function') {
        const response = await provider.request({
          method: 'signMessage',
          params: {
            message: typeof message === 'string' ? message : new TextDecoder().decode(message),
          },
        });
        return response?.signature || response;
      }

      throw new Error('The detected wallet does not support message signing.');
    },
    async signAndSendTransaction(preparedTransactionBase64) {
      if (!preparedTransactionBase64.trim()) {
        throw new Error('Build or paste a prepared transaction first.');
      }

      if (typeof provider?.signAndSendTransaction === 'function') {
        try {
          const direct = await provider.signAndSendTransaction(preparedTransactionBase64, {
            encoding: 'base64',
            network: 'testnet',
          });
          return direct?.signature || direct?.hash || direct;
        } catch (_error) {
          const bytes = decodeBase64ToBytes(preparedTransactionBase64);
          const fallback = await provider.signAndSendTransaction(bytes, {
            network: 'testnet',
          });
          return fallback?.signature || fallback?.hash || fallback;
        }
      }

      if (typeof provider?.request === 'function') {
        const response = await provider.request({
          method: 'signAndSendTransaction',
          params: {
            transaction: preparedTransactionBase64,
            encoding: 'base64',
            network: 'testnet',
          },
        });
        return response?.signature || response?.hash || response;
      }

      throw new Error('The detected wallet does not expose sign-and-send.');
    },
  };
}

export function listInjectedAekoWalletAdapters() {
  return detectCandidates().map(createAdapter);
}

export function detectInjectedAekoWalletAdapter() {
  const [first] = listInjectedAekoWalletAdapters();
  return first || null;
}

export async function connectInjectedAekoWallet(adapter) {
  if (!adapter) {
    throw new Error('No injected AEKO wallet was detected.');
  }
  return adapter.connect();
}

export async function disconnectInjectedAekoWallet(adapter) {
  if (!adapter) {
    throw new Error('No injected AEKO wallet was detected.');
  }
  return adapter.disconnect();
}

export async function signWithInjectedAekoWallet(adapter, message) {
  if (!adapter) {
    throw new Error('No injected AEKO wallet was detected.');
  }
  return adapter.signMessage(message);
}

export async function signAndSendPreparedTransaction(adapter, preparedTransactionBase64) {
  if (!adapter) {
    throw new Error('No injected AEKO wallet was detected.');
  }
  return adapter.signAndSendTransaction(preparedTransactionBase64);
}
