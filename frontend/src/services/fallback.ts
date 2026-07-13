import type { CalendarEvent, CalendarSource, DashboardResponse } from '../types/api'

const defaultSource: CalendarSource = {
  id: 'family',
  name: 'Familie',
  color: '#62D68B',
  category: 'family',
  stale: true,
  last_success_at: null,
}
const sources: CalendarSource[] = [
  defaultSource,
  {
    id: 'max',
    name: 'Max',
    color: '#5FA8FF',
    category: 'personal',
    stale: true,
    last_success_at: null,
  },
  {
    id: 'jessica',
    name: 'Jessica',
    color: '#C28CFF',
    category: 'personal',
    stale: true,
    last_success_at: null,
  },
  {
    id: 'school',
    name: 'Schule',
    color: '#FFB65C',
    category: 'school',
    stale: true,
    last_success_at: null,
  },
]
const specs = [
  [0, 10, 'Projektbesprechung', 'max'],
  [0, 17, 'Fußballtraining Gabriel', 'family'],
  [1, 18, 'Abendessen bei Oma und Opa', 'family'],
  [3, 15, 'Hannah Schulfest', 'school'],
  [5, 9, 'Zahnarzttermin', 'jessica'],
  [7, 11, 'Team Meeting', 'max'],
  [9, 18, 'Yoga', 'jessica'],
] as const

export function createFallbackDashboard(now = new Date()): DashboardResponse {
  const events: CalendarEvent[] = specs.map(([offset, hour, title, sourceId], index) => {
    const start = new Date(now)
    start.setDate(now.getDate() + offset)
    start.setHours(hour, index % 2 ? 30 : 0, 0, 0)
    const end = new Date(start.getTime() + 75 * 60_000)
    const source = sources.find((item) => item.id === sourceId) ?? defaultSource
    return {
      id: `fallback-${String(index)}`,
      calendarId: source.id,
      calendarName: source.name,
      title,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      location: index % 2 ? 'Unna' : null,
      description: null,
      color: source.color,
      source: source.name,
      lastModified: null,
      cancelled: false,
      stale: true,
    }
  })
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
      events,
      sources,
      hidden_event_count: 0,
      meta: { updated_at: stamp, stale: true, demo_mode: true },
    },
    meta: { updated_at: stamp, stale: true, demo_mode: true },
  }
}
