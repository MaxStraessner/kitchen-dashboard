export type Role = 'admin' | 'member'

export interface CurrentUser {
  id: string
  username: string
  displayName: string
  household: { id: string; name: string }
  role: Role
  mustChangePassword: boolean
  lastLoginAt: string | null
}

export interface AdminUser {
  id: string
  username: string
  displayName: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
  createdAt: string
  lastLoginAt: string | null
}
