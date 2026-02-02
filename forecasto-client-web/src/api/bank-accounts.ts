import apiClient from './client'
import type { BankAccount, BankAccountCreate, BankAccountUpdate } from '@/types/cashflow'

export const bankAccountsApi = {
  list: async (workspaceId: string): Promise<BankAccount[]> => {
    const response = await apiClient.get<BankAccount[]>(`/workspaces/${workspaceId}/bank-accounts`)
    return response.data
  },

  get: async (workspaceId: string, accountId: string): Promise<BankAccount> => {
    const response = await apiClient.get<BankAccount>(`/workspaces/${workspaceId}/bank-accounts/${accountId}`)
    return response.data
  },

  create: async (workspaceId: string, data: BankAccountCreate): Promise<BankAccount> => {
    const response = await apiClient.post<BankAccount>(`/workspaces/${workspaceId}/bank-accounts`, data)
    return response.data
  },

  update: async (workspaceId: string, accountId: string, data: BankAccountUpdate): Promise<BankAccount> => {
    const response = await apiClient.patch<BankAccount>(`/workspaces/${workspaceId}/bank-accounts/${accountId}`, data)
    return response.data
  },

  delete: async (workspaceId: string, accountId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/bank-accounts/${accountId}`)
  },
}
