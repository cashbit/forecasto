import { apiClient } from './client'
import type { UsageSummary, UsageRecord } from '@/types/usage'

export const usageApi = {
  async getSummary(workspaceId: string, fromDate?: string, toDate?: string): Promise<UsageSummary> {
    const params: Record<string, string> = {}
    if (fromDate) params.from_date = fromDate
    if (toDate) params.to_date = toDate
    const res = await apiClient.get(`/workspaces/${workspaceId}/usage`, { params })
    return res.data
  },

  async listRecords(workspaceId: string, limit = 50, offset = 0): Promise<{ records: UsageRecord[]; total: number }> {
    const res = await apiClient.get(`/workspaces/${workspaceId}/usage/records`, {
      params: { limit, offset },
    })
    return res.data
  },
}
