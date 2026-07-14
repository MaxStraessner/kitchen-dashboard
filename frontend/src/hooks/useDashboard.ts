import { useEffect, useState } from 'react'

import { dashboardApi } from '../services/api'
import { createFallbackDashboard } from '../services/fallback'
import type { DashboardResponse } from '../types/api'

interface DashboardState {
  data: DashboardResponse
  loading: boolean
  offline: boolean
}

export function useDashboard(): DashboardState {
  const [state, setState] = useState<DashboardState>({
    data: createFallbackDashboard(),
    loading: true,
    offline: false,
  })

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const data = await dashboardApi.getDashboard(controller.signal)
        setState({ data, loading: false, offline: false })
      } catch {
        setState((current) => ({ ...current, loading: false, offline: true }))
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [])

  return state
}
