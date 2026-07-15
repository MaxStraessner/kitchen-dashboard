import { CheckSquare, Gauge, LogOut, Settings, UserRound, UsersRound, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'

export function SettingsMenu() {
  const [open, setOpen] = useState(false)
  const auth = useAuth()
  const navigate = useNavigate()

  async function signOut() {
    await auth.logout()
    void navigate('/login', { replace: true })
  }

  return (
    <>
      <button
        className="settings-trigger"
        aria-label="Einstellungen öffnen"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Settings />
      </button>
      {open && (
        <div className="sheet-backdrop" onMouseDown={() => setOpen(false)}>
          <aside
            className="settings-sheet"
            aria-label="Einstellungen"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <small>{auth.user?.household.name}</small>
                <strong>{auth.user?.displayName}</strong>
              </div>
              <button aria-label="Einstellungen schließen" onClick={() => setOpen(false)}>
                <X />
              </button>
            </header>
            <nav aria-label="Einstellungsnavigation">
              <Link to="/" onClick={() => setOpen(false)}>
                <Gauge />
                Dashboard
              </Link>
              <Link to="/account" onClick={() => setOpen(false)}>
                <UserRound />
                Mein Konto
              </Link>
              <Link to="/settings/tasks" onClick={() => setOpen(false)}>
                <CheckSquare />
                Aufgaben
              </Link>
              {auth.user?.role === 'admin' && (
                <Link to="/settings/users" onClick={() => setOpen(false)}>
                  <UsersRound />
                  Benutzerverwaltung
                </Link>
              )}
            </nav>
            <div className="future-settings">
              <span>Spätere Bereiche</span>
              <button disabled>Kalender</button>
              <button disabled>Integrationen</button>
              <button disabled>Anzeige &amp; Geräte</button>
            </div>
            <button className="logout-button" onClick={() => void signOut()}>
              <LogOut />
              Abmelden
            </button>
          </aside>
        </div>
      )}
    </>
  )
}
