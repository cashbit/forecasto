import apiClient from './client'
import type { InboxItem, InboxItemUpdate, InboxCountResponse } from '@/types/inbox'

interface ListInboxParams {
  status?: 'pending' | 'confirmed' | 'rejected'
  limit?: number
  offset?: number
}

export const inboxApi = {
  list: async (workspaceId: string, params?: ListInboxParams): Promise<{ items: InboxItem[]; total: number }> => {
    const response = await apiClient.get<{ success: boolean; items: InboxItem[]; total: number }>(
      `/workspaces/${workspaceId}/inbox`,
      { params }
    )
    return { items: response.data.items, total: response.data.total }
  },

  get: async (workspaceId: string, itemId: string): Promise<InboxItem> => {
    const response = await apiClient.get<{ success: boolean; item: InboxItem }>(
      `/workspaces/${workspaceId}/inbox/${itemId}`
    )
    return response.data.item
  },

  count: async (workspaceId: string): Promise<InboxCountResponse> => {
    const response = await apiClient.get<InboxCountResponse>(
      `/workspaces/${workspaceId}/inbox/count`
    )
    return response.data
  },

  update: async (workspaceId: string, itemId: string, data: InboxItemUpdate): Promise<InboxItem> => {
    const response = await apiClient.patch<{ success: boolean; item: InboxItem }>(
      `/workspaces/${workspaceId}/inbox/${itemId}`,
      data
    )
    return response.data.item
  },

  confirm: async (workspaceId: string, itemId: string): Promise<InboxItem> => {
    const response = await apiClient.post<{ success: boolean; item: InboxItem }>(
      `/workspaces/${workspaceId}/inbox/${itemId}/confirm`
    )
    return response.data.item
  },

  reject: async (workspaceId: string, itemId: string): Promise<InboxItem> => {
    const response = await apiClient.post<{ success: boolean; item: InboxItem }>(
      `/workspaces/${workspaceId}/inbox/${itemId}/reject`
    )
    return response.data.item
  },

  delete: async (workspaceId: string, itemId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/inbox/${itemId}`)
  },

  markReconciled: async (workspaceId: string, itemId: string, recordIds: string[], _paymentDate?: string): Promise<InboxItem> => {
    const res = await apiClient.patch<{ success: boolean; item: InboxItem }>(
      `/workspaces/${workspaceId}/inbox/${itemId}`,
      {
        reconciliation_matches: recordIds.map(id => ({ record_id: id, confirmed: true })),
      }
    )
    return res.data.item
  },
}
