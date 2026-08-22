import { CameraOff, RefreshCw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Card } from '../../components/Card'

interface CameraStreamCardProps {
  streamUrl: string
  onDeactivate: () => Promise<void>
}

type StreamState = 'connecting' | 'live' | 'error'

function waitForIceGathering(connection: RTCPeerConnection, signal: AbortSignal): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(done, 5_000)
    function done() {
      window.clearTimeout(timeout)
      connection.removeEventListener('icegatheringstatechange', changed)
      signal.removeEventListener('abort', aborted)
      resolve()
    }
    function changed() {
      if (connection.iceGatheringState === 'complete') done()
    }
    function aborted() {
      window.clearTimeout(timeout)
      connection.removeEventListener('icegatheringstatechange', changed)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    connection.addEventListener('icegatheringstatechange', changed)
    signal.addEventListener('abort', aborted, { once: true })
  })
}

export function CameraStreamCard({ streamUrl, onDeactivate }: CameraStreamCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<StreamState>('connecting')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    const controller = new AbortController()
    let connection: RTCPeerConnection | null = null
    let trackTimeout: number | undefined

    async function connect() {
      setState('connecting')
      if (!video || typeof RTCPeerConnection === 'undefined') {
        setState('error')
        return
      }
      try {
        connection = new RTCPeerConnection({ iceServers: [] })
        connection.addTransceiver('video', { direction: 'recvonly' })
        connection.ontrack = (event) => {
          window.clearTimeout(trackTimeout)
          video.srcObject = event.streams[0] ?? new MediaStream([event.track])
          setState('live')
        }
        connection.onconnectionstatechange = () => {
          if (connection?.connectionState === 'failed') {
            setState('error')
            connection.close()
          }
        }
        const offer = await connection.createOffer()
        await connection.setLocalDescription(offer)
        await waitForIceGathering(connection, controller.signal)
        const response = await fetch(streamUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: connection.localDescription?.sdp ?? offer.sdp,
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('WHEP signaling failed')
        const answer = await response.text()
        trackTimeout = window.setTimeout(() => setState('error'), 10_000)
        await connection.setRemoteDescription({ type: 'answer', sdp: answer })
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setState('error')
      }
    }

    void connect()
    return () => {
      controller.abort()
      window.clearTimeout(trackTimeout)
      if (typeof MediaStream !== 'undefined' && video?.srcObject instanceof MediaStream) {
        for (const track of video.srcObject.getTracks()) track.stop()
      }
      if (video) video.srcObject = null
      if (connection) {
        connection.ontrack = null
        connection.onconnectionstatechange = null
        connection.close()
      }
    }
  }, [attempt, streamUrl])

  return (
    <Card className="camera-card" aria-label="Tapo Live Stream">
      <video
        ref={videoRef}
        className={`camera-video ${state === 'live' ? 'is-visible' : ''}`}
        autoPlay
        muted
        playsInline
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
            <button type="button" onClick={() => setAttempt((current) => current + 1)}>
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
