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
  invoiced: boolean
  invoiced_at: string | null
  invoiced_to: string | null
  invoice_note: string | null
  partner_fee_recognized: boolean
  partner_fee_recognized_at: string | null
}

export interface RegistrationCodeBatch {
  id: string
  name: string
  created_at: string
  expires_at: string | null
  note: string | null
  partner_id: string | null
  partner_name: string | null
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
  partner_id: string | null
  partner_name: string | null
  codes: RegistrationCode[]
}

export interface CreateBatchRequest {
  name: string
  count: number
  expires_in_days: number | null
  note: string | null
  partner_id?: string
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
  is_partner: boolean
  partner_type: 'billing_to_client' | 'billing_to_partner' | null
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
  status?: 'all' | 'active' | 'blocked' | 'admin' | 'partner'
  page?: number
  page_size?: number
}

export interface BlockUserRequest {
  reason: string | null
}

export interface ActivatedCodeReportRow {
  code_id: string
  code: string
  used_at: string | null
  used_by_name: string | null
  used_by_email: string | null
  batch_name: string | null
  partner_id: string | null
  partner_name: string | null
  partner_type: string | null
  invoiced: boolean
  invoiced_at: string | null
  invoiced_to: string | null
  invoice_note: string | null
  partner_fee_recognized: boolean
  partner_fee_recognized_at: string | null
}

export interface PartnerBillingSummary {
  partner_id: string
  partner_name: string
  partner_type: string | null
  total_activated: number
  invoiced_count: number
  not_invoiced_count: number
  invoiced_to_client: number
  invoiced_to_partner: number
  fee_recognized_count: number
  fee_pending_count: number
}

export interface InvoiceCodesRequest {
  code_ids: string[]
  invoiced_to: 'client' | 'partner'
  invoice_note?: string | null
}

export interface ActivatedCodesReportFilter {
  partner_id?: string
  month?: number
  year?: number
  invoiced?: boolean
}

export interface BillingSummaryFilter {
  partner_id?: string
  month?: number
  year?: number
}
