import { fireEvent, render, screen, within } from '@testing-library/react'

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

test('bounds the preview and makes every appointment accessible in a day dialog', () => {
  const events = Array.from({ length: 15 }, (_, index) => ({
    ...baseEvent,
    id: `event-${String(index)}`,
    title: `Termin ${String(index + 1)}`,
  }))
  render(<Agenda events={events} forecast={forecast} now={new Date('2026-07-15T07:00:00Z')} />)

  expect(screen.getAllByRole('article')).toHaveLength(2)
  expect(screen.getByText('+ 13 weitere')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Termine für 2026-07-15 anzeigen' }))
  expect(within(screen.getByRole('dialog')).getAllByRole('article')).toHaveLength(15)
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

test('pages through empty days and future events and returns to today', () => {
  render(
    <Agenda
      events={[
        { ...baseEvent, title: 'Später', start: '2026-08-18', end: '2026-08-19', allDay: true },
      ]}
      forecast={[]}
      now={new Date('2026-07-15T08:00:00Z')}
    />,
  )
  expect(document.querySelectorAll('.agenda-day')).toHaveLength(7)
  expect(screen.getByRole('button', { name: 'Vorherige sieben Tage' })).toBeDisabled()
  for (let index = 0; index < 4; index++)
    fireEvent.click(screen.getByRole('button', { name: 'Nächste sieben Tage' }))
  expect(screen.getByText('Später')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Heute' }))
  expect(document.querySelector('[data-date="2026-07-15"]')).toBeInTheDocument()
})

test('sorts all-day first and timed events chronologically without dropping details', () => {
  render(
    <Agenda
      events={[
        { ...baseEvent, id: 'late', title: 'Nachmittag', start: '2026-07-15T14:00:00Z' },
        {
          ...baseEvent,
          id: 'early',
          title: 'Vormittag',
          description: 'Vollständige Beschreibung',
          location: 'Unna',
        },
        {
          ...baseEvent,
          id: 'all',
          title: 'Ganzer Tag',
          start: '2026-07-15',
          end: '2026-07-16',
          allDay: true,
        },
        { ...baseEvent, id: 'cancel', title: 'Entfällt', cancelled: true },
      ]}
      forecast={[]}
      now={new Date('2026-07-15T08:00:00Z')}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Termine für 2026-07-15 anzeigen' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)).toEqual([
    'Ganzer Tag',
    'Vormittag',
    'Nachmittag',
  ])
  expect(dialog.getByText('Vollständige Beschreibung')).toBeInTheDocument()
  expect(dialog.getByText('Ort: Unna')).toBeInTheDocument()
  expect(dialog.queryByText('Entfällt')).not.toBeInTheDocument()
})

test('follows Berlin midnight while preserving a deliberately selected future week', () => {
  const { rerender } = render(
    <Agenda events={[]} forecast={[]} now={new Date('2026-10-24T21:59:00Z')} />,
  )
  expect(document.querySelector('[data-date="2026-10-24"]')).toBeInTheDocument()
  rerender(<Agenda events={[]} forecast={[]} now={new Date('2026-10-24T22:01:00Z')} />)
  expect(document.querySelector('[data-date="2026-10-25"]')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Nächste sieben Tage' }))
  expect(document.querySelector('[data-date="2026-11-01"]')).toBeInTheDocument()
  rerender(<Agenda events={[]} forecast={[]} now={new Date('2026-10-25T23:01:00Z')} />)
  expect(document.querySelector('[data-date="2026-11-01"]')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Heute' }))
  expect(document.querySelector('[data-date="2026-10-26"]')).toBeInTheDocument()
})
