/**
 * Admin session: a signed, expiring cookie issued after a password check.
 *
 * Runs in both the Edge middleware and Node route handlers, so it only uses
 * Web Crypto. There is one operator credential (ADMIN_PASSWORD); the cookie is
 * an HMAC over its expiry so that a leaked password rotation invalidates
 * sessions by changing ADMIN_SESSION_SECRET.
 */

export const SESSION_COOKIE = 'aeko_admin'
const SESSION_TTL_SECONDS = 12 * 60 * 60

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET ?? ''
  if (s.length >= 16) return s
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_SESSION_SECRET (16+ chars) is required in production')
  }
  return 'dev-only-insecure-secret'
}

export function adminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD ?? ''
  if (p.length > 0) return p
  if (process.env.NODE_ENV === 'production') return null
  return 'admin'
}

const enc = new TextEncoder()

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function createSessionToken(): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS)
  return `${exp}.${await hmac(exp)}`
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const [exp, sig] = token.split('.')
  if (!exp || !sig) return false
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false
  return timingSafeEqual(await hmac(exp), sig)
}

export async function passwordMatches(candidate: string): Promise<boolean> {
  const expected = adminPassword()
  if (!expected) return false
  // Compare digests so length differences leak nothing.
  return timingSafeEqual(await hmac(`pw:${candidate}`), await hmac(`pw:${expected}`))
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
}
