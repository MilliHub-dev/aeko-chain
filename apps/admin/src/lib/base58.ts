const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const INDEX = new Map(Array.from(ALPHABET, (c, i) => [c, i]))

export function decodeBase58(value: string): Uint8Array {
  const bytes = [0]
  for (const char of value) {
    let carry = INDEX.get(char)
    if (carry === undefined) throw new Error('invalid base58 character')
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58
      bytes[i] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  for (const char of value) {
    if (char !== ALPHABET[0]) break
    bytes.push(0)
  }
  return Uint8Array.from(bytes.reverse())
}

/** True for a base58 string that decodes to exactly 32 bytes (an AEKO address). */
export function isValidAddress(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) return false
  try {
    return decodeBase58(value).length === 32
  } catch {
    return false
  }
}
