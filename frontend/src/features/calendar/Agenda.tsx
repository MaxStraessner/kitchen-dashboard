import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { useMinuteClock } from '../../hooks/useMinuteClock'
import { usePreviewCapacity } from '../../hooks/usePreviewCapacity'
import type { CalendarEvent, WeatherForecastDay } from '../../types/api'
import { WeatherIcon } from '../weather/WeatherIcon'
import { DayEventsDialog } from './DayEventsDialog'
import { dashboardTimeZone, dateKey, eventDateKeys, addDateDays, eventTimeLabel } from './dateUtils'

const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: dashboardTimeZone })
const shortDate = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
  timeZone: dashboardTimeZone,
})
const sourcePriority: Record<string, number> = {
  family: 10,
  hannah: 20,
  gabriel: 30,
  school_holidays: 40,
}

function compareEvents(left: CalendarEvent, right: CalendarEvent): number {
  if (left.allDay !== right.allDay) return left.allDay ? -1 : 1
  if (!left.allDay && !right.allDay) {
    const chronological = new Date(left.start).getTime() - new Date(right.start).getTime()
    if (chronological !== 0) return chronological
  }
  const priority =
    (sourcePriority[left.calendarId] ?? 100) - (sourcePriority[right.calendarId] ?? 100)
  return priority || left.title.localeCompare(right.title, 'de') || left.id.localeCompare(right.id)
}

function AgendaDay({
  date,
  today,
  events,
  forecast,
  onOpen,
}: {
  date: string
  today: string
  events: CalendarEvent[]
  forecast?: WeatherForecastDay
  onOpen: () => void
}) {
  const { ref, capacity } = usePreviewCapacity(events.length, 26, 2, true)
  const value = new Date(`${date}T12:00:00Z`)
  return (
    <section className="agenda-day" data-date={date}>
      <div className="agenda-date">
        <button
          type="button"
          className="agenda-date-button"
          aria-current={date === today ? 'date' : undefined}
          onClick={onOpen}
          aria-label={`Termine für ${date} anzeigen`}
          aria-describedby={events.length > capacity ? `agenda-overflow-${date}` : undefined}
        >
          <span>
            {weekday.format(value)}
            {events.length > capacity && (
              <small className="agenda-overflow-label" id={`agenda-overflow-${date}`}>
                + {events.length - capacity} weitere
              </small>
            )}
          </span>
          <strong>{shortDate.format(value)}</strong>
          {date === today && <em>Heute</em>}
        </button>
        {forecast && (
          <div
            className="agenda-weather"
            title={forecast.condition}
            aria-label={`${forecast.condition}, ${String(Math.round(forecast.high))} bis ${String(Math.round(forecast.low))} Grad, ${String(forecast.precipitation_probability)} Prozent Regenwahrscheinlichkeit`}
          >
            <WeatherIcon name={forecast.icon} />
            <span>
              {Math.round(forecast.high)}° / {Math.round(forecast.low)}°
            </span>
            <small>{forecast.precipitation_probability}% Regen</small>
          </div>
        )}
      </div>
      <div className="agenda-events" ref={ref}>
        {events.length === 0 && <p className="agenda-day-empty">Keine Termine</p>}
        {events.slice(0, capacity).map((event) => (
          <article
            className="agenda-event"
            key={event.id}
            aria-label={`${eventTimeLabel(event, date)} · ${event.title} · ${event.calendarName}${event.location ? ` · ${event.location}` : ''}`}
            title={`${event.title} · ${event.calendarName}${event.location ? ` · ${event.location}` : ''}`}
          >
            <time>{eventTimeLabel(event, date)}</time>
            <span
              className="calendar-dot"
              style={{ backgroundColor: event.color, color: event.color }}
            />
            <div className="agenda-copy">
              <h3>{event.title}</h3>
              <p>
                {event.calendarName}
                {event.location ? ` · ${event.location}` : ''}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export function Agenda({
  events,
  forecast,
  now,
}: {
  events: CalendarEvent[]
  forecast: WeatherForecastDay[]
  now?: Date
}) {
  const clock = useMinuteClock()
  const today = dateKey(now ?? clock)
  // null follows today; an explicitly selected week remains anchored across midnight.
  const [anchor, setAnchor] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const start = anchor && anchor > today ? anchor : today
  const groups = new Map<string, CalendarEvent[]>()
  let lastDate = addDateDays(today, 34)
  for (const event of events.filter((event) => !event.cancelled)) {
    for (const key of eventDateKeys(event)) {
      if (key < today) continue
      const group = groups.get(key) ?? []
      group.push(event)
      groups.set(key, group)
      if (key > lastDate) lastDate = key
    }
  }
  for (const group of groups.values()) group.sort(compareEvents)
  const days = Array.from({ length: 7 }, (_, index) => addDateDays(start, index))
  return (
    <div className="agenda-shell">
      <nav className="agenda-navigation" aria-label="Agenda-Zeitraum">
        <button
          type="button"
          aria-label="Vorherige sieben Tage"
          disabled={start === today}
          onClick={() => setAnchor(addDateDays(start, -7))}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setAnchor(null)}>
          Heute
        </button>
        <span>
          {shortDate.format(new Date(`${start}T12:00:00Z`))} –{' '}
          {shortDate.format(new Date(`${days[6] ?? start}T12:00:00Z`))}
        </span>
        <button
          type="button"
          aria-label="Nächste sieben Tage"
          disabled={addDateDays(start, 7) > lastDate}
          onClick={() => setAnchor(addDateDays(start, 7))}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </nav>
      <div className="agenda-list" data-testid="agenda">
        {days.map((date) => (
          <AgendaDay
            key={date}
            date={date}
            today={today}
            events={groups.get(date) ?? []}
            forecast={forecast.find((day) => day.date === date)}
            onOpen={() => setSelected(date)}
          />
        ))}
      </div>
      {selected && (
        <DayEventsDialog
          date={selected}
          events={groups.get(selected) ?? []}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
