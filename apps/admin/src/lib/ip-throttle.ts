/**
 * Small per-IP throttle for the public funding endpoint. The wallet cooldown is
 * the real limit; this only stops one client from hammering the endpoint with
 * fresh addresses. In-memory on purpose: it resets with the process, which is
 * fine for its job.
 */
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = Number(process.env.FUNDING_IP_REQUESTS_PER_10_MIN ?? 5)

const hits = new Map<string, number[]>()

export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'unknown'
}

/** Returns seconds to wait, or 0 when the request may proceed. */
export function throttle(ip: string, scope = 'funding'): number {
  const now = Date.now()
  const bucket = `${scope}:${ip}`
  const recent = (hits.get(bucket) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(bucket, recent)
    return Math.ceil((recent[0] + WINDOW_MS - now) / 1000)
  }
  recent.push(now)
  hits.set(bucket, recent)
  if (hits.size > 10_000) {
    // Drop stale entries rather than growing without bound.
    hits.forEach((times, key) => {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key)
    })
  }
  return 0
}
