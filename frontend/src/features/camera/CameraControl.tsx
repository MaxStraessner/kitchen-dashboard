import { Camera, LoaderCircle, Power } from 'lucide-react'

import { useCameraMode } from '../../hooks/useCameraMode'

function activeUntil(expiresAt: string | null): string {
  if (!expiresAt) return ''
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(expiresAt),
  )
}

export function CameraControl() {
  const camera = useCameraMode()
  const until = activeUntil(camera.expiresAt)

  return (
    <section className="settings-card camera-settings-card" aria-label="Kamerasteuerung">
      <Camera aria-hidden="true" />
      <div className="camera-settings-content">
        <div>
          <h2>Kamera</h2>
          <p className={`camera-mode-status ${camera.active ? 'is-active' : ''}`} role="status">
            <span aria-hidden="true" />
            {camera.loading
              ? 'Kamerastatus wird geladen'
              : camera.active
                ? `Kamera aktiv${until ? ` · bis ${until} Uhr` : ''}`
                : 'Kamera nicht aktiv'}
          </p>
          {camera.liveReconnecting && <small>Live-Verbindung wird wiederhergestellt …</small>}
          {camera.error && <small className="camera-control-error">{camera.error}</small>}
        </div>
        <button
          className={`camera-control-button ${camera.active ? 'is-stop' : ''}`}
          type="button"
          disabled={camera.loading || camera.changing}
          onClick={() => void (camera.active ? camera.deactivate() : camera.activate())}
        >
          {camera.changing ? (
            <LoaderCircle className="is-spinning" aria-hidden="true" />
          ) : camera.active ? (
            <Power aria-hidden="true" />
          ) : (
            <Camera aria-hidden="true" />
          )}
          {camera.active ? 'Kamera beenden' : 'Kamera anzeigen'}
        </button>
      </div>
    </section>
  )
}
