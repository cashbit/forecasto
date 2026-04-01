export interface ReconciliationMatch {
  record_id: string
  reference: string
  account: string
  total: string
  date_cashflow: string | null
  date_offer: string | null
  stage: string
  match_score: number
  confirmed?: boolean  // set by user when they check the match
}

export interface RecordSuggestion {
  area: string
  type: string
  account: string
  reference: string
  note?: string
  date_offer: string       // YYYY-MM-DD
  date_cashflow: string    // YYYY-MM-DD
  amount: string
  vat: string
  vat_deduction?: string
  vat_month?: string
  total: string
  stage: string
  transaction_id?: string
  bank_account_id?: string
  project_code?: string
  withholding_rate?: string | null
  classification?: Record<string, unknown> | null
}

export type InboxStatus = 'pending' | 'confirmed' | 'rejected'

export interface InboxItem {
  id: string
  workspace_id: string
  status: InboxStatus
  source_path: string
  source_filename: string
  source_hash: string
  source_deleted: boolean
  llm_provider: string
  llm_model: string
  agent_version?: string
  extracted_data: RecordSuggestion[]
  document_type?: string
  reconciliation_matches?: ReconciliationMatch[]
  confirmed_record_ids: string[]
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface InboxItemUpdate {
  extracted_data?: RecordSuggestion[]
  reconciliation_matches?: ReconciliationMatch[]
}

export interface InboxCountResponse {
  pending: number
}
