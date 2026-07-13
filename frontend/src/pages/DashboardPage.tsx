import { CloudOff } from 'lucide-react'

import { CalendarPanel } from '../features/calendar/CalendarPanel'
import { ClockCard } from '../features/clock/ClockCard'
import { InfoCards } from '../features/info-cards/InfoCards'
import { MediaPreviewCard } from '../features/media-preview/MediaPreviewCard'
import { ShoppingPreviewCard } from '../features/shopping-preview/ShoppingPreviewCard'
import { TodoPreviewCard } from '../features/todo-preview/TodoPreviewCard'
import { WeatherCard } from '../features/weather/WeatherCard'
import { useDashboard } from '../hooks/useDashboard'
import { SettingsMenu } from '../components/SettingsMenu'

export function DashboardPage() {
  const { data, loading, offline } = useDashboard()
  return (
    <main className={`dashboard ${loading ? 'is-loading' : ''}`}>
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <SettingsMenu />
      <div className="top-grid" data-testid="top-grid">
        <ClockCard />
        <WeatherCard weather={data.weather} />
        <MediaPreviewCard />
      </div>
      <CalendarPanel calendar={data.calendar} />
      <div className="lower-grid" data-testid="lower-grid">
        <TodoPreviewCard />
        <ShoppingPreviewCard />
      </div>
      <InfoCards />
      {offline && (
        <div className="connection-status" role="status">
          <CloudOff aria-hidden="true" /> Offline · zuletzt bekannte Ansicht
        </div>
      )}
    </main>
  )
}
