import { Droplets, MapPin } from 'lucide-react'

import type { CalendarEvent, WeatherForecastDay } from '../../types/api'
import { WeatherIcon } from '../weather/WeatherIcon'
import { dashboardTimeZone, dateKey, eventDateKeys, isSameDay } from './dateUtils'

const weekday = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  timeZone: dashboardTimeZone,
})
const month = new Intl.DateTimeFormat('de-DE', {
  month: 'short',
  timeZone: dashboardTimeZone,
})
const day = new Intl.DateTimeFormat('de-DE', { day: 'numeric', timeZone: dashboardTimeZone })
const time = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
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
  return priority !== 0 ? priority : left.title.localeCompare(right.title, 'de')
}

function dateFromKey(key: string): Date {
  return new Date(`${key}T12:00:00Z`)
}

function eventTimeLabel(event: CalendarEvent, occurrenceKey: string): string {
  if (event.allDay) return 'Ganztägig'
  const keys = eventDateKeys(event)
  if (occurrenceKey === keys[0]) return time.format(new Date(event.start))
  if (occurrenceKey === keys.at(-1)) return `Bis ${time.format(new Date(event.end))}`
  return 'Fortlaufend'
}

interface Group {
  key: string
  date: Date
  events: CalendarEvent[]
  forecast?: WeatherForecastDay
}

export function Agenda({
  events,
  forecast,
  now = new Date(),
}: {
  events: CalendarEvent[]
  forecast: WeatherForecastDay[]
  now?: Date
}) {
  const todayKey = dateKey(now)
  const groups = new Map<string, Group>()

  for (const weather of forecast.slice(0, 7)) {
    groups.set(weather.date, {
      key: weather.date,
      date: dateFromKey(weather.date),
      events: [],
      forecast: weather,
    })
  }

  for (const event of events.filter((item) => !item.cancelled)) {
    for (const key of eventDateKeys(event)) {
      if (key < todayKey) continue
      const group = groups.get(key) ?? { key, date: dateFromKey(key), events: [] }
      group.events.push(event)
      groups.set(key, group)
    }
  }

  const days = [...groups.values()]
    .filter((group) => group.key >= todayKey)
    .sort((left, right) => left.key.localeCompare(right.key))
  for (const group of days) group.events.sort(compareEvents)

  if (days.length === 0)
    return <div className="agenda-empty">In den nächsten fünf Wochen stehen keine Termine an.</div>

  return (
    <div className="agenda-list" data-testid="agenda">
      {days.map((group) => (
        <section className="agenda-day" key={group.key} data-date={group.key}>
          <div className="agenda-date">
            <span>{weekday.format(group.date).replace('.', '')}</span>
            <strong>{day.format(group.date)}</strong>
            <small>{month.format(group.date).replace('.', '')}</small>
            {isSameDay(group.date, now) && <em>Heute</em>}
            {group.forecast && (
              <div
                className="agenda-weather"
                aria-label={`${group.forecast.condition}, ${String(Math.round(group.forecast.high))} bis ${String(Math.round(group.forecast.low))} Grad, ${String(group.forecast.precipitation_probability)} Prozent Regenwahrscheinlichkeit`}
                title={group.forecast.condition}
              >
                <WeatherIcon name={group.forecast.icon} />
                <span>
                  {Math.round(group.forecast.high)}° <i>{Math.round(group.forecast.low)}°</i>
                </span>
                <small>
                  <Droplets aria-hidden="true" /> {group.forecast.precipitation_probability}%
                </small>
              </div>
            )}
          </div>
          <div className="agenda-events">
            {group.events.length === 0 && <p className="agenda-day-empty">Keine Termine</p>}
            {group.events.map((event, index) => (
              <article className="agenda-event" key={`${group.key}-${event.id}-${String(index)}`}>
                <time>{eventTimeLabel(event, group.key)}</time>
                <span
                  className="calendar-dot"
                  style={{ backgroundColor: event.color, color: event.color }}
                />
                <div className="agenda-copy">
                  <h3>{event.title}</h3>
                  <p>
                    {event.calendarName}
                    {event.location && (
                      <>
                        <span> · </span>
                        <MapPin aria-hidden="true" /> {event.location}
                      </>
                    )}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
