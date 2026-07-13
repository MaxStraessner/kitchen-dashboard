import { Navigate, Route, Routes } from 'react-router-dom'

import { DashboardPage } from '../pages/DashboardPage'
import { AdminRoute, LoginRoute, ProtectedRoute, SetupRoute } from '../auth/RouteGuards'
import { AccountPage } from '../pages/AccountPage'
import { LoginPage } from '../pages/LoginPage'
import { SettingsPage } from '../pages/SettingsPage'
import { SetupPage } from '../pages/SetupPage'
import { UsersPage } from '../pages/UsersPage'

export function App() {
  return (
    <Routes>
      <Route
        path="/setup"
        element={
          <SetupRoute>
            <SetupPage />
          </SetupRoute>
        }
      />
      <Route
        path="/login"
        element={
          <LoginRoute>
            <LoginPage />
          </LoginRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/account"
        element={
          <ProtectedRoute allowPasswordChange>
            <AccountPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/users"
        element={
          <AdminRoute>
            <UsersPage />
          </AdminRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
