import { apiClient } from './client'

export interface AgentToken {
  id: string
  name: string
  created_at: string
  last_used_at: string | null
}

export interface AgentTokenCreated extends AgentToken {
  token: string // raw token shown only once
}

export const agentApi = {
  async listTokens(): Promise<AgentToken[]> {
    const res = await apiClient.get('/agent/tokens')
    return res.data.tokens
  },

  async createToken(name: string): Promise<AgentTokenCreated> {
    const res = await apiClient.post('/agent/tokens', { name })
    return res.data
  },

  async revokeToken(tokenId: string): Promise<void> {
    await apiClient.delete(`/agent/tokens/${tokenId}`)
  },
}
