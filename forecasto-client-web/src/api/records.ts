import apiClient from './client'
import type { Record, RecordCreate, RecordUpdate, RecordFilters, RecordTransfer, Conflict, ConflictResolution } from '@/types/record'
import type { PaginatedResponse } from '@/types/api'

export const recordsApi = {
  list: async (workspaceId: string, filters: RecordFilters): Promise<PaginatedResponse<Record>> => {
    const response = await apiClient.get<PaginatedResponse<Record>>(`/workspaces/${workspaceId}/records`, { params: filters })
    return response.data
  },

  get: async (workspaceId: string, recordId: string): Promise<Record> => {
    const response = await apiClient.get<Record>(`/workspaces/${workspaceId}/records/${recordId}`)
    return response.data
  },

  create: async (workspaceId: string, data: RecordCreate): Promise<Record> => {
    const response = await apiClient.post<Record>(`/workspaces/${workspaceId}/records`, data)
    return response.data
  },

  update: async (workspaceId: string, recordId: string, data: RecordUpdate): Promise<Record> => {
    const response = await apiClient.patch<Record>(`/workspaces/${workspaceId}/records/${recordId}`, data)
    return response.data
  },

  delete: async (workspaceId: string, recordId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/records/${recordId}`)
  },

  transfer: async (workspaceId: string, recordId: string, data: RecordTransfer): Promise<Record> => {
    const response = await apiClient.post<Record>(`/workspaces/${workspaceId}/records/${recordId}/transfer`, data)
    return response.data
  },

  bulkCreate: async (workspaceId: string, records: RecordCreate[]): Promise<Record[]> => {
    const response = await apiClient.post<Record[]>(`/workspaces/${workspaceId}/records/bulk`, { records })
    return response.data
  },

  bulkUpdate: async (workspaceId: string, updates: Array<{ id: string } & RecordUpdate>): Promise<Record[]> => {
    const response = await apiClient.patch<Record[]>(`/workspaces/${workspaceId}/records/bulk`, { updates })
    return response.data
  },

  bulkDelete: async (workspaceId: string, recordIds: string[]): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/records/bulk`, { data: { ids: recordIds } })
  },

  checkConflicts: async (workspaceId: string, sessionId: string): Promise<Conflict[]> => {
    const response = await apiClient.get<Conflict[]>(`/workspaces/${workspaceId}/sessions/${sessionId}/conflicts`)
    return response.data
  },

  resolveConflicts: async (workspaceId: string, sessionId: string, resolutions: ConflictResolution[]): Promise<void> => {
    await apiClient.post(`/workspaces/${workspaceId}/sessions/${sessionId}/conflicts/resolve`, { resolutions })
  },
}
