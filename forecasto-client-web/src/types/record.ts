export type Area = 'budget' | 'prospect' | 'orders' | 'actual'

export interface Classification {
  category: string
  subcategory?: string
  tags?: string[]
}

export interface TransferEntry {
  from_area: Area
  to_area: Area
  transferred_at: string
  transferred_by: string
  note?: string
}

export interface Record {
  id: string
  workspace_id: string
  area: Area
  type: string
  account: string
  reference: string
  note?: string
  date_cashflow: string
  date_offer: string
  amount: string
  vat: string
  total: string
  stage: string
  transaction_id?: string
  bank_account_id?: string
  project_id?: string
  phase_id?: string
  classification?: Classification
  transfer_history?: TransferEntry[]
  version: number
  is_draft?: boolean
  created_at: string
  updated_at: string
}

export interface RecordCreate {
  area: Area
  type: string
  account: string
  reference: string
  note?: string
  date_cashflow: string
  date_offer: string
  amount: string
  vat?: string
  stage?: string
  bank_account_id?: string
  project_id?: string
  phase_id?: string
  classification?: Classification
}

export interface RecordUpdate {
  type?: string
  account?: string
  reference?: string
  note?: string
  date_cashflow?: string
  date_offer?: string
  amount?: string
  vat?: string
  stage?: string
  bank_account_id?: string
  project_id?: string
  phase_id?: string
  classification?: Classification
}

export interface RecordFilters {
  area: Area
  date_start?: string
  date_end?: string
  sign?: 'in' | 'out' | 'all'
  text_filter?: string
  project_id?: string
  bank_account_id?: string
  session_id?: string
  page?: number
  page_size?: number
}

export interface RecordTransfer {
  to_area: Area
  note?: string
}

export interface Conflict {
  record_id: string
  reference: string
  your_version: Record
  current_version: Record
  modified_by: {
    id: string
    name: string
    email: string
  }
  fields_changed: string[]
}

export interface ConflictResolution {
  record_id: string
  resolution: 'keep_mine' | 'keep_theirs'
}
