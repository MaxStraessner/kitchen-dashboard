import { Navigate } from 'react-router-dom'

import { useAuth } from './AuthProvider'

function AuthLoading() {
  return (
    <main className="auth-shell">
      <div className="auth-card">Kitchen Dashboard wird geladen …</div>
    </main>
  )
}

export function SetupRoute({ children }: { children: React.ReactNode }) {
  const { loading, setupRequired, user, backendUnavailable } = useAuth()
  if (loading) return <AuthLoading />
  if (backendUnavailable)
    return (
      <main className="auth-shell">
        <div className="auth-card">
          <h1>Backend nicht erreichbar</h1>
          <p>Bitte prüfe, ob die Anwendung vollständig gestartet ist.</p>
        </div>
      </main>
    )
  if (!setupRequired) return <Navigate to={user ? '/' : '/login'} replace />
  return children
}

export function LoginRoute({ children }: { children: React.ReactNode }) {
  const { loading, setupRequired, user } = useAuth()
  if (loading) return <AuthLoading />
  if (setupRequired) return <Navigate to="/setup" replace />
  if (user) return <Navigate to={user.mustChangePassword ? '/account' : '/'} replace />
  return children
}

export function ProtectedRoute({
  children,
  allowPasswordChange = false,
}: {
  children: React.ReactNode
  allowPasswordChange?: boolean
}) {
  const { loading, setupRequired, user, backendUnavailable } = useAuth()
  if (loading) return <AuthLoading />
  if (backendUnavailable) return <Navigate to="/login" replace />
  if (setupRequired) return <Navigate to="/setup" replace />
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword && !allowPasswordChange) return <Navigate to="/account" replace />
  return children
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  return (
    <ProtectedRoute>
      {user?.role === 'admin' ? children : <Navigate to="/settings" replace />}
    </ProtectedRoute>
  )
}
