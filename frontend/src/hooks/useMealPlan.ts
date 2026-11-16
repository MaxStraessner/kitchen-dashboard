import { useCallback, useEffect, useRef, useState } from 'react'

import { mealPlanApi } from '../services/api'
import type { MealPlan } from '../types/api'

export function useMealPlan() {
  const [plan, setPlan] = useState<MealPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const generation = useRef(0)
  const busy = useRef(false)
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (busy.current) return
    const version = ++generation.current
    try {
      const result = await mealPlanApi.get(signal)
      if (version !== generation.current || signal?.aborted) return
      setPlan(result.plan ?? null)
      setStale(false)
    } catch {
      if (version === generation.current && !signal?.aborted) setStale(true)
    } finally {
      if (version === generation.current && !signal?.aborted) setLoading(false)
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh(controller.signal)
    }
    void refresh(controller.signal)
    const timer = window.setInterval(onVisible, 8000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [refresh])
  async function mutate(file?: File) {
    if (busy.current) return
    busy.current = true
    generation.current++
    setSaving(true)
    setError(null)
    try {
      if (file) {
        const result = await mealPlanApi.replace(file)
        setPlan(result.plan)
      } else {
        await mealPlanApi.remove()
        setPlan(null)
      }
      setStale(false)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Änderung konnte nicht gespeichert werden.',
      )
    } finally {
      busy.current = false
      setSaving(false)
      setLoading(false)
    }
  }
  return {
    plan,
    loading,
    saving,
    error,
    stale,
    replace: (file: File) => mutate(file),
    remove: () => mutate(),
    refresh,
  }
}
