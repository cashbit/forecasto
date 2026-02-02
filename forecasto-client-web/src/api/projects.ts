import apiClient from './client'
import type { Project, ProjectCreate, ProjectUpdate, Phase, PhaseCreate, PhaseUpdate, ProjectSummary } from '@/types/project'

export const projectsApi = {
  list: async (workspaceId: string): Promise<Project[]> => {
    const response = await apiClient.get<Project[]>(`/workspaces/${workspaceId}/projects`)
    return response.data
  },

  get: async (workspaceId: string, projectId: string): Promise<Project> => {
    const response = await apiClient.get<Project>(`/workspaces/${workspaceId}/projects/${projectId}`)
    return response.data
  },

  create: async (workspaceId: string, data: ProjectCreate): Promise<Project> => {
    const response = await apiClient.post<Project>(`/workspaces/${workspaceId}/projects`, data)
    return response.data
  },

  update: async (workspaceId: string, projectId: string, data: ProjectUpdate): Promise<Project> => {
    const response = await apiClient.patch<Project>(`/workspaces/${workspaceId}/projects/${projectId}`, data)
    return response.data
  },

  delete: async (workspaceId: string, projectId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/projects/${projectId}`)
  },

  getSummary: async (workspaceId: string, projectId: string): Promise<ProjectSummary> => {
    const response = await apiClient.get<ProjectSummary>(`/workspaces/${workspaceId}/projects/${projectId}/summary`)
    return response.data
  },

  // Phase endpoints
  createPhase: async (workspaceId: string, projectId: string, data: PhaseCreate): Promise<Phase> => {
    const response = await apiClient.post<Phase>(`/workspaces/${workspaceId}/projects/${projectId}/phases`, data)
    return response.data
  },

  updatePhase: async (workspaceId: string, projectId: string, phaseId: string, data: PhaseUpdate): Promise<Phase> => {
    const response = await apiClient.patch<Phase>(`/workspaces/${workspaceId}/projects/${projectId}/phases/${phaseId}`, data)
    return response.data
  },

  deletePhase: async (workspaceId: string, projectId: string, phaseId: string): Promise<void> => {
    await apiClient.delete(`/workspaces/${workspaceId}/projects/${projectId}/phases/${phaseId}`)
  },
}
