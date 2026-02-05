// Registration Code Types

export interface RegistrationCode {
  id: string
  code: string
  created_at: string
  expires_at: string | null
  used_at: string | null
  used_by_id: string | null
  used_by_email: string | null
  used_by_name: string | null
  revoked_at: string | null
}

export interface RegistrationCodeBatch {
  id: string
  name: string
  created_at: string
  expires_at: string | null
  note: string | null
  total_codes: number
  used_codes: number
  available_codes: number
}

export interface RegistrationCodeBatchWithCodes {
  id: string
  name: string
  created_at: string
  expires_at: string | null
  note: string | null
  codes: RegistrationCode[]
}

export interface CreateBatchRequest {
  name: string
  count: number
  expires_in_days: number | null
  note: string | null
}

export interface CodeFilter {
  batch_id?: string
  status?: 'all' | 'available' | 'used' | 'revoked' | 'expired'
  page?: number
  page_size?: number
}

export interface ValidateCodeResponse {
  valid: boolean
  code: string | null
  expires_at: string | null
  error: string | null
}

// User Management Types

export interface AdminUser {
  id: string
  email: string
  name: string
  is_admin: boolean
  is_blocked: boolean
  blocked_at: string | null
  blocked_reason: string | null
  registration_code_id: string | null
  registration_code: string | null
  created_at: string
  last_login_at: string | null
}

export interface UserFilter {
  search?: string
  status?: 'all' | 'active' | 'blocked' | 'admin'
  page?: number
  page_size?: number
}

export interface BlockUserRequest {
  reason: string | null
}
