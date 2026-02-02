import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { workspacesApi } from '@/api/workspaces'
import type { Workspace } from '@/types/workspace'

interface WorkspaceState {
  workspaces: Workspace[]
  currentWorkspaceId: string | null
  currentWorkspace: Workspace | null
  isLoading: boolean
  fetchWorkspaces: () => Promise<void>
  setCurrentWorkspace: (workspaceId: string | null) => void
  createWorkspace: (name: string, description?: string) => Promise<Workspace>
  updateWorkspace: (workspaceId: string, data: Partial<Workspace>) => Promise<void>
  deleteWorkspace: (workspaceId: string) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      currentWorkspaceId: null,
      currentWorkspace: null,
      isLoading: false,

      fetchWorkspaces: async () => {
        set({ isLoading: true })
        try {
          const workspaces = await workspacesApi.list()
          const { currentWorkspaceId } = get()
          const currentWorkspace = currentWorkspaceId
            ? workspaces.find((w) => w.id === currentWorkspaceId) || workspaces[0] || null
            : workspaces[0] || null

          set({
            workspaces,
            currentWorkspace,
            currentWorkspaceId: currentWorkspace?.id || null,
            isLoading: false,
          })
        } catch {
          set({ isLoading: false })
        }
      },

      setCurrentWorkspace: (workspaceId) => {
        const { workspaces } = get()
        const workspace = workspaceId ? workspaces.find((w) => w.id === workspaceId) || null : null
        set({
          currentWorkspaceId: workspaceId,
          currentWorkspace: workspace,
        })
      },

      createWorkspace: async (name, description) => {
        const workspace = await workspacesApi.create({ name, description })
        set((state) => ({
          workspaces: [...state.workspaces, workspace],
          currentWorkspaceId: workspace.id,
          currentWorkspace: workspace,
        }))
        return workspace
      },

      updateWorkspace: async (workspaceId, data) => {
        const workspace = await workspacesApi.update(workspaceId, data)
        set((state) => ({
          workspaces: state.workspaces.map((w) => (w.id === workspaceId ? workspace : w)),
          currentWorkspace: state.currentWorkspaceId === workspaceId ? workspace : state.currentWorkspace,
        }))
      },

      deleteWorkspace: async (workspaceId) => {
        await workspacesApi.delete(workspaceId)
        set((state) => {
          const workspaces = state.workspaces.filter((w) => w.id !== workspaceId)
          const newCurrent = state.currentWorkspaceId === workspaceId ? workspaces[0] || null : state.currentWorkspace
          return {
            workspaces,
            currentWorkspaceId: newCurrent?.id || null,
            currentWorkspace: newCurrent,
          }
        })
      },
    }),
    {
      name: 'forecasto-workspace',
      partialize: (state) => ({
        currentWorkspaceId: state.currentWorkspaceId,
      }),
    }
  )
)
