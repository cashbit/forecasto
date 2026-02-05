import apiClient from './client'
import type { Workspace, WorkspaceCreate, WorkspaceUpdate, WorkspaceMember, MemberUpdate, PendingInvitation, GranularAreaPermissions, WorkspaceInvitation } from '@/types/workspace'

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
    const response = await apiClient.get<{ success: boolean; members: WorkspaceMember[] }>(`/workspaces/${workspaceId}/members`)
    return response.data.members
  },

  getWorkspaceInvitations: async (workspaceId: string): Promise<WorkspaceInvitation[]> => {
    const response = await apiClient.get<{ success: boolean; invitations: WorkspaceInvitation[] }>(`/workspaces/${workspaceId}/invitations`)
    return response.data.invitations
  },

  updateInvitation: async (workspaceId: string, invitationId: string, data: MemberUpdate): Promise<void> => {
    await apiClient.patch(`/workspaces/${workspaceId}/invitations/${invitationId}`, data)
  },

  cancelInvitation: async (workspaceId: string, invitationId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/invitations/${invitationId}`)
  },

  inviteMember: async (workspaceId: string, inviteCode: string, role: string, granularPermissions?: GranularAreaPermissions): Promise<void> => {
    await apiClient.post(`/workspaces/${workspaceId}/invitations`, {
      invite_code: inviteCode,
      role,
      granular_permissions: granularPermissions,
    })
  },

  lookupUserByCode: async (inviteCode: string): Promise<{ name: string; invite_code: string }> => {
    const response = await apiClient.get<{ success: boolean; user: { name: string; invite_code: string } }>(`/users/lookup/${inviteCode}`)
    return response.data.user
  },

  updateMember: async (workspaceId: string, userId: string, data: MemberUpdate): Promise<WorkspaceMember> => {
    const response = await apiClient.patch<{ success: boolean; member: WorkspaceMember }>(
      `/workspaces/${workspaceId}/members/${userId}`,
      data
    )
    return response.data.member
  },

  removeMember: async (workspaceId: string, userId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/members/${userId}`)
  },

  getPendingInvitations: async (): Promise<PendingInvitation[]> => {
    const response = await apiClient.get<{ success: boolean; invitations: PendingInvitation[] }>('/workspaces/invitations/pending')
    return response.data.invitations
  },

  acceptInvitation: async (invitationId: string): Promise<void> => {
    await apiClient.post(`/workspaces/invitations/${invitationId}/accept`)
  },
}
