import { CalendarDays } from 'lucide-react'

import { Card } from '../../components/Card'
import { useMinuteClock } from '../../hooks/useMinuteClock'

const timeFormatter = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/Berlin',
})
const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
})
const hourFormatter = new Intl.DateTimeFormat('de-DE', {
  hour: 'numeric',
  hour12: false,
  timeZone: 'Europe/Berlin',
})

function greeting(now: Date): string {
  const hour = Number(hourFormatter.format(now))
  if (hour < 11) return 'Guten Morgen, Familie'
  if (hour < 18) return 'Guten Tag, Familie'
  return 'Guten Abend, Familie'
}

export function ClockCard() {
  const now = useMinuteClock()
  return (
    <Card className="clock-card" aria-label="Uhrzeit und Datum">
      <div className="card-eyebrow">
        <CalendarDays aria-hidden="true" /> Heute
      </div>
      <time className="clock-time" dateTime={now.toISOString()}>
        {timeFormatter.format(now)}
      </time>
      <p className="clock-date">{dateFormatter.format(now)}</p>
      <p className="clock-greeting">{greeting(now)}</p>
    </Card>
  )
}
