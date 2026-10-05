import assert from 'node:assert/strict'
import test from 'node:test'
import { SessionStore } from './auth.mjs'

const config = {
  accessToken: 'correct-horse-battery-staple',
  allowInsecureLocal: false,
  production: true,
  sessionTtlMs: 60_000,
  sandboxUidStart: 20000,
  maxSessions: 4,
}

test('session authentication fails closed and uses HttpOnly secure cookies', () => {
  const store = new SessionStore(config)
  assert.equal(store.authenticate('wrong-token'), null)

  const session = store.authenticate('correct-horse-battery-staple')
  assert.ok(session?.token)
  assert.equal(session.uid, 20000)
  assert.equal(session.gid, 20000)
  const cookie = store.cookie(session)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.match(cookie, /Secure/)
})

test('each authenticated session receives a distinct sandbox identity', () => {
  const store = new SessionStore(config)
  const first = store.authenticate('correct-horse-battery-staple')
  const second = store.authenticate('correct-horse-battery-staple')
  assert.notEqual(first.uid, second.uid)
  assert.notEqual(first.gid, second.gid)
})

test('session lookup renews a valid cookie-backed session', () => {
  const store = new SessionStore(config)
  const session = store.authenticate('correct-horse-battery-staple')
  const request = { headers: { cookie: `aeko_studio_session=${session.token}` } }
  assert.equal(store.fromRequest(request)?.id, session.id)
})


test('sandbox identity pool is bounded and reuses identities after session expiry', () => {
  const store = new SessionStore({ ...config, maxSessions: 2 })
  const first = store.authenticate('correct-horse-battery-staple')
  const second = store.authenticate('correct-horse-battery-staple')
  assert.throws(
    () => store.authenticate('correct-horse-battery-staple'),
    /concurrent session limit/,
  )

  first.expiresAt = 0
  store.sweep()
  const replacement = store.authenticate('correct-horse-battery-staple')
  assert.equal(replacement.uid, first.uid)
  assert.notEqual(replacement.uid, second.uid)
})
