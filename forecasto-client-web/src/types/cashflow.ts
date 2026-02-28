import type { Area } from './record'

export interface CashflowParams {
  from_date: string
  to_date: string
  areas: Area[]
  group_by: 'day' | 'week' | 'month'
  bank_account_id?: string
  project_code?: string
}

export interface AccountCashflowEntry {
  inflows: number
  outflows: number
  running_balance: number
}

export interface CashflowEntry {
  date: string
  inflows: number
  outflows: number
  net: number
  running_balance: number
  balance_snapshot?: number | null  // declared bank balance on this date (triggers reset)
  by_area: {
    budget?: { inflows: number; outflows: number }
    prospect?: { inflows: number; outflows: number }
    orders?: { inflows: number; outflows: number }
    actual?: { inflows: number; outflows: number }
  }
  by_account?: Record<string, AccountCashflowEntry>
}

export interface AccountBalance {
  name: string
  balance: number
  credit_limit: number
}

export interface InitialBalance {
  date: string
  total: number
  by_account: Record<string, AccountBalance>
}

export interface BalancePoint {
  date: string
  amount: number
}

export interface CashflowSummary {
  total_inflows: number
  total_outflows: number
  net_cashflow: number
  final_balance: number
  min_balance: BalancePoint
  max_balance: BalancePoint
  credit_limit_breaches: BalancePoint[]
}

export interface CashflowResponse {
  success: boolean
  parameters: CashflowParams
  cashflow: CashflowEntry[]
  summary: CashflowSummary
  initial_balance: InitialBalance
}

export interface BankAccount {
  id: string
  owner_id: string | null
  name: string
  bank_name: string | null
  description: string | null
  currency: string
  credit_limit: number
  is_active: boolean
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface BankAccountBalance {
  id: string
  bank_account_id: string
  balance_date: string
  balance: number
  source: string
  recorded_at: string
  note: string | null
}

export interface BankAccountBalanceCreate {
  balance_date: string
  balance: number
  source?: string
  note?: string
}

export interface BankAccountCreate {
  name: string
  bank_name?: string
  description?: string
  currency?: string
  credit_limit?: number
  settings?: Record<string, unknown>
}

export interface BankAccountUpdate {
  name?: string
  bank_name?: string
  description?: string
  currency?: string
  credit_limit?: number
  is_active?: boolean
  settings?: Record<string, unknown>
}

