export interface User {
  id: string
  email: string
  name: string
  invite_code: string
  is_admin: boolean
  is_partner: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  ui_preferences?: Record<string, unknown>
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

export interface RegisterRequest {
  email: string
  password: string
  name: string
  registration_code: string
}

export interface RefreshTokenRequest {
  refresh_token: string
}

export interface ResetPasswordByCodeRequest {
  email: string
  registration_code: string
  new_password: string
}

export interface RefreshTokenResponse {
  access_token: string
  token_type: string
}

export interface WorkspaceSummary {
  id: string
  name: string
  member_count: number
  record_count: number
}

export interface DeleteAccountPrecheck {
  can_delete: boolean
  owned_workspaces_with_members: WorkspaceSummary[]
  owned_workspaces_solo: WorkspaceSummary[]
  bank_accounts_count: number
  vat_registries_count: number
  message: string
}
