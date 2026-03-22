import apiClient from './client'
import type {
  VatRegistry,
  VatRegistryCreate,
  VatRegistryUpdate,
  VatBalance,
  VatBalanceCreate,
  VatBalanceUpdate,
} from '@/types/vat'

export const vatRegistryApi = {
  // ── Registry CRUD ──────────────────────────────────────────────

  list: async (): Promise<VatRegistry[]> => {
    const response = await apiClient.get<VatRegistry[]>('/vat-registries')
    return response.data
  },

  get: async (registryId: string): Promise<VatRegistry> => {
    const response = await apiClient.get<VatRegistry>(`/vat-registries/${registryId}`)
    return response.data
  },

  create: async (data: VatRegistryCreate): Promise<VatRegistry> => {
    const response = await apiClient.post<VatRegistry>('/vat-registries', data)
    return response.data
  },

  update: async (registryId: string, data: VatRegistryUpdate): Promise<VatRegistry> => {
    const response = await apiClient.patch<VatRegistry>(`/vat-registries/${registryId}`, data)
    return response.data
  },

  remove: async (registryId: string): Promise<void> => {
    await apiClient.delete(`/vat-registries/${registryId}`)
  },

  // ── Balance CRUD ───────────────────────────────────────────────

  listBalances: async (registryId: string): Promise<VatBalance[]> => {
    const response = await apiClient.get<VatBalance[]>(`/vat-registries/${registryId}/balances`)
    return response.data
  },

  createBalance: async (registryId: string, data: VatBalanceCreate): Promise<VatBalance> => {
    const response = await apiClient.post<VatBalance>(`/vat-registries/${registryId}/balances`, data)
    return response.data
  },

  updateBalance: async (registryId: string, balanceId: string, data: VatBalanceUpdate): Promise<VatBalance> => {
    const response = await apiClient.patch<VatBalance>(
      `/vat-registries/${registryId}/balances/${balanceId}`,
      data,
    )
    return response.data
  },

  deleteBalance: async (registryId: string, balanceId: string): Promise<void> => {
    await apiClient.delete(`/vat-registries/${registryId}/balances/${balanceId}`)
  },
}
