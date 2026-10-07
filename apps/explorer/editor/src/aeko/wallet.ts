const STORAGE_KEY = 'aeko.editor.devWallets.v2'
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const ED25519_PKCS8_SEED_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
  0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
])

export interface DevelopmentWallet {
  id: string
  name: string
  address: string
  privateKeyPkcs8B64: string
  publicKeyRawB64: string
  createdAt: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let value = ''
  for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value)
}

function base64ToBytes(value: string): Uint8Array {
  const raw = atob(value)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return bytes
}

export function encodeBase58(bytes: Uint8Array): string {
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1
  if (zeros === bytes.length) return '1'.repeat(zeros)

  const digits = [0]
  for (let index = zeros; index < bytes.length; index += 1) {
    let carry = bytes[index] ?? 0
    for (let digit = 0; digit < digits.length; digit += 1) {
      const value = (digits[digit] ?? 0) * 256 + carry
      digits[digit] = value % 58
      carry = Math.floor(value / 58)
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }
  return `${'1'.repeat(zeros)}${digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join('')}`
}

function walletName(name: string): string {
  return name.trim() || `Development wallet ${new Date().toISOString().slice(11, 19)}`
}

function assertEd25519Support(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error('This browser does not provide Web Crypto for development-wallet signing.')
  return globalThis.crypto.subtle
}

export async function generateDevelopmentWallet(name = ''): Promise<DevelopmentWallet> {
  const subtle = assertEd25519Support()
  let pair: CryptoKeyPair
  try {
    pair = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair
  } catch {
    throw new Error('This browser does not support Ed25519 Web Crypto keys required by AEKO development wallets.')
  }
  const [privatePkcs8, publicRaw] = await Promise.all([
    subtle.exportKey('pkcs8', pair.privateKey),
    subtle.exportKey('raw', pair.publicKey),
  ])
  const publicKey = new Uint8Array(publicRaw)
  const address = encodeBase58(publicKey)
  return {
    id: address,
    name: walletName(name),
    address,
    privateKeyPkcs8B64: bytesToBase64(new Uint8Array(privatePkcs8)),
    publicKeyRawB64: bytesToBase64(publicKey),
    createdAt: new Date().toISOString(),
  }
}

export async function importDevelopmentWallet(name: string, secretKeyB64: string): Promise<DevelopmentWallet> {
  const subtle = assertEd25519Support()
  const secret = base64ToBytes(secretKeyB64.trim())
  if (secret.length !== 64) throw new Error('Secret key must be a base64-encoded 64-byte Ed25519 keypair.')
  const seed = secret.slice(0, 32)
  const publicKey = secret.slice(32)
  const pkcs8 = new Uint8Array(ED25519_PKCS8_SEED_PREFIX.length + seed.length)
  pkcs8.set(ED25519_PKCS8_SEED_PREFIX)
  pkcs8.set(seed, ED25519_PKCS8_SEED_PREFIX.length)
  try {
    const [privateKey, publicCryptoKey] = await Promise.all([
      subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']),
      subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']),
    ])
    const proof = globalThis.crypto.getRandomValues(new Uint8Array(32))
    const signature = await subtle.sign('Ed25519', privateKey, proof)
    const valid = await subtle.verify('Ed25519', publicCryptoKey, signature, proof)
    if (!valid) throw new Error('mismatch')
  } catch {
    throw new Error('Secret key seed and public key do not form a valid Ed25519 keypair.')
  }
  const address = encodeBase58(publicKey)
  return {
    id: address,
    name: walletName(name),
    address,
    privateKeyPkcs8B64: bytesToBase64(pkcs8),
    publicKeyRawB64: bytesToBase64(publicKey),
    createdAt: new Date().toISOString(),
  }
}

function webCryptoBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(bytes)
}

export async function signMessage(wallet: DevelopmentWallet, message: Uint8Array): Promise<Uint8Array> {
  const subtle = assertEd25519Support()
  const privateKey = await subtle.importKey(
    'pkcs8',
    webCryptoBytes(base64ToBytes(wallet.privateKeyPkcs8B64)),
    { name: 'Ed25519' },
    false,
    ['sign'],
  )
  return new Uint8Array(await subtle.sign('Ed25519', privateKey, webCryptoBytes(message)))
}

function isWallet(value: unknown): value is DevelopmentWallet {
  if (!value || typeof value !== 'object') return false
  const wallet = value as Partial<DevelopmentWallet>
  return typeof wallet.id === 'string'
    && typeof wallet.name === 'string'
    && typeof wallet.address === 'string'
    && typeof wallet.privateKeyPkcs8B64 === 'string'
    && typeof wallet.publicKeyRawB64 === 'string'
    && typeof wallet.createdAt === 'string'
}

export function loadDevelopmentWallets(): DevelopmentWallet[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isWallet) : []
  } catch {
    return []
  }
}

export function saveDevelopmentWallets(wallets: readonly DevelopmentWallet[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets))
}

export function shortAddress(address: string): string {
  if (address.length <= 14) return address
  return `${address.slice(0, 6)}…${address.slice(-6)}`
}
