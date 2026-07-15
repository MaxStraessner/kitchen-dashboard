import { ChevronLeft, ChevronRight } from 'lucide-react'

import type { CalendarEvent } from '../../types/api'
import { dashboardTimeZone, dateKey, eventDateKeys } from './dateUtils'

const monthYear = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: dashboardTimeZone,
})
const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export function MonthCalendar({
  events,
  now = new Date(),
}: {
  events: CalendarEvent[]
  now?: Date
}) {
  const [year, month] = dateKey(now).split('-').map(Number)
  const first = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1, 12))
  const leading = (first.getUTCDay() + 6) % 7
  const gridStart = new Date(first)
  gridStart.setUTCDate(first.getUTCDate() - leading)
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setUTCDate(gridStart.getUTCDate() + index)
    return date
  })
  const eventDays = new Map<string, string[]>()
  for (const event of events) {
    for (const key of eventDateKeys(event)) {
      const colors = eventDays.get(key) ?? []
      if (!colors.includes(event.color)) colors.push(event.color)
      eventDays.set(key, colors)
    }
  }
  const todayKey = dateKey(now)

  return (
    <section className="month-calendar" aria-label="Monatskalender">
      <header>
        <h3>{monthYear.format(now)}</h3>
        <div className="month-nav" aria-label="Monatsnavigation vorbereitet">
          <button type="button" disabled aria-label="Vorheriger Monat">
            <ChevronLeft />
          </button>
          <button type="button" disabled aria-label="Nächster Monat">
            <ChevronRight />
          </button>
        </div>
      </header>
      <div className="month-grid month-weekdays">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="month-grid month-days">
        {days.map((date) => (
          <span
            key={dateKey(date)}
            className={[
              date.getUTCMonth() !== first.getUTCMonth() ? 'is-outside' : '',
              dateKey(date) === todayKey ? 'is-today' : '',
              eventDays.has(dateKey(date)) ? 'has-event' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {date.getUTCDate()}
            {eventDays.has(dateKey(date)) && (
              <span className="month-event-dots" aria-hidden="true">
                {eventDays
                  .get(dateKey(date))
                  ?.slice(0, 4)
                  .map((color) => (
                    <i key={color} style={{ backgroundColor: color }} />
                  ))}
              </span>
            )}
          </span>
        ))}
      </div>
    </section>
  )
}
