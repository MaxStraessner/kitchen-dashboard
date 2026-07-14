import { Gauge, LogOut, UserRound, UsersRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'

export function SettingsPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  async function signOut() {
    await auth.logout()
    void navigate('/login')
  }
  return (
    <main className="settings-page page-shell">
      <header className="page-header">
        <div>
          <p className="auth-eyebrow">{auth.user?.household.name}</p>
          <h1>Einstellungen</h1>
          <p>Persönlich, übersichtlich und für euren Haushalt.</p>
        </div>
        <Link className="quiet-button" to="/">
          <Gauge />
          Dashboard
        </Link>
      </header>
      <div className="settings-card-grid">
        <Link className="settings-card" to="/account">
          <UserRound />
          <div>
            <h2>Mein Konto</h2>
            <p>Anzeigename, Passwort und Sitzungen verwalten</p>
          </div>
        </Link>
        {auth.user?.role === 'admin' && (
          <Link className="settings-card" to="/settings/users">
            <UsersRound />
            <div>
              <h2>Benutzerverwaltung</h2>
              <p>Konten, Rollen und Zugänge der Familie verwalten</p>
            </div>
          </Link>
        )}
        <button className="settings-card settings-card--button" onClick={() => void signOut()}>
          <LogOut />
          <div>
            <h2>Abmelden</h2>
            <p>Diese Sitzung sicher beenden</p>
          </div>
        </button>
      </div>
    </main>
  )
}
