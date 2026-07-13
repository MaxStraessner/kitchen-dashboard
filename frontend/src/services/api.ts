import type { DashboardResponse } from '../types/api'

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

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch {
    throw new ApiError('Backend nicht erreichbar')
  }
  if (!response.ok) throw new ApiError('Daten konnten nicht geladen werden', response.status)
  return (await response.json()) as T
}

export const dashboardApi = {
  getDashboard: (signal?: AbortSignal) => request<DashboardResponse>('/dashboard', signal),
}
