import { useCallback, useEffect, useRef, useState } from 'react'

import { tasksApi } from '../services/api'
import type { Task } from '../types/api'

interface TasksState {
  tasks: Task[]
  loading: boolean
  error: string | null
}

export function useTasks(): TasksState & {
  create(title: string): Promise<void>
  toggle(task: Task): Promise<void>
  remove(id: string): Promise<void>
} {
  const [state, setState] = useState<TasksState>({ tasks: [], loading: true, error: null })
  const loading = useRef(false)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (loading.current) return
    loading.current = true
    try {
      const response = await tasksApi.list(signal)
      setState({
        tasks: Array.isArray(response.tasks) ? response.tasks : [],
        loading: false,
        error: null,
      })
    } catch (error) {
      if (signal?.aborted) return
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'Aufgaben konnten nicht geladen werden.',
      }))
    } finally {
      loading.current = false
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    void refresh(controller.signal)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 8_000)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const mutate = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action()
        await refresh()
      } catch (error) {
        setState((current) => ({
          ...current,
          error:
            error instanceof Error ? error.message : 'Änderung konnte nicht gespeichert werden.',
        }))
        await refresh()
        throw error
      }
    },
    [refresh],
  )

  return {
    ...state,
    create: async (title) => mutate(() => tasksApi.create(title)),
    toggle: async (task) => mutate(() => tasksApi.setCompleted(task.id, !task.completed)),
    remove: async (id) => mutate(() => tasksApi.remove(id)),
  }
}
