const TOKEN_721_PROGRAM_ID_BYTES = new Uint8Array(new Array(32).fill(10));
const DEFAULT_RPC_ENDPOINT = import.meta.env.VITE_AEKO_TESTNET_RPC || 'https://api.testnet.aeko.chain';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes) {
  if (!bytes.length) return '';

  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      const value = digits[i] * 256 + carry;
      digits[i] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let encoded = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i += 1) {
    encoded += '1';
  }
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    encoded += BASE58_ALPHABET[digits[i]];
  }
  return encoded;
}

function formatPubkey(bytes) {
  return encodeBase58(bytes);
}

function parseBase64(data) {
  const raw = atob(data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function createReader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const ensure = (length) => {
    if (offset + length > bytes.length) {
      throw new Error('Account data ended unexpectedly while decoding Borsh payload.');
    }
  };

  return {
    readU8() {
      ensure(1);
      const value = view.getUint8(offset);
      offset += 1;
      return value;
    },
    readU16() {
      ensure(2);
      const value = view.getUint16(offset, true);
      offset += 2;
      return value;
    },
    readU32() {
      ensure(4);
      const value = view.getUint32(offset, true);
      offset += 4;
      return value;
    },
    readU64() {
      ensure(8);
      const value = view.getBigUint64(offset, true);
      offset += 8;
      return Number(value);
    },
    readBool() {
      return this.readU8() === 1;
    },
    readPubkey() {
      ensure(32);
      const value = bytes.slice(offset, offset + 32);
      offset += 32;
      return formatPubkey(value);
    },
    readString() {
      const length = this.readU32();
      ensure(length);
      const value = new TextDecoder().decode(bytes.slice(offset, offset + length));
      offset += length;
      return value;
    },
    readOptionString() {
      const hasValue = this.readU8();
      return hasValue ? this.readString() : null;
    },
    readVec(readItem) {
      const length = this.readU32();
      const items = [];
      for (let i = 0; i < length; i += 1) {
        items.push(readItem());
      }
      return items;
    },
    get offset() {
      return offset;
    },
  };
}

function readMetadata(reader) {
  return {
    name: reader.readString(),
    description: reader.readOptionString(),
    uri: reader.readString(),
    imageUri: reader.readOptionString(),
    attributes: reader.readVec(() => ({
      traitType: reader.readString(),
      value: reader.readString(),
    })),
  };
}

export function decodeCollectionAccount(base64) {
  const reader = createReader(parseBase64(base64));
  return {
    authority: reader.readPubkey(),
    name: reader.readString(),
    symbol: reader.readString(),
    baseUri: reader.readOptionString(),
    totalMinted: reader.readU64(),
    isInitialized: reader.readBool(),
  };
}

export function decodeTokenAccount(base64) {
  const reader = createReader(parseBase64(base64));
  return {
    collection: reader.readPubkey(),
    tokenId: reader.readU64(),
    owner: reader.readPubkey(),
    creator: reader.readPubkey(),
    royaltyBps: reader.readU16(),
    metadata: readMetadata(reader),
    frozen: reader.readBool(),
    isInitialized: reader.readBool(),
  };
}

async function rpcRequest(endpoint, method, params) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: method,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || 'RPC request failed.');
  }
  return payload.result;
}

export async function fetchLatestBlockhash(endpoint) {
  const result = await rpcRequest(endpoint, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const blockhash = result?.value?.blockhash || result?.blockhash;
  if (!blockhash) {
    throw new Error('RPC did not return a recent blockhash.');
  }
  return blockhash;
}

export async function fetchMinimumBalanceForRentExemption(endpoint, space) {
  const lamports = await rpcRequest(endpoint, 'getMinimumBalanceForRentExemption', [space, { commitment: 'confirmed' }]);
  if (typeof lamports !== 'number') {
    throw new Error('RPC did not return a rent-exemption value.');
  }
  return lamports;
}

export async function sendSignedTransaction(endpoint, signedTransactionBase64) {
  return rpcRequest(endpoint, 'sendTransaction', [
    signedTransactionBase64,
    {
      encoding: 'base64',
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    },
  ]);
}

export async function fetchSignatureStatus(endpoint, signature) {
  const result = await rpcRequest(endpoint, 'getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
  return result?.value?.[0] || null;
}

export async function fetchAccountInfo(endpoint, pubkey) {
  const result = await rpcRequest(endpoint, 'getAccountInfo', [
    pubkey,
    { encoding: 'base64', commitment: 'confirmed' },
  ]);

  if (!result?.value) {
    throw new Error(`Account ${pubkey} was not found on the selected RPC endpoint.`);
  }

  return result.value;
}

export function validateProgramOwner(owner) {
  const expectedOwner = formatPubkey(TOKEN_721_PROGRAM_ID_BYTES);
  return {
    expectedOwner,
    matches: owner === expectedOwner,
  };
}

export { DEFAULT_RPC_ENDPOINT };
