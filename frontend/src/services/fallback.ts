import type { DashboardResponse } from '../types/api'

export function createFallbackDashboard(now = new Date()): DashboardResponse {
  const stamp = now.toISOString()
  return {
    weather: {
      data: {
        location: 'Unna',
        temperature: 18,
        condition: 'Daten werden geladen',
        weather_code: 2,
        icon: 'cloud-sun',
        is_day: true,
        wind_speed: 8,
        precipitation_probability: 20,
        high: 21,
        low: 13,
        observed_at: stamp,
      },
      meta: { updated_at: stamp, stale: true, demo_mode: false },
    },
    calendar: {
      events: [],
      sources: [],
      hidden_event_count: 0,
      meta: { updated_at: stamp, stale: true, demo_mode: false },
    },
    meta: { updated_at: stamp, stale: true, demo_mode: false },
  }
}
