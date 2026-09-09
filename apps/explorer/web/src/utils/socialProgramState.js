import { encodeBase58 } from './aekoTestKeypair';

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.offset = 0;
  }

  fixed(length) {
    const value = this.bytes.slice(this.offset, this.offset + length);
    if (value.length !== length) throw new Error(`Social state decode underrun at ${this.offset}.`);
    this.offset += length;
    return value;
  }

  bool() {
    return this.fixed(1)[0] === 1;
  }

  u16() {
    const bytes = this.fixed(2);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(0, true);
  }

  u64() {
    const bytes = this.fixed(8);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(0, true);
  }

  pubkey() {
    return encodeBase58(this.fixed(32));
  }
}

async function fetchCanonicalState(rpcUrl, address) {
  if (!rpcUrl || !address) throw new Error('RPC URL and canonical state account are required.');
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAccountInfo',
      params: [address, { commitment: 'confirmed', encoding: 'base64' }],
    }),
  });
  if (!response.ok) throw new Error(`Social state RPC read failed with HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload?.error) throw new Error(payload.error.message || 'Social state RPC read failed.');
  const encoded = payload?.result?.value?.data?.[0];
  if (!encoded) throw new Error(`Canonical Social state ${address} is unavailable.`);
  return decodeBase64(encoded);
}

export async function fetchStakingWriteConfig(rpcUrl, stateAccount) {
  const reader = new Reader(await fetchCanonicalState(rpcUrl, stateAccount));
  const isInitialized = reader.bool();
  const config = {
    authority: reader.pubkey(),
    stakeVault: reader.pubkey(),
    rewardVault: reader.pubkey(),
    minStakeAmount: reader.u64(),
    cooldownEpochs: reader.u64(),
    stakingEnabled: reader.bool(),
  };
  if (!isInitialized) throw new Error('Canonical Social staking state is not initialized.');
  return config;
}

export async function fetchRewardsWriteConfig(rpcUrl, stateAccount) {
  const reader = new Reader(await fetchCanonicalState(rpcUrl, stateAccount));
  const isInitialized = reader.bool();
  const config = {
    authority: reader.pubkey(),
    treasury: reader.pubkey(),
    rewardVault: reader.pubkey(),
    settlementAuthority: reader.pubkey(),
    minClaimAmount: reader.u64(),
    rewardsEnabled: reader.bool(),
  };
  if (!isInitialized) throw new Error('Canonical Social rewards state is not initialized.');
  return config;
}

export async function fetchMonetizationWriteConfig(rpcUrl, stateAccount) {
  const reader = new Reader(await fetchCanonicalState(rpcUrl, stateAccount));
  const isInitialized = reader.bool();
  const config = {
    authority: reader.pubkey(),
    treasury: reader.pubkey(),
    platformFeeBps: reader.u16(),
    subscriptionsEnabled: reader.bool(),
    paidContentEnabled: reader.bool(),
  };
  if (!isInitialized) throw new Error('Canonical Social monetization state is not initialized.');
  return config;
}

export async function fetchSocialWriteConfig({ rpcUrl, registry }) {
  if (!registry?.staking || !registry?.rewards || !registry?.monetization) {
    throw new Error('Canonical Social registry is incomplete for value-moving actions.');
  }
  const [staking, rewards, monetization] = await Promise.all([
    fetchStakingWriteConfig(rpcUrl, registry.staking),
    fetchRewardsWriteConfig(rpcUrl, registry.rewards),
    fetchMonetizationWriteConfig(rpcUrl, registry.monetization),
  ]);

  if (registry.rewardVault && registry.rewardVault !== rewards.rewardVault) {
    throw new Error('Reward vault mismatch between Explorer registry and canonical rewards state.');
  }
  if (registry.treasury && registry.treasury !== monetization.treasury) {
    throw new Error('Treasury mismatch between Explorer registry and canonical monetization state.');
  }
  if (staking.rewardVault !== rewards.rewardVault) {
    throw new Error('Staking and rewards state disagree on the canonical reward vault.');
  }

  return { staking, rewards, monetization };
}
