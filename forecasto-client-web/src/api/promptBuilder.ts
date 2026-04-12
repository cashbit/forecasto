import apiClient from './client'
import type {
  AgentPromptResponse,
  GeneratePromptResponse,
  PatternAnalysisResponse,
  PromptGenerationJob,
  UsageSummary,
} from '@/types/promptBuilder'

export const promptBuilderApi = {
  // Workspace prompt
  getWorkspacePrompt: async (workspaceId: string): Promise<AgentPromptResponse> => {
    const response = await apiClient.get<AgentPromptResponse>(`/workspaces/${workspaceId}/agent-prompt`)
    return response.data
  },

  updateWorkspacePrompt: async (workspaceId: string, prompt: string): Promise<void> => {
    await apiClient.put(`/workspaces/${workspaceId}/agent-prompt`, { prompt })
  },

  generateWorkspacePrompt: async (workspaceId: string, forceRegenerate = false): Promise<GeneratePromptResponse> => {
    const response = await apiClient.post<GeneratePromptResponse>(
      `/workspaces/${workspaceId}/generate-prompt`,
      { force_regenerate: forceRegenerate }
    )
    return response.data
  },

  getRecordPatterns: async (workspaceId: string): Promise<PatternAnalysisResponse> => {
    const response = await apiClient.get<PatternAnalysisResponse>(`/workspaces/${workspaceId}/record-patterns`)
    return response.data
  },

  getGenerationHistory: async (workspaceId: string): Promise<PromptGenerationJob[]> => {
    const response = await apiClient.get<PromptGenerationJob[]>(`/workspaces/${workspaceId}/prompt-history`)
    return response.data
  },

  // User prompt
  getUserPrompt: async (): Promise<AgentPromptResponse> => {
    const response = await apiClient.get<AgentPromptResponse>('/users/me/agent-prompt')
    return response.data
  },

  updateUserPrompt: async (prompt: string): Promise<void> => {
    await apiClient.put('/users/me/agent-prompt', { prompt })
  },

  generateUserPrompt: async (forceRegenerate = false): Promise<GeneratePromptResponse> => {
    const response = await apiClient.post<GeneratePromptResponse>(
      '/users/me/generate-prompt',
      { force_regenerate: forceRegenerate }
    )
    return response.data
  },

  // Usage
  getUsageSummary: async (): Promise<UsageSummary[]> => {
    const response = await apiClient.get<{ months: UsageSummary[] }>('/users/me/prompt-usage')
    return response.data.months
  },
}
