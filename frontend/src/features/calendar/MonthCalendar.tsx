import { ChevronLeft, ChevronRight } from 'lucide-react'

import type { CalendarEvent } from '../../types/api'
import { dateKey, eventDate, isSameDay } from './dateUtils'

const monthYear = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })
const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export function MonthCalendar({
  events,
  now = new Date(),
}: {
  events: CalendarEvent[]
  now?: Date
}) {
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const leading = (first.getDay() + 6) % 7
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - leading)
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return date
  })
  const eventDays = new Set(events.map((event) => dateKey(eventDate(event))))

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
              date.getMonth() !== now.getMonth() ? 'is-outside' : '',
              isSameDay(date, now) ? 'is-today' : '',
              eventDays.has(dateKey(date)) ? 'has-event' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {date.getDate()}
          </span>
        ))}
      </div>
    </section>
  )
}
