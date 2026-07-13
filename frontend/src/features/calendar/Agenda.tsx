import { MapPin } from 'lucide-react'

import type { CalendarEvent } from '../../types/api'
import { dateKey, eventDate, isSameDay } from './dateUtils'

const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short' })
const month = new Intl.DateTimeFormat('de-DE', { month: 'short' })
const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

interface Group {
  date: Date
  events: CalendarEvent[]
}

export function Agenda({ events }: { events: CalendarEvent[] }) {
  const visible = events.filter((event) => !event.cancelled).slice(0, 11)
  const groups = visible.reduce<Group[]>((result, event) => {
    const date = eventDate(event)
    const existing = result.find((group) => dateKey(group.date) === dateKey(date))
    if (existing) existing.events.push(event)
    else result.push({ date, events: [event] })
    return result
  }, [])
  const hidden = Math.max(0, events.length - visible.length)

  if (groups.length === 0)
    return <div className="agenda-empty">In den nächsten fünf Wochen stehen keine Termine an.</div>
  return (
    <div className="agenda-list" data-testid="agenda">
      {groups.map((group) => (
        <section className="agenda-day" key={dateKey(group.date)}>
          <div className="agenda-date">
            <span>{weekday.format(group.date).replace('.', '')}</span>
            <strong>{group.date.getDate()}</strong>
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
