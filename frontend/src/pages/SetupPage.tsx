import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { ApiError } from '../services/api'

export function SetupPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    householdName: 'Familie',
    displayName: '',
    username: '',
    password: '',
    passwordConfirmation: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (form.password !== form.passwordConfirmation)
      return setError('Die Passwörter stimmen nicht überein.')
    setSaving(true)
    setError('')
    try {
      await auth.initialize(form)
      setForm((value) => ({ ...value, password: '', passwordConfirmation: '' }))
      void navigate('/', { replace: true })
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : 'Die Einrichtung konnte nicht abgeschlossen werden.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="auth-shell">
      <form
        className="auth-card"
        onSubmit={(event) => void submit(event)}
        aria-label="Ersteinrichtung"
      >
        <p className="auth-eyebrow">Kitchen Dashboard</p>
        <h1>Willkommen</h1>
        <p>Richte euren gemeinsamen Familienhaushalt und dein persönliches Konto ein.</p>
        <label>
          Haushaltsname
          <input
            required
            maxLength={100}
            value={form.householdName}
            onChange={(e) => setForm({ ...form, householdName: e.target.value })}
          />
        </label>
        <label>
          Anzeigename
          <input
            required
            maxLength={80}
            autoComplete="name"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </label>
        <label>
          Benutzername
          <input
            required
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9._-]+"
            autoComplete="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </label>
        <label>
          Passwort
          <input
            required
            minLength={12}
            maxLength={128}
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label>
          Passwort bestätigen
          <input
            required
            minLength={12}
            maxLength={128}
            type="password"
            autoComplete="new-password"
            value={form.passwordConfirmation}
            onChange={(e) => setForm({ ...form, passwordConfirmation: e.target.value })}
          />
        </label>
        <p className="auth-hint">Das erste Konto erhält Administratorrechte.</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={saving}>
          {saving ? 'Wird eingerichtet …' : 'Familie einrichten'}
        </button>
      </form>
    </main>
  )
}
