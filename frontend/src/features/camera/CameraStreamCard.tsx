import { CameraOff, RefreshCw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Card } from '../../components/Card'

interface CameraStreamCardProps {
  streamUrl: string
  onDeactivate: () => Promise<void>
}

type StreamState = 'connecting' | 'live' | 'error'

export function CameraStreamCard({ streamUrl, onDeactivate }: CameraStreamCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const retryDelayRef = useRef(1_000)
  const [state, setState] = useState<StreamState>('connecting')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    let stalledTimeout: number | undefined
    let retryTimeout: number | undefined
    let failed = false

    function fail() {
      if (failed) return
      failed = true
      window.clearTimeout(connectTimeout)
      window.clearTimeout(stalledTimeout)
      setState('error')
      retryTimeout = window.setTimeout(() => {
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30_000)
        setAttempt((current) => current + 1)
      }, retryDelayRef.current)
    }

    function playing() {
      failed = false
      window.clearTimeout(connectTimeout)
      window.clearTimeout(stalledTimeout)
      window.clearTimeout(retryTimeout)
      retryDelayRef.current = 1_000
      setState('live')
    }

    function waiting() {
      window.clearTimeout(stalledTimeout)
      stalledTimeout = window.setTimeout(fail, 5_000)
    }

    function progressing() {
      window.clearTimeout(stalledTimeout)
    }

    const connectTimeout = window.setTimeout(fail, 15_000)
    setState('connecting')
    if (!video) {
      fail()
      return () => window.clearTimeout(retryTimeout)
    }

    video.addEventListener('playing', playing)
    video.addEventListener('error', fail)
    video.addEventListener('stalled', waiting)
    video.addEventListener('waiting', waiting)
    video.addEventListener('progress', progressing)
    return () => {
      window.clearTimeout(connectTimeout)
      window.clearTimeout(stalledTimeout)
      window.clearTimeout(retryTimeout)
      video.removeEventListener('playing', playing)
      video.removeEventListener('error', fail)
      video.removeEventListener('stalled', waiting)
      video.removeEventListener('waiting', waiting)
      video.removeEventListener('progress', progressing)
    }
  }, [attempt, streamUrl])

  return (
    <Card className="camera-card" aria-label="Tapo Live Stream">
      <video
        key={attempt}
        ref={videoRef}
        className={`camera-video ${state === 'live' ? 'is-visible' : ''}`}
        src={streamUrl}
        autoPlay
        muted
        playsInline
        preload="auto"
      />
      <div className="camera-card-scrim" aria-hidden="true" />
      <header className="camera-card-header">
        <span className="live-badge">
          <i aria-hidden="true" /> LIVE
        </span>
        <span>Kamera</span>
      </header>
      {state !== 'live' && (
        <div className="camera-stream-state" role={state === 'error' ? 'alert' : 'status'}>
          {state === 'error' ? <CameraOff aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
          <strong>
            {state === 'error' ? 'Kamera momentan nicht erreichbar' : 'Kamera wird verbunden'}
          </strong>
          {state === 'error' && (
            <button
              type="button"
              onClick={() => {
                retryDelayRef.current = 1_000
                setAttempt((current) => current + 1)
              }}
            >
              <RefreshCw aria-hidden="true" /> Erneut verbinden
            </button>
          )}
        </div>
      )}
      <button className="camera-stop-button" type="button" onClick={() => void onDeactivate()}>
        <X aria-hidden="true" /> Kamera beenden
      </button>
    </Card>
  )
}
