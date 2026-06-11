export type ResetPolicy = 'never' | 'yearly' | 'monthly'

export interface Numeratore {
  id: string
  workspace_id: string
  key: string
  name: string
  reset_policy: ResetPolicy
  start_number: number
  prefix: string | null
  suffix: string | null
  separator: string
  padding: number
  include_year: boolean
  include_month: boolean
  confirm_ttl_seconds: number
  last_value: number | null
  period_key: string | null
  pending_token: string | null
  pending_value: number | null
  pending_expires_at: string | null
  created_at: string
  updated_at: string
}

export interface NumeratoreCreate {
  key: string
  name: string
  reset_policy?: ResetPolicy
  start_number?: number
  prefix?: string | null
  suffix?: string | null
  separator?: string
  padding?: number
  include_year?: boolean
  include_month?: boolean
  confirm_ttl_seconds?: number
}

export type NumeratoreUpdate = Partial<Omit<NumeratoreCreate, 'key'>>

export interface NumeratoreEntry {
  id: string
  numerator_id: string
  workspace_id: string
  value: number
  formatted: string
  period_key: string
  issued_by: string | null
  issued_at: string
  reservation_token: string | null
}
