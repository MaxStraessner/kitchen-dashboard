import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { ApiError } from '../services/api'
import { authApi } from './AuthApiClient'
import type { CurrentUser } from './types'

interface AuthValue {
  user: CurrentUser | null
  loading: boolean
  setupRequired: boolean
  backendUnavailable: boolean
  login(username: string, password: string, rememberMe: boolean): Promise<CurrentUser>
  initialize(payload: Parameters<typeof authApi.initialize>[0]): Promise<CurrentUser>
  logout(): Promise<void>
  refresh(): Promise<void>
  setUser(user: CurrentUser): void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)
  const [backendUnavailable, setBackendUnavailable] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setBackendUnavailable(false)
    try {
      const status = await authApi.setupStatus()
      setSetupRequired(status.setupRequired)
      if (status.setupRequired) setUserState(null)
      else {
        try {
          setUserState(await authApi.me())
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) throw error
          setUserState(null)
        }
      }
    } catch {
      setBackendUnavailable(true)
      setUserState(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const expired = () => setUserState(null)
    window.addEventListener('kitchen:unauthorized', expired)
    return () => window.removeEventListener('kitchen:unauthorized', expired)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      setupRequired,
      backendUnavailable,
      login: async (username, password, rememberMe) => {
        const next = await authApi.login({ username, password, rememberMe })
        setUserState(next)
        return next
      },
      initialize: async (payload) => {
        const next = await authApi.initialize(payload)
        setSetupRequired(false)
        setUserState(next)
        return next
      },
      logout: async () => {
        await authApi.logout()
        setUserState(null)
      },
      refresh,
      setUser: setUserState,
    }),
    [user, loading, setupRequired, backendUnavailable, refresh],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
