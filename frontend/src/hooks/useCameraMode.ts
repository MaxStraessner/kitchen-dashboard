import { useCallback, useEffect, useState } from 'react'

import { ApiError, cameraApi } from '../services/api'
import type { CameraModeEvent, CameraModeStatus } from '../types/api'

interface CameraModeState extends CameraModeStatus {
  loading: boolean
  changing: boolean
  liveReconnecting: boolean
  error: string
  activate: () => Promise<void>
  deactivate: () => Promise<void>
}

const initialStatus: CameraModeStatus = {
  active: false,
  expiresAt: null,
  streamUrl: '/camera-stream/api/stream.mp4?src=tapo',
  revision: 0,
}

function safeMessage(reason: unknown, fallback: string): string {
  return reason instanceof ApiError ? reason.message : fallback
}

export function useCameraMode(): CameraModeState {
  const [status, setStatus] = useState<CameraModeStatus>(initialStatus)
  const [loading, setLoading] = useState(true)
  const [changing, setChanging] = useState(false)
  const [liveReconnecting, setLiveReconnecting] = useState(false)
  const [error, setError] = useState('')

  const applyStatus = useCallback((next: CameraModeStatus) => {
    setStatus(next)
    setLoading(false)
    setError('')
  }, [])

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        applyStatus(await cameraApi.status(signal))
      } catch (reason) {
        if (signal?.aborted) return
        setLoading(false)
        setError(safeMessage(reason, 'Kamerastatus konnte nicht geladen werden.'))
      }
    },
    [applyStatus],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    let source: EventSource | null = null
    let timer: number | undefined
    let retryDelay = 1_000
    let stopped = false

    const connect = () => {
      if (stopped || document.visibilityState === 'hidden' || source) return
      source = new EventSource(cameraApi.eventsUrl)
      source.addEventListener('camera_mode_changed', (event) => {
        try {
          const update = JSON.parse((event as MessageEvent<string>).data) as CameraModeEvent
          applyStatus(update)
          retryDelay = 1_000
          setLiveReconnecting(false)
        } catch {
          // Keep the last server-confirmed state when an event is malformed.
        }
      })
      source.onerror = () => {
        source?.close()
        source = null
        if (stopped || document.visibilityState === 'hidden') return
        setLiveReconnecting(true)
        window.clearTimeout(timer)
        timer = window.setTimeout(connect, retryDelay)
        retryDelay = Math.min(retryDelay * 2, 30_000)
      }
    }

    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        source?.close()
        source = null
        window.clearTimeout(timer)
      } else {
        void load()
        connect()
      }
    }

    document.addEventListener('visibilitychange', visibility)
    connect()
    return () => {
      stopped = true
      source?.close()
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [applyStatus, load])

  const change = useCallback(
    async (active: boolean) => {
      setChanging(true)
      setError('')
      try {
        applyStatus(await (active ? cameraApi.activate() : cameraApi.deactivate()))
      } catch (reason) {
        setError(
          safeMessage(
            reason,
            active
              ? 'Kamera konnte nicht aktiviert werden.'
              : 'Kamera konnte nicht beendet werden.',
          ),
        )
      } finally {
        setChanging(false)
      }
    },
    [applyStatus],
  )

  return {
    ...status,
    loading,
    changing,
    liveReconnecting,
    error,
    activate: () => change(true),
    deactivate: () => change(false),
  }
}
