import {
  ArrowLeft,
  KeyRound,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { authApi } from '../auth/AuthApiClient'
import type { AdminUser, Role } from '../auth/types'
import { ApiError } from '../services/api'

const emptyForm = {
  displayName: '',
  username: '',
  role: 'member' as Role,
  password: '',
  passwordConfirmation: '',
}

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    try {
      setUsers(await authApi.users())
    } catch (reason) {
      setError(
        reason instanceof ApiError ? reason.message : 'Benutzer konnten nicht geladen werden.',
      )
    }
  }
  useEffect(() => {
    void load()
  }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (form.password !== form.passwordConfirmation)
      return setError('Die Passwörter stimmen nicht überein.')
    try {
      await authApi.createUser({ ...form, isActive: true })
      setForm(emptyForm)
      setCreating(false)
      setMessage('Benutzer wurde angelegt.')
      await load()
    } catch (reason) {
      setError(
        reason instanceof ApiError ? reason.message : 'Benutzer konnte nicht angelegt werden.',
      )
    }
  }
  async function update(user: AdminUser, changes: Parameters<typeof authApi.updateUser>[1]) {
    setError('')
    setMessage('')
    if (changes.isActive === false && !window.confirm(`${user.displayName} wirklich deaktivieren?`))
      return
    try {
      await authApi.updateUser(user.id, changes)
      setMessage('Benutzer wurde aktualisiert.')
      await load()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Änderung fehlgeschlagen.')
    }
  }
  async function reset(user: AdminUser) {
    const temporary = window.prompt(
      `Neues vorläufiges Passwort für ${user.displayName} (mindestens 12 Zeichen):`,
    )
    if (!temporary) return
    try {
      await authApi.resetPassword(user.id, temporary, temporary)
      setMessage('Vorläufiges Passwort wurde gesetzt.')
      await load()
    } catch (reason) {
      setError(
        reason instanceof ApiError ? reason.message : 'Passwort konnte nicht zurückgesetzt werden.',
      )
    }
  }
  async function edit(user: AdminUser) {
    const displayName = window.prompt('Anzeigename:', user.displayName)
    if (displayName === null) return
    const username = window.prompt('Benutzername:', user.username)
    if (username === null) return
    await update(user, { displayName, username })
  }

  return (
    <main className="page-shell users-page">
      <header className="page-header">
        <div>
          <p className="auth-eyebrow">Administration</p>
          <h1>Benutzerverwaltung</h1>
          <p>Konten und Rollen eures Haushalts.</p>
        </div>
        <div className="header-actions">
          <Link className="quiet-button" to="/settings">
            <ArrowLeft />
            Einstellungen
          </Link>
          <button className="primary-button inline-button" onClick={() => setCreating(true)}>
            <Plus />
            Benutzer hinzufügen
          </button>
        </div>
      </header>
      {(message || error) && (
        <p
          className={error ? 'form-error status-message' : 'form-success status-message'}
          role="status"
        >
          {error || message}
        </p>
      )}
      <div className="user-list">
        {users.map((user) => (
          <article className={`user-card ${!user.isActive ? 'is-inactive' : ''}`} key={user.id}>
            <div className="user-avatar">
              <UserRound />
            </div>
            <div className="user-copy">
              <h2>{user.displayName}</h2>
              <p>@{user.username}</p>
              <div className="user-badges">
                <span>{user.role === 'admin' ? 'Administrator' : 'Mitglied'}</span>
                <span className={user.isActive ? 'is-active' : ''}>
                  {user.isActive ? 'Aktiv' : 'Deaktiviert'}
                </span>
                {user.mustChangePassword && <span>Passwortänderung erforderlich</span>}
              </div>
              <small>
                Letzte Anmeldung:{' '}
                {user.lastLoginAt
                  ? new Intl.DateTimeFormat('de-DE', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(user.lastLoginAt))
                  : 'Noch nie'}
              </small>
            </div>
            <div className="user-actions">
              <button className="quiet-button" onClick={() => void edit(user)}>
                <Pencil />
                Benutzer bearbeiten
              </button>
              <button
                className="quiet-button"
                onClick={() =>
                  void update(user, { role: user.role === 'admin' ? 'member' : 'admin' })
                }
              >
                <ShieldCheck />
                {user.role === 'admin' ? 'Zum Mitglied' : 'Zum Administrator'}
              </button>
              <button className="quiet-button" onClick={() => void reset(user)}>
                <KeyRound />
                Passwort zurücksetzen
              </button>
              <button
                className="quiet-button"
                onClick={() =>
                  void authApi
                    .revokeSessions(user.id)
                    .then(() => setMessage('Sitzungen wurden widerrufen.'))
                }
              >
                <RefreshCw />
                Sitzungen widerrufen
              </button>
              <button
                className={`quiet-button ${user.isActive ? 'quiet-button--danger' : ''}`}
                onClick={() => void update(user, { isActive: !user.isActive })}
              >
                <Power />
                {user.isActive ? 'Deaktivieren' : 'Aktivieren'}
              </button>
            </div>
          </article>
        ))}
      </div>
      {creating && (
        <div className="sheet-backdrop">
          <form className="user-dialog" onSubmit={(event) => void create(event)}>
            <header>
              <div>
                <p className="auth-eyebrow">Neues Konto</p>
                <h2>Benutzer hinzufügen</h2>
              </div>
              <button
                type="button"
                aria-label="Dialog schließen"
                onClick={() => setCreating(false)}
              >
                <X />
              </button>
            </header>
            <label>
              Anzeigename
              <input
                required
                maxLength={80}
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
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </label>
            <label>
              Rolle
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              >
                <option value="member">Mitglied</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            <label>
              Vorläufiges Passwort
              <input
                required
                minLength={12}
                maxLength={128}
                type="password"
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
                value={form.passwordConfirmation}
                onChange={(e) => setForm({ ...form, passwordConfirmation: e.target.value })}
              />
            </label>
            <p className="auth-hint">
              Der Benutzer muss das vorläufige Passwort bei der ersten Anmeldung ändern.
            </p>
            <button className="primary-button">Benutzer speichern</button>
          </form>
        </div>
      )}
    </main>
  )
}
