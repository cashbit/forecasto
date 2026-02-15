import apiClient from './client'
import type { Record, RecordCreate, RecordUpdate, RecordFilters, RecordTransfer } from '@/types/record'
import type { PaginatedResponse } from '@/types/api'

export const recordsApi = {
  list: async (workspaceId: string, filters: RecordFilters): Promise<PaginatedResponse<Record>> => {
    const response = await apiClient.get<{ success: boolean; records: Record[]; total_records: number }>(`/workspaces/${workspaceId}/records`, { params: filters })
    const page = filters.page || 1
    const pageSize = filters.page_size || 100
    const total = response.data.total_records
    return {
      items: response.data.records,
      total,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(total / pageSize)
    }
  },

  get: async (workspaceId: string, recordId: string): Promise<Record> => {
    const response = await apiClient.get<{ success: boolean; record: Record }>(`/workspaces/${workspaceId}/records/${recordId}`)
    return response.data.record
  },

  create: async (workspaceId: string, data: RecordCreate): Promise<Record> => {
    const response = await apiClient.post<{ success: boolean; record: Record }>(`/workspaces/${workspaceId}/records`, data)
    return response.data.record
  },

  update: async (workspaceId: string, recordId: string, data: RecordUpdate): Promise<Record> => {
    const response = await apiClient.patch<{ success: boolean; record: Record }>(`/workspaces/${workspaceId}/records/${recordId}`, data)
    return response.data.record
  },

  delete: async (workspaceId: string, recordId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/records/${recordId}`)
  },

  transfer: async (workspaceId: string, recordId: string, data: RecordTransfer): Promise<Record> => {
    const response = await apiClient.post<{ success: boolean; record: Record }>(`/workspaces/${workspaceId}/records/${recordId}/transfer`, data)
    return response.data.record
  },

  bulkCreate: async (workspaceId: string, records: RecordCreate[]): Promise<Record[]> => {
    const response = await apiClient.post<Record[]>(`/workspaces/${workspaceId}/records/bulk`, { records })
    return response.data
  },

  bulkImport: async (workspaceId: string, records: RecordCreate[]): Promise<Record[]> => {
    const response = await apiClient.post<{ success: boolean; records: Record[]; total: number }>(`/workspaces/${workspaceId}/records/bulk-import`, records)
    return response.data.records
  },

  bulkImportSdi: async (workspaceId: string, records: RecordCreate[]): Promise<Record[]> => {
    const response = await apiClient.post<{ success: boolean; records: Record[]; total: number }>(`/workspaces/${workspaceId}/records/bulk-import-sdi`, records)
    return response.data.records
  },

  bulkUpdate: async (workspaceId: string, updates: Array<{ id: string } & RecordUpdate>): Promise<Record[]> => {
    const response = await apiClient.patch<Record[]>(`/workspaces/${workspaceId}/records/bulk`, { updates })
    return response.data
  },

  bulkDelete: async (workspaceId: string, recordIds: string[]): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/records/bulk`, { data: { ids: recordIds } })
  },
}
