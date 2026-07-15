import { CalendarRange, Info } from 'lucide-react'

import { Card } from '../../components/Card'
import type { CalendarResponse, WeatherResponse } from '../../types/api'
import { Agenda } from './Agenda'
import { MonthCalendar } from './MonthCalendar'

function updatedLabel(value: string): string {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (elapsedMinutes < 1) return 'Zuletzt aktualisiert gerade eben'
  if (elapsedMinutes === 1) return 'Zuletzt aktualisiert vor 1 Minute'
  return `Zuletzt aktualisiert vor ${String(elapsedMinutes)} Minuten`
}

export function CalendarPanel({
  calendar,
  weather,
}: {
  calendar: CalendarResponse
  weather: WeatherResponse
}) {
  return (
    <Card className="calendar-card" aria-labelledby="calendar-title">
      <header className="calendar-header">
        <div>
          <div className="card-eyebrow">
            <CalendarRange aria-hidden="true" /> Nächste fünf Wochen
          </div>
          <h2 id="calendar-title">Familienkalender</h2>
        </div>
        <nav className="view-switch" aria-label="Kalenderansicht">
          <button type="button" className="is-active">
            Agenda
          </button>
          <button type="button" disabled title="Später verfügbar">
            Woche
          </button>
          <button type="button" disabled title="Später verfügbar">
            Monat
          </button>
        </nav>
      </header>
      <div className="calendar-content">
        <div className="calendar-agenda">
          <Agenda events={calendar.events} forecast={weather.data.forecast} />
        </div>
        <aside className="calendar-side">
          <MonthCalendar events={calendar.events} />
          <div className="calendar-legend" aria-label="Kalenderlegende">
            {calendar.sources.map((source) => (
              <span key={source.id}>
                <i style={{ backgroundColor: source.color }} />
                {source.name}
              </span>
            ))}
          </div>
          {!calendar.meta.demo_mode && (
            <div className="calendar-status" role="status">
              <span>{updatedLabel(calendar.meta.updated_at)}</span>
              {calendar.sources
                .filter((source) => source.stale)
                .map((source) => (
                  <small key={source.id}>Kalender {source.name} derzeit nicht aktuell</small>
                ))}
            </div>
          )}
          {calendar.meta.demo_mode && (
            <div className="demo-note">
              <Info aria-hidden="true" /> Demokalender · ICS-Quellen noch nicht konfiguriert
            </div>
          )}
        </aside>
      </div>
    </Card>
  )
}
