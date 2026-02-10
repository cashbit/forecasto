import type { Area } from './record'

// JSON import format from legacy system
export interface ImportRecord {
  id: string
  type: string // "0" = actual, "1" = orders, "2" = prospect, "3" = budget
  account: string
  reference: string
  note: string
  date_cashflow: string
  date_offer: string
  amount: string
  vat: string
  vat_deduction?: string
  total: string
  stage: string
  transaction_id: string
  // Future fields - optional
  project_code?: string
  owner?: string
  nextaction?: string
  review_date?: string
}

// Mapping from legacy type to area
export const LEGACY_TYPE_TO_AREA: Record<string, Area> = {
  '0': 'actual',
  '1': 'orders',
  '2': 'prospect',
  '3': 'budget',
}

export interface ImportResult {
  total: number
  success: number
  failed: number
  errors: string[]
  byArea: {
    actual: number
    orders: number
    prospect: number
    budget: number
  }
}
