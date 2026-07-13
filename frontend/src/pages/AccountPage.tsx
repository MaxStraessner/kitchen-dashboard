import { ArrowLeft, KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { authApi } from '../auth/AuthApiClient'
import { useAuth } from '../auth/AuthProvider'
import { ApiError } from '../services/api'

export function AccountPage() {
  const auth = useAuth()
  const user = auth.user
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    passwordConfirmation: '',
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      auth.setUser(await authApi.updateAccount(displayName))
      setMessage('Anzeigename gespeichert.')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Änderung fehlgeschlagen.')
    }
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (passwords.newPassword !== passwords.passwordConfirmation)
      return setError('Die Passwörter stimmen nicht überein.')
    try {
      auth.setUser(await authApi.changePassword(passwords))
      setPasswords({ currentPassword: '', newPassword: '', passwordConfirmation: '' })
      setMessage('Passwort sicher geändert.')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Passwortänderung fehlgeschlagen.')
    }
  }
  return (
    <main className="page-shell account-page">
      <header className="page-header">
        <div>
          <p className="auth-eyebrow">Mein Konto</p>
          <h1>{user?.displayName}</h1>
          <p>
            {user?.mustChangePassword
              ? 'Bitte ändere zuerst dein vorläufiges Passwort.'
              : 'Deine persönlichen Einstellungen.'}
          </p>
        </div>
        {!user?.mustChangePassword && (
          <Link className="quiet-button" to="/settings">
            <ArrowLeft />
            Einstellungen
          </Link>
        )}
      </header>
      {(message || error) && (
        <p
          className={error ? 'form-error status-message' : 'form-success status-message'}
          role="status"
        >
          {error || message}
        </p>
      )}
      <div className="account-grid">
        <section className="form-card">
          <header>
            <UserRound />
            <h2>Kontodaten</h2>
          </header>
          <dl>
            <div>
              <dt>Benutzername</dt>
              <dd>{user?.username}</dd>
            </div>
            <div>
              <dt>Rolle</dt>
              <dd>{user?.role === 'admin' ? 'Administrator' : 'Mitglied'}</dd>
            </div>
            <div>
              <dt>Haushalt</dt>
              <dd>{user?.household.name}</dd>
            </div>
          </dl>
          <form onSubmit={(event) => void saveProfile(event)}>
            <label>
              Anzeigename
              <input
                required
                maxLength={80}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <button className="primary-button">Änderung speichern</button>
          </form>
        </section>
        <section className="form-card">
          <header>
            <KeyRound />
            <h2>Passwort ändern</h2>
          </header>
          <form onSubmit={(event) => void changePassword(event)}>
            <label>
              Aktuelles Passwort
              <input
                required
                type="password"
                autoComplete="current-password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              />
            </label>
            <label>
              Neues Passwort
              <input
                required
                minLength={12}
                maxLength={128}
                type="password"
                autoComplete="new-password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
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
                value={passwords.passwordConfirmation}
                onChange={(e) =>
                  setPasswords({ ...passwords, passwordConfirmation: e.target.value })
                }
              />
            </label>
            <button className="primary-button">Passwort ändern</button>
          </form>
        </section>
      </div>
      <section className="session-actions">
        <button
          className="quiet-button"
          onClick={() =>
            void authApi
              .revokeOtherSessions()
              .then(() => setMessage('Andere Sitzungen wurden abgemeldet.'))
          }
        >
          <ShieldCheck />
          Andere Sitzungen abmelden
        </button>
        <button
          className="quiet-button quiet-button--danger"
          onClick={() =>
            void auth.logout().then(
              () => void navigate('/login'),
              () => setError('Abmeldung fehlgeschlagen.'),
            )
          }
        >
          <LogOut />
          Aktuelle Sitzung abmelden
        </button>
      </section>
    </main>
  )
}
