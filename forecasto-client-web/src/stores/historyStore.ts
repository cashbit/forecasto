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
  clearHistory: () => void
}

export const useHistoryStore = create<HistoryState>()((set) => ({
  history: [],
  isLoading: false,
  error: null,

  fetchHistory: async (workspaceId, limit = 100) => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get(`/api/${workspaceId}/history`, {
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
    set({ isLoading: true, error: null })
    try {
      await apiClient.post(`/api/${workspaceId}/rollback/${versionId}`)
      // Refetch history after rollback
      const response = await apiClient.get(`/api/${workspaceId}/history`)
      set({
        history: response.data.history,
        isLoading: false,
      })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to rollback',
      })
      throw error
    }
  },

  clearHistory: () => {
    set({ history: [], error: null })
  },
}))
