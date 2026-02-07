import { create } from 'zustand'
import { apiClient } from '@/api/client'

export interface HistoryEntry {
  id: string
  record_id: string
  version: number
  change_type: string
  change_note: string | null
  changed_at: string
  changed_by: string
  snapshot: Record<string, unknown>
}

interface HistoryState {
  history: HistoryEntry[]
  isLoading: boolean
  error: string | null

  fetchHistory: (workspaceId: string, limit?: number) => Promise<void>
  rollbackToVersion: (workspaceId: string, versionId: string) => Promise<void>
  deleteHistory: (workspaceId: string) => Promise<void>
  clearHistory: () => void
}

export const useHistoryStore = create<HistoryState>()((set) => ({
  history: [],
  isLoading: false,
  error: null,

  fetchHistory: async (workspaceId, limit = 100) => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get(`/workspaces/${workspaceId}/history`, {
        params: { limit },
      })
      set({
        history: response.data.history,
        isLoading: false,
      })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch history',
      })
    }
  },

  rollbackToVersion: async (workspaceId, versionId) => {
    console.log('[HistoryStore] rollbackToVersion called:', { workspaceId, versionId })
    set({ isLoading: true, error: null })
    try {
      const rollbackRes = await apiClient.post(`/workspaces/${workspaceId}/rollback/${versionId}`)
      console.log('[HistoryStore] Rollback API response:', rollbackRes.data)
      // Refetch history after rollback
      const response = await apiClient.get(`/workspaces/${workspaceId}/history`)
      set({
        history: response.data.history,
        isLoading: false,
      })
    } catch (error: unknown) {
      const axiosError = error as { response?: { status: number; data: unknown } }
      console.error('[HistoryStore] Rollback failed:', axiosError.response?.status, axiosError.response?.data)
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to rollback',
      })
      throw error
    }
  },

  deleteHistory: async (workspaceId) => {
    set({ isLoading: true, error: null })
    try {
      await apiClient.delete(`/workspaces/${workspaceId}/history`)
      set({ history: [], isLoading: false })
    } catch (error: unknown) {
      const axiosError = error as { response?: { status: number; data: unknown } }
      console.error('[HistoryStore] Clear history failed:', axiosError.response?.status, axiosError.response?.data)
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to clear history',
      })
      throw error
    }
  },

  clearHistory: () => {
    set({ history: [], error: null })
  },
}))
