import { CloudOff } from 'lucide-react'

import { CalendarPanel } from '../features/calendar/CalendarPanel'
import { CameraStreamCard } from '../features/camera/CameraStreamCard'
import { ClockCard } from '../features/clock/ClockCard'
import { InfoCards } from '../features/info-cards/InfoCards'
import { PhotoGalleryCard } from '../features/photos/PhotoGalleryCard'
import { ShoppingPreviewCard } from '../features/shopping-preview/ShoppingPreviewCard'
import { TodoPreviewCard } from '../features/todo-preview/TodoPreviewCard'
import { WeatherCard } from '../features/weather/WeatherCard'
import { useDashboard } from '../hooks/useDashboard'
import { useCameraMode } from '../hooks/useCameraMode'
import { SettingsMenu } from '../components/SettingsMenu'

export function DashboardPage() {
  const { data, loading, offline } = useDashboard()
  const camera = useCameraMode()
  return (
    <main className={`dashboard ${loading ? 'is-loading' : ''}`}>
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <SettingsMenu />
      <div className="top-grid" data-testid="top-grid">
        <ClockCard />
        <WeatherCard weather={data.weather} />
        <PhotoGalleryCard />
      </div>
      <CalendarPanel calendar={data.calendar} weather={data.weather} />
      <div className="lower-grid" data-testid="lower-grid" hidden={camera.active}>
        <TodoPreviewCard />
        <ShoppingPreviewCard />
      </div>
      <InfoCards hidden={camera.active} />
      {camera.active && (
        <CameraStreamCard streamUrl={camera.streamUrl} onDeactivate={camera.deactivate} />
      )}
      {offline && (
        <div className="connection-status" role="status">
          <CloudOff aria-hidden="true" /> Offline · zuletzt bekannte Ansicht
        </div>
      )}
    </main>
  )
}
