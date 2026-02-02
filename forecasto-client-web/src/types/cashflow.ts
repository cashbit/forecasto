import type { Area } from './record'

export interface CashflowParams {
  from_date: string
  to_date: string
  areas: Area[]
  group_by: 'day' | 'week' | 'month'
  bank_account_id?: string
  project_id?: string
}

export interface CashflowEntry {
  date: string
  inflows: number
  outflows: number
  net: number
  running_balance: number
  by_area: {
    budget?: { inflows: number; outflows: number }
    prospect?: { inflows: number; outflows: number }
    orders?: { inflows: number; outflows: number }
    actual?: { inflows: number; outflows: number }
  }
}

export interface CashflowSummary {
  total_inflows: number
  total_outflows: number
  net_cashflow: number
  initial_balance: number
  final_balance: number
  min_balance: number
  min_balance_date: string
}

export interface CashflowResponse {
  cashflow: CashflowEntry[]
  summary: CashflowSummary
  initial_balance: {
    total: number
    by_account: Record<string, number>
  }
}

export interface BankAccount {
  id: string
  workspace_id: string
  name: string
  bank_name: string
  iban?: string
  currency: string
  initial_balance: string
  current_balance: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface BankAccountCreate {
  name: string
  bank_name: string
  iban?: string
  currency?: string
  initial_balance?: string
}

export interface BankAccountUpdate {
  name?: string
  bank_name?: string
  iban?: string
  currency?: string
  is_active?: boolean
}
