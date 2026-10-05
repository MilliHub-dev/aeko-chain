import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

const COOKIE = 'aeko_studio_session'

function parseCookies(value) {
  return Object.fromEntries(
    String(value || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=')
        return index < 0
          ? [part, '']
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]
      }),
  )
}

function equalSecret(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export class SessionStore {
  constructor(config) {
    this.config = config
    this.sessions = new Map()
  }

  create() {
    if (this.sessions.size >= this.config.maxSessions) {
      throw Object.assign(new Error('Contract Studio reached its concurrent session limit.'), { status: 503 })
    }
    const usedIdentities = new Set([...this.sessions.values()].map((session) => session.uid))
    let uid = null
    for (let offset = 0; offset < this.config.maxSessions; offset += 1) {
      const candidate = this.config.sandboxUidStart + offset
      if (!usedIdentities.has(candidate)) {
        uid = candidate
        break
      }
    }
    if (uid === null || uid > 60000) {
      throw Object.assign(new Error('Contract Studio exhausted its sandbox identity range.'), { status: 503 })
    }

    const token = randomBytes(32).toString('base64url')
    const session = {
      id: randomUUID(),
      token,
      uid,
      gid: uid,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.sessionTtlMs,
    }
    this.sessions.set(token, session)
    return session
  }

  fromRequest(request) {
    const token = parseCookies(request.headers.cookie)[COOKIE]
    if (!token) return null
    const session = this.sessions.get(token)
    if (!session) return null
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token)
      return null
    }
    session.expiresAt = Date.now() + this.config.sessionTtlMs
    return session
  }

  authenticate(accessToken) {
    if (this.config.allowInsecureLocal && !this.config.production && !this.config.accessToken) {
      return this.create()
    }
    if (!equalSecret(accessToken, this.config.accessToken)) return null
    return this.create()
  }

  destroy(request) {
    const token = parseCookies(request.headers.cookie)[COOKIE]
    if (token) this.sessions.delete(token)
  }

  cookie(session) {
    const secure = this.config.production ? '; Secure' : ''
    const seconds = Math.floor(this.config.sessionTtlMs / 1000)
    return `${COOKIE}=${encodeURIComponent(session.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`
  }

  clearCookie() {
    const secure = this.config.production ? '; Secure' : ''
    return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  }

  middleware() {
    return (request, response, next) => {
      const session = this.fromRequest(request)
      if (!session) {
        response.status(401).json({
          error: { code: 'AUTH_REQUIRED', message: 'Authenticate to AEKO Contract Studio first.' },
        })
        return
      }
      request.editorSession = session
      next()
    }
  }

  sweep() {
    const now = Date.now()
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token)
    }
  }
}

export function socketSession(store, socket) {
  return store.fromRequest({ headers: { cookie: socket.handshake.headers.cookie } })
}
