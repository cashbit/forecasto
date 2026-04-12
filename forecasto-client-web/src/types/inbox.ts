export type MatchType = 'payment' | 'update' | 'duplicate'

export interface ReconciliationMatch {
  record_id: string
  reference: string
  account: string
  amount?: string
  total: string
  date_cashflow: string | null
  date_offer: string | null
  stage: string
  area?: string
  note?: string
  transaction_id?: string
  match_score: number
  match_reasons?: string[]
  match_type?: MatchType
  match_reason?: string  // legacy compatibility
  suggested_transfer_area?: string | null
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
  // Populated by server-side similarity search
  matched_record?: ReconciliationMatch | null
  similar_records?: ReconciliationMatch[]
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

export interface ProcessingJob {
  id: string
  workspace_id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  source_filename: string
  source_hash: string
  file_size_bytes: number
  file_content_type: string
  upload_source: string
  llm_model: string
  inbox_item_id?: string
  error_message?: string
  started_at?: string
  completed_at?: string
  created_at: string
  usage?: UsageRecordDetail
}

export interface UsageRecordDetail {
  id: string
  workspace_id: string
  job_id: string
  llm_provider: string
  llm_model: string
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  input_cost_usd: number
  output_cost_usd: number
  total_cost_usd: number
  billed_cost_usd: number
  multiplier: number
  created_at: string
}

export interface QueueStatus {
  queued: number
  processing: number
  max_concurrent: number
  max_queue_size: number
}
