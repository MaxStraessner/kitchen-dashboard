import { render, screen, within } from '@testing-library/react'

import { Agenda } from '../features/calendar/Agenda'
import type { CalendarEvent, WeatherForecastDay } from '../types/api'

const baseEvent: CalendarEvent = {
  id: 'base',
  calendarId: 'family',
  calendarName: 'Familie',
  title: 'Termin',
  start: '2026-07-15T08:00:00Z',
  end: '2026-07-15T09:00:00Z',
  allDay: false,
  location: null,
  description: null,
  color: '#62D68B',
  source: 'Familie',
  lastModified: null,
  cancelled: false,
  stale: false,
}

const forecast: WeatherForecastDay[] = Array.from({ length: 7 }, (_, index) => ({
  date: `2026-07-${String(15 + index).padStart(2, '0')}`,
  condition: index === 0 ? 'Klar' : 'Bedeckt',
  weather_code: index === 0 ? 0 : 3,
  icon: index === 0 ? 'sun' : 'cloud',
  precipitation_probability: index * 10,
  high: 24 - index,
  low: 14 - index,
}))

test('shows every appointment without a global limit and keeps Berlin local time', () => {
  const events = Array.from({ length: 15 }, (_, index) => ({
    ...baseEvent,
    id: `event-${String(index)}`,
    title: `Termin ${String(index + 1)}`,
  }))
  render(<Agenda events={events} forecast={forecast} now={new Date('2026-07-15T07:00:00Z')} />)

  expect(screen.getAllByRole('article')).toHaveLength(15)
  expect(screen.queryByText(/weitere Termine/)).not.toBeInTheDocument()
  expect(screen.getAllByText('10:00')[0]).toBeInTheDocument()
})

test('places a timed event around midnight on its Berlin calendar day', () => {
  const event = {
    ...baseEvent,
    id: 'late',
    title: 'Später Termin',
    start: '2026-07-14T22:30:00Z',
    end: '2026-07-14T23:30:00Z',
  }
  render(<Agenda events={[event]} forecast={forecast} now={new Date('2026-07-15T00:00:00Z')} />)

  const daySection = document.querySelector('[data-date="2026-07-15"]')
  expect(daySection).not.toBeNull()
  expect(within(daySection as HTMLElement).getByText('Später Termin')).toBeInTheDocument()
  expect(within(daySection as HTMLElement).getByText('00:30')).toBeInTheDocument()
})

test('repeats multi-day events on every affected day and integrates seven forecasts', () => {
  const holiday = {
    ...baseEvent,
    id: 'holiday',
    title: 'Sommerferien',
    start: '2026-07-15',
    end: '2026-07-18',
    allDay: true,
  }
  render(<Agenda events={[holiday]} forecast={forecast} now={new Date('2026-07-15T08:00:00Z')} />)

  expect(screen.getAllByText('Sommerferien')).toHaveLength(3)
  expect(screen.getAllByLabelText(/Grad/)).toHaveLength(7)
  expect(document.querySelectorAll('.agenda-day')).toHaveLength(7)
})
