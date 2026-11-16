import { ModalDialog } from '../../components/ModalDialog'
import type { CalendarEvent } from '../../types/api'
import { dashboardTimeZone, eventDateKeys, eventTimeLabel } from './dateUtils'

const dateTime = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: dashboardTimeZone,
})

export function DayEventsDialog({
  date,
  events,
  onClose,
}: {
  date: string
  events: CalendarEvent[]
  onClose: () => void
}) {
  const label = new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'full',
    timeZone: dashboardTimeZone,
  }).format(new Date(`${date}T12:00:00Z`))
  return (
    <ModalDialog title={label} onClose={onClose}>
      <div className="modal-body day-event-details">
        {events.length === 0 && <p>Keine Termine</p>}
        {events.map((event) => (
          <article key={event.id} style={{ borderLeftColor: event.color }}>
            <time>{eventTimeLabel(event, date)}</time>
            <h3>{event.title}</h3>
            <p>{event.calendarName}</p>
            {!event.allDay && (
              <p>
                {dateTime.format(new Date(event.start))} – {dateTime.format(new Date(event.end))}
              </p>
            )}
            {event.allDay && eventDateKeys(event).length > 1 && (
              <p>
                {eventDateKeys(event)[0]} – {eventDateKeys(event).at(-1)}
              </p>
            )}
            {event.location && <p>Ort: {event.location}</p>}
            {event.description && <p className="event-description">{event.description}</p>}
            {event.stale && <small>Zuletzt geladener Stand</small>}
          </article>
        ))}
      </div>
    </ModalDialog>
  )
}
