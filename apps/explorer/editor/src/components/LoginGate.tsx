import { useState, type FormEvent } from 'react'
import type { StudioConfig } from '../../shared/contracts/session.js'
import { errorMessage } from '../../shared/errors/editor-errors.js'
import { api } from '../lib/api'

interface LoginGateProps {
  onAuthenticated: () => void | Promise<void>
  config: StudioConfig | null
}

export default function LoginGate({ onAuthenticated, config }: LoginGateProps) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.login(token)
      setToken('')
      await onAuthenticated()
    } catch (cause) {
      setError(errorMessage(cause, 'Authentication failed.'))
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
        <form onSubmit={(event) => void submit(event)}>
          {config?.authRequired ? (
            <>
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
            </>
          ) : (
            <p className="local-dev-note">Local insecure mode is enabled. No access token is required.</p>
          )}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={busy || Boolean(config?.authRequired && !token)}>
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
