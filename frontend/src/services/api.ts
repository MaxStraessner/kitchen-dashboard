import type {
  BringItem,
  BringItemsResponse,
  DashboardResponse,
  Task,
  TaskListResponse,
} from '../types/api'

const API_ROOT = '/api/v1'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let csrfToken: string | null = null

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown; csrf?: boolean }

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response
  try {
    const headers = new Headers(options.headers)
    headers.set('Accept', 'application/json')
    if (options.body !== undefined) headers.set('Content-Type', 'application/json')
    if (options.csrf) {
      if (!csrfToken) {
        const csrfResponse = await request<{ csrfToken: string }>('/auth/csrf')
        csrfToken = csrfResponse.csrfToken
      }
      headers.set('X-CSRF-Token', csrfToken)
    }
    response = await fetch(`${API_ROOT}${path}`, {
      ...options,
      credentials: 'include',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError('Backend nicht erreichbar')
  }
  if (!response.ok) {
    if (response.status === 401) {
      csrfToken = null
      window.dispatchEvent(new Event('kitchen:unauthorized'))
    }
    let message = 'Daten konnten nicht geladen werden'
    try {
      const payload = (await response.json()) as { detail?: string }
      if (typeof payload.detail === 'string') message = payload.detail
    } catch {
      // Keep the safe fallback message.
    }
    throw new ApiError(message, response.status)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function clearCsrfToken() {
  csrfToken = null
}

export const dashboardApi = {
  getDashboard: (signal?: AbortSignal) => request<DashboardResponse>('/dashboard', { signal }),
}

export const tasksApi = {
  list: (signal?: AbortSignal) => request<TaskListResponse>('/tasks', { signal }),
  create: (title: string) =>
    request<Task>('/tasks', { method: 'POST', body: { title }, csrf: true }),
  setCompleted: (id: string, completed: boolean) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: { completed }, csrf: true }),
  remove: (id: string) => request<undefined>(`/tasks/${id}`, { method: 'DELETE', csrf: true }),
}

export const bringApi = {
  items: (signal?: AbortSignal) => request<BringItemsResponse>('/bring/items', { signal }),
  add: (name: string, specification: string, clientMutationId: string) =>
    request<BringItem>('/bring/items', {
      method: 'POST',
      csrf: true,
      body: { name, specification, client_mutation_id: clientMutationId },
    }),
  complete: (itemId: string, clientMutationId: string) =>
    request<BringItemsResponse>(`/bring/items/${encodeURIComponent(itemId)}/complete`, {
      method: 'POST',
      csrf: true,
      body: { client_mutation_id: clientMutationId },
    }),
  eventsUrl: `${API_ROOT}/bring/events`,
}
