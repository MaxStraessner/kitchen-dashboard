import type { DashboardResponse } from '../types/api'

export function createFallbackDashboard(now = new Date()): DashboardResponse {
  const stamp = now.toISOString()
  const forecast = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(now)
    date.setDate(date.getDate() + offset)
    return {
      date: date.toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' }),
      condition: 'Daten werden geladen',
      weather_code: 2,
      icon: 'cloud-sun',
      precipitation_probability: 20,
      high: 21,
      low: 13,
    }
  })
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
        forecast,
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
