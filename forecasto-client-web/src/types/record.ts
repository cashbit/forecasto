export type Area = 'budget' | 'prospect' | 'orders' | 'actual'

export interface Classification {
  category: string
  subcategory?: string
  tags?: string[]
  source_file?: string
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
  owner?: string
  amount: string
  vat: string
  vat_deduction?: string
  total: string
  stage: string
  nextaction?: string
  review_date?: string
  transaction_id?: string
  bank_account_id?: string
  project_code?: string
  classification?: Classification
  transfer_history?: TransferEntry[]
  version: number
  is_draft?: boolean
  created_by?: string
  updated_by?: string
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
  owner?: string
  amount: string
  vat?: string
  vat_deduction?: string
  total: string
  stage?: string
  nextaction?: string
  review_date?: string
  transaction_id: string
  bank_account_id?: string
  project_code?: string
  classification?: Classification
}

export interface RecordUpdate {
  type?: string
  account?: string
  reference?: string
  note?: string
  date_cashflow?: string
  date_offer?: string
  owner?: string
  amount?: string
  vat?: string
  vat_deduction?: string
  total?: string
  stage?: string
  nextaction?: string
  review_date?: string
  transaction_id?: string
  bank_account_id?: string
  project_code?: string
  classification?: Classification
}

export type TextFilterField = 'account' | 'reference' | 'note' | 'owner' | 'transaction_id'

export interface RecordFilters {
  area: Area
  date_start?: string
  date_end?: string
  sign?: 'in' | 'out' | 'all'
  text_filter?: string
  text_filter_field?: TextFilterField
  project_code?: string
  bank_account_id?: string
  page?: number
  page_size?: number
}

export interface RecordTransfer {
  to_area: Area
  note?: string
}
