import { MapPin } from 'lucide-react'

import type { CalendarEvent } from '../../types/api'
import { dashboardTimeZone, dateKey, eventDate, isSameDay } from './dateUtils'

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
  const dayOrder = dateKey(eventDate(left)).localeCompare(dateKey(eventDate(right)))
  if (dayOrder !== 0) return dayOrder
  if (left.allDay !== right.allDay) return left.allDay ? -1 : 1
  if (!left.allDay && !right.allDay) {
    const chronological = new Date(left.start).getTime() - new Date(right.start).getTime()
    if (chronological !== 0) return chronological
  }
  const priority =
    (sourcePriority[left.calendarId] ?? 100) - (sourcePriority[right.calendarId] ?? 100)
  return priority !== 0 ? priority : left.title.localeCompare(right.title, 'de')
}

interface Group {
  date: Date
  events: CalendarEvent[]
}

export function Agenda({ events }: { events: CalendarEvent[] }) {
  const sorted = events.filter((event) => !event.cancelled).sort(compareEvents)
  const visible = sorted.slice(0, 11)
  const groups = visible.reduce<Group[]>((result, event) => {
    const date = eventDate(event)
    const existing = result.find((group) => dateKey(group.date) === dateKey(date))
    if (existing) existing.events.push(event)
    else result.push({ date, events: [event] })
    return result
  }, [])
  const hidden = Math.max(0, sorted.length - visible.length)

  if (groups.length === 0)
    return <div className="agenda-empty">In den nächsten fünf Wochen stehen keine Termine an.</div>
  return (
    <div className="agenda-list" data-testid="agenda">
      {groups.map((group) => (
        <section className="agenda-day" key={dateKey(group.date)}>
          <div className="agenda-date">
            <span>{weekday.format(group.date).replace('.', '')}</span>
            <strong>{day.format(group.date)}</strong>
            <small>{month.format(group.date).replace('.', '')}</small>
            {isSameDay(group.date, new Date()) && <em>Heute</em>}
          </div>
          <div className="agenda-events">
            {group.events.map((event) => (
              <article className="agenda-event" key={event.id}>
                <time>{event.allDay ? 'Ganztägig' : time.format(new Date(event.start))}</time>
                <span className="calendar-dot" style={{ backgroundColor: event.color }} />
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
      {hidden > 0 && <p className="agenda-more">+ {hidden} weitere Termine</p>}
    </div>
  )
}
