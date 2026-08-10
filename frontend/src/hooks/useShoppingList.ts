import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, bringApi } from '../services/api'
import type { BringItem, BringItemsResponse, BringState } from '../types/api'

interface ShoppingListState {
  items: BringItem[]
  loading: boolean
  stale: boolean
  status: BringState
  liveReconnecting: boolean
  error: string
  completing: Set<string>
  addItem: (name: string, specification: string) => Promise<void>
  completeItem: (itemId: string) => Promise<void>
  clearError: () => void
}

function mutationId(): string {
  return crypto.randomUUID()
}

function safeMessage(reason: unknown, fallback: string): string {
  return reason instanceof ApiError ? reason.message : fallback
}

export function useShoppingList(): ShoppingListState {
  const [items, setItems] = useState<BringItem[]>([])
  const [loading, setLoading] = useState(true)
  const [stale, setStale] = useState(false)
  const [status, setStatus] = useState<BringState>('unavailable')
  const [liveReconnecting, setLiveReconnecting] = useState(false)
  const [error, setError] = useState('')
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const itemsRef = useRef(items)
  const pendingRef = useRef(new Map<string, BringItem>())
  const completingRef = useRef(new Set<string>())

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const applyResponse = useCallback((response: BringItemsResponse) => {
    const serverItems = response.items.filter((item) => !completingRef.current.has(item.id))
    setItems([...serverItems, ...pendingRef.current.values()])
    setStale(response.stale)
    setStatus(response.status)
    setLoading(false)
  }, [])

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        applyResponse(await bringApi.items(signal))
      } catch (reason) {
        if (signal?.aborted) return
        setLoading(false)
        setError(safeMessage(reason, 'Einkaufsliste konnte nicht geladen werden.'))
      }
    },
    [applyResponse],
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
      source = new EventSource(bringApi.eventsUrl)
      source.addEventListener('items', (event) => {
        try {
          applyResponse(JSON.parse((event as MessageEvent<string>).data) as BringItemsResponse)
          retryDelay = 1_000
          setLiveReconnecting(false)
        } catch {
          // Ignore malformed external event data and keep the last valid state.
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
  }, [applyResponse, load])

  const addItem = useCallback(async (name: string, specification: string) => {
    const tempId = `pending-${mutationId()}`
    const optimistic: BringItem = {
      id: tempId,
      name,
      specification,
      position: itemsRef.current.length,
    }
    pendingRef.current.set(tempId, optimistic)
    setItems((current) => [...current, optimistic])
    setError('')
    try {
      const created = await bringApi.add(name, specification, tempId.slice(8))
      pendingRef.current.delete(tempId)
      setItems((current) => current.map((item) => (item.id === tempId ? created : item)))
    } catch (reason) {
      pendingRef.current.delete(tempId)
      setItems((current) => current.filter((item) => item.id !== tempId))
      const message = safeMessage(reason, 'Artikel konnte nicht hinzugefügt werden.')
      setError(message)
      throw new Error(message)
    }
  }, [])

  const completeItem = useCallback(
    async (itemId: string) => {
      const snapshot = itemsRef.current
      completingRef.current.add(itemId)
      setCompleting(new Set(completingRef.current))
      setError('')
      await new Promise((resolve) => window.setTimeout(resolve, 220))
      setItems((current) => current.filter((item) => item.id !== itemId))
      try {
        const response = await bringApi.complete(itemId, mutationId())
        completingRef.current.delete(itemId)
        setCompleting(new Set(completingRef.current))
        applyResponse(response)
      } catch (reason) {
        completingRef.current.delete(itemId)
        setCompleting(new Set(completingRef.current))
        setItems(snapshot)
        setError(safeMessage(reason, 'Artikel konnte nicht abgeschlossen werden.'))
      }
    },
    [applyResponse],
  )

  return {
    items,
    loading,
    stale,
    status,
    liveReconnecting,
    error,
    completing,
    addItem,
    completeItem,
    clearError: () => setError(''),
  }
}
