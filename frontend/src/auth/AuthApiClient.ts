import { clearCsrfToken, request } from '../services/api'
import type { AdminUser, CurrentUser, Role } from './types'

export const authApi = {
  setupStatus: () => request<{ setupRequired: boolean }>('/setup/status'),
  initialize: (payload: {
    householdName: string
    displayName: string
    username: string
    password: string
    passwordConfirmation: string
  }) => request<CurrentUser>('/setup/initialize', { method: 'POST', body: payload }),
  login: (payload: { username: string; password: string; rememberMe: boolean }) =>
    request<CurrentUser>('/auth/login', { method: 'POST', body: payload }),
  me: () => request<CurrentUser>('/auth/me'),
  logout: async () => {
    await request('/auth/logout', { method: 'POST', csrf: true })
    clearCsrfToken()
  },
  account: () => request<CurrentUser>('/account'),
  updateAccount: (displayName: string) =>
    request<CurrentUser>('/account', { method: 'PATCH', csrf: true, body: { displayName } }),
  changePassword: (payload: {
    currentPassword: string
    newPassword: string
    passwordConfirmation: string
  }) =>
    request<CurrentUser>('/account/change-password', { method: 'POST', csrf: true, body: payload }),
  revokeOtherSessions: () =>
    request<{ message: string }>('/account/revoke-other-sessions', { method: 'POST', csrf: true }),
  users: () => request<AdminUser[]>('/admin/users'),
  createUser: (payload: {
    displayName: string
    username: string
    role: Role
    isActive: boolean
    password: string
    passwordConfirmation: string
  }) => request<AdminUser>('/admin/users', { method: 'POST', csrf: true, body: payload }),
  updateUser: (
    id: string,
    payload: Partial<Pick<AdminUser, 'displayName' | 'username' | 'role' | 'isActive'>>,
  ) => request<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', csrf: true, body: payload }),
  resetPassword: (id: string, password: string, passwordConfirmation: string) =>
    request<{ message: string }>(`/admin/users/${id}/reset-password`, {
      method: 'POST',
      csrf: true,
      body: { password, passwordConfirmation },
    }),
  revokeSessions: (id: string) =>
    request<{ message: string }>(`/admin/users/${id}/revoke-sessions`, {
      method: 'POST',
      csrf: true,
    }),
}
