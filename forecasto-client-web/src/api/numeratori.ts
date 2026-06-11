import apiClient from './client'
import type {
  Numeratore,
  NumeratoreCreate,
  NumeratoreEntry,
  NumeratoreUpdate,
} from '@/types/numeratori'

export const numeratoriApi = {
  list: async (workspaceId: string): Promise<Numeratore[]> => {
    const response = await apiClient.get<{ success: boolean; numerators: Numeratore[] }>(
      `/workspaces/${workspaceId}/numerators`,
    )
    return response.data.numerators
  },

  create: async (workspaceId: string, data: NumeratoreCreate): Promise<Numeratore> => {
    const response = await apiClient.post<{ success: boolean; numerator: Numeratore }>(
      `/workspaces/${workspaceId}/numerators`,
      data,
    )
    return response.data.numerator
  },

  update: async (
    workspaceId: string,
    numeratoreId: string,
    data: NumeratoreUpdate,
  ): Promise<Numeratore> => {
    const response = await apiClient.patch<{ success: boolean; numerator: Numeratore }>(
      `/workspaces/${workspaceId}/numerators/${numeratoreId}`,
      data,
    )
    return response.data.numerator
  },

  remove: async (workspaceId: string, numeratoreId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/numerators/${numeratoreId}`)
  },

  listEntries: async (workspaceId: string, numeratoreId: string): Promise<NumeratoreEntry[]> => {
    const response = await apiClient.get<{ success: boolean; entries: NumeratoreEntry[] }>(
      `/workspaces/${workspaceId}/numerators/${numeratoreId}/entries`,
    )
    return response.data.entries
  },
}
