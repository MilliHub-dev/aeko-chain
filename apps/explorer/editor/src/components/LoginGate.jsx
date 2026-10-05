import { useState } from 'react'
import { api } from '../lib/api'

export default function LoginGate({ onAuthenticated, config }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.login(token)
      setToken('')
      onAuthenticated()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark">A</div>
        <div>
          <p className="eyebrow">AEKO DEVELOPER TOOLS</p>
          <h1 id="login-title">Contract Studio</h1>
          <p className="login-copy">
            An isolated browser IDE with a real AEKO workspace and terminal.
          </p>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="studio-access-token">Studio access token</label>
          <input
            id="studio-access-token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={busy || !token}>
            {busy ? 'Opening studio…' : 'Open Contract Studio'}
          </button>
        </form>
        <p className="login-meta">
          {config?.network ? `Connected environment: ${config.network}` : 'Dedicated editor runtime'}
        </p>
      </section>
    </main>
  )
}
