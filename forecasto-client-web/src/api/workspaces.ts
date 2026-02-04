import apiClient from './client'
import type { Workspace, WorkspaceCreate, WorkspaceUpdate, WorkspaceMember } from '@/types/workspace'

export const workspacesApi = {
  list: async (): Promise<Workspace[]> => {
    const response = await apiClient.get<{ success: boolean; workspaces: Workspace[] }>('/workspaces')
    return response.data.workspaces
  },

  get: async (workspaceId: string): Promise<Workspace> => {
    const response = await apiClient.get<{ success: boolean; workspace: Workspace }>(`/workspaces/${workspaceId}`)
    return response.data.workspace
  },

  create: async (data: WorkspaceCreate): Promise<Workspace> => {
    const response = await apiClient.post<{ success: boolean; workspace: Workspace }>('/workspaces', data)
    return response.data.workspace
  },

  update: async (workspaceId: string, data: WorkspaceUpdate): Promise<Workspace> => {
    const response = await apiClient.patch<{ success: boolean; workspace: Workspace }>(`/workspaces/${workspaceId}`, data)
    return response.data.workspace
  },

  delete: async (workspaceId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}`)
  },

  getMembers: async (workspaceId: string): Promise<WorkspaceMember[]> => {
    const response = await apiClient.get<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`)
    return response.data
  },

  inviteMember: async (workspaceId: string, email: string, role: string): Promise<WorkspaceMember> => {
    const response = await apiClient.post<WorkspaceMember>(`/workspaces/${workspaceId}/members`, { email, role })
    return response.data
  },

  removeMember: async (workspaceId: string, memberId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/members/${memberId}`)
  },
}
