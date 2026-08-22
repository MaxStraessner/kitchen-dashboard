import type {
  BringItem,
  BringItemsResponse,
  CameraModeStatus,
  DashboardResponse,
  Photo,
  PhotoListResponse,
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

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  formData?: FormData
  csrf?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response
  try {
    const { body, csrf, formData, ...requestInit } = options
    const headers = new Headers(requestInit.headers)
    headers.set('Accept', 'application/json')
    if (body !== undefined) headers.set('Content-Type', 'application/json')
    if (csrf) {
      if (!csrfToken) {
        const csrfResponse = await request<{ csrfToken: string }>('/auth/csrf')
        csrfToken = csrfResponse.csrfToken
      }
      headers.set('X-CSRF-Token', csrfToken)
    }
    response = await fetch(`${API_ROOT}${path}`, {
      ...requestInit,
      credentials: 'include',
      headers,
      body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
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

export const photosApi = {
  list: (signal?: AbortSignal) => request<PhotoListResponse>('/photos', { signal }),
  gallery: (signal?: AbortSignal) => request<PhotoListResponse>('/photos/gallery', { signal }),
  upload: (file: File) => {
    const formData = new FormData()
    formData.append('file', file, file.name)
    return request<Photo>('/photos', { method: 'POST', formData, csrf: true })
  },
  remove: (id: string) =>
    request<undefined>(`/photos/${encodeURIComponent(id)}`, { method: 'DELETE', csrf: true }),
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

export const cameraApi = {
  status: (signal?: AbortSignal) => request<CameraModeStatus>('/camera/status', { signal }),
  activate: () => request<CameraModeStatus>('/camera/activate', { method: 'POST', csrf: true }),
  deactivate: () => request<CameraModeStatus>('/camera/deactivate', { method: 'POST', csrf: true }),
  eventsUrl: `${API_ROOT}/camera/events`,
}
