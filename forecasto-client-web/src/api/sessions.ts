import apiClient from './client'
import type { Session, SessionCreate, SessionCommit, Operation, ChatMessage } from '@/types/session'

export const sessionsApi = {
  list: async (workspaceId: string): Promise<Session[]> => {
    const response = await apiClient.get<{ success: boolean; sessions: Session[] }>(`/workspaces/${workspaceId}/sessions`)
    return response.data.sessions
  },

  get: async (workspaceId: string, sessionId: string): Promise<Session> => {
    const response = await apiClient.get<{ success: boolean; session: Session }>(`/workspaces/${workspaceId}/sessions/${sessionId}`)
    return response.data.session
  },

  create: async (workspaceId: string, data: SessionCreate): Promise<Session> => {
    const response = await apiClient.post<{ success: boolean; session: Session }>(`/workspaces/${workspaceId}/sessions`, data)
    return response.data.session
  },

  commit: async (workspaceId: string, sessionId: string, data: SessionCommit): Promise<Session> => {
    const response = await apiClient.post<{ success: boolean; session: Session }>(`/workspaces/${workspaceId}/sessions/${sessionId}/commit`, data)
    return response.data.session
  },

  discard: async (workspaceId: string, sessionId: string): Promise<Session> => {
    const response = await apiClient.post<{ success: boolean; session: Session }>(`/workspaces/${workspaceId}/sessions/${sessionId}/discard`)
    return response.data.session
  },

  getOperations: async (workspaceId: string, sessionId: string): Promise<Operation[]> => {
    const response = await apiClient.get<{ success: boolean; operations: Operation[] }>(`/workspaces/${workspaceId}/sessions/${sessionId}/operations`)
    return response.data.operations
  },

  undo: async (workspaceId: string, sessionId: string): Promise<Operation> => {
    const response = await apiClient.post<{ success: boolean; operation: Operation }>(`/workspaces/${workspaceId}/sessions/${sessionId}/undo`)
    return response.data.operation
  },

  redo: async (workspaceId: string, sessionId: string): Promise<Operation> => {
    const response = await apiClient.post<{ success: boolean; operation: Operation }>(`/workspaces/${workspaceId}/sessions/${sessionId}/redo`)
    return response.data.operation
  },

  getMessages: async (workspaceId: string, sessionId: string): Promise<ChatMessage[]> => {
    const response = await apiClient.get<ChatMessage[]>(`/workspaces/${workspaceId}/sessions/${sessionId}/messages`)
    return response.data
  },

  sendMessage: async (workspaceId: string, sessionId: string, content: string): Promise<ChatMessage> => {
    const response = await apiClient.post<ChatMessage>(`/workspaces/${workspaceId}/sessions/${sessionId}/messages`, { content })
    return response.data
  },
}
