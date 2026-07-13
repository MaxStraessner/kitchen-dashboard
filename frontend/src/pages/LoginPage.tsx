import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'

export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const user = await auth.login(username, password, rememberMe)
      setPassword('')
      void navigate(user.mustChangePassword ? '/account' : '/', { replace: true })
    } catch {
      setError('Benutzername oder Passwort ist nicht korrekt.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="auth-shell">
      <form
        className="auth-card auth-card--compact"
        onSubmit={(event) => void submit(event)}
        aria-label="Anmeldung"
      >
        <p className="auth-eyebrow">Willkommen zurück</p>
        <h1>Kitchen Dashboard</h1>
        <label>
          Benutzername
          <input
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Passwort
          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          Angemeldet bleiben
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={saving}>
          {saving ? 'Anmeldung läuft …' : 'Anmelden'}
        </button>
      </form>
    </main>
  )
}
