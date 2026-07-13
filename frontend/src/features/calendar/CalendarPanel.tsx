import { CalendarRange, Info } from 'lucide-react'

import { Card } from '../../components/Card'
import type { CalendarResponse } from '../../types/api'
import { Agenda } from './Agenda'
import { MonthCalendar } from './MonthCalendar'

export function CalendarPanel({ calendar }: { calendar: CalendarResponse }) {
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
          <Agenda events={calendar.events} />
        </div>
        <aside className="calendar-side">
          <MonthCalendar events={calendar.events} />
          <div className="calendar-legend" aria-label="Kalenderlegende">
            {calendar.sources.map((source) => (
              <span key={source.id}>
                <i style={{ backgroundColor: source.color }} />
                {source.name}
                {source.stale && <small>alt</small>}
              </span>
            ))}
          </div>
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
