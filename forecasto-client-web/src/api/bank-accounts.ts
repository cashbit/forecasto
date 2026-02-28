import apiClient from './client'
import type { BankAccount, BankAccountBalance, BankAccountBalanceCreate, BankAccountCreate, BankAccountUpdate } from '@/types/cashflow'

export const bankAccountsApi = {
  // --- User-level endpoints (personal bank account registry) ---

  listUserAccounts: async (): Promise<BankAccount[]> => {
    const response = await apiClient.get<{ success: boolean; bank_accounts: BankAccount[] }>('/bank-accounts')
    return response.data.bank_accounts
  },

  create: async (data: BankAccountCreate): Promise<BankAccount> => {
    const response = await apiClient.post<{ success: boolean; bank_account: BankAccount }>('/bank-accounts', data)
    return response.data.bank_account
  },

  update: async (accountId: string, data: BankAccountUpdate): Promise<BankAccount> => {
    const response = await apiClient.patch<{ success: boolean; bank_account: BankAccount }>(`/bank-accounts/${accountId}`, data)
    return response.data.bank_account
  },

  // --- Workspace-level endpoints (1-to-1 association) ---

  getWorkspaceAccount: async (workspaceId: string): Promise<BankAccount | null> => {
    const response = await apiClient.get<{ success: boolean; bank_account: BankAccount | null }>(
      `/workspaces/${workspaceId}/bank-account`
    )
    return response.data.bank_account
  },

  setWorkspaceAccount: async (workspaceId: string, accountId: string): Promise<BankAccount> => {
    const response = await apiClient.put<{ success: boolean; bank_account: BankAccount }>(
      `/workspaces/${workspaceId}/bank-account/${accountId}`
    )
    return response.data.bank_account
  },

  unsetWorkspaceAccount: async (workspaceId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/bank-account`)
  },

  // --- Balance endpoints ---

  getBalances: async (workspaceId: string, accountId: string, fromDate?: string, toDate?: string): Promise<BankAccountBalance[]> => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from_date', fromDate)
    if (toDate) params.set('to_date', toDate)
    const query = params.toString() ? `?${params.toString()}` : ''
    const response = await apiClient.get<{ success: boolean; balances: BankAccountBalance[] }>(
      `/workspaces/${workspaceId}/bank-accounts/${accountId}/balances${query}`
    )
    return response.data.balances
  },

  addBalance: async (workspaceId: string, accountId: string, data: BankAccountBalanceCreate): Promise<BankAccountBalance> => {
    const response = await apiClient.post<{ success: boolean; balance: BankAccountBalance }>(
      `/workspaces/${workspaceId}/bank-accounts/${accountId}/balances`,
      data
    )
    return response.data.balance
  },

  deleteBalance: async (workspaceId: string, accountId: string, balanceId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/bank-accounts/${accountId}/balances/${balanceId}`)
  },
}
