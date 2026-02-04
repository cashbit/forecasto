import apiClient from './client'
import type { CashflowParams, CashflowResponse } from '@/types/cashflow'

export const cashflowApi = {
  getCashflow: async (workspaceId: string, params: CashflowParams): Promise<CashflowResponse> => {
    const response = await apiClient.get<CashflowResponse>(`/workspaces/${workspaceId}/cashflow`, {
      params,
      paramsSerializer: {
        indexes: null, // This makes arrays serialize as areas=a&areas=b instead of areas[]=a
      },
    })
    return response.data
  },

  exportCashflow: async (workspaceId: string, params: CashflowParams, format: 'csv' | 'xlsx'): Promise<Blob> => {
    const response = await apiClient.get(`/workspaces/${workspaceId}/cashflow/export`, {
      params: { ...params, format },
      responseType: 'blob',
    })
    return response.data
  },
}
