import { apiClient } from './client'

export type AgentZeroKind = 'reminder' | 'criticality'

export interface AgentZeroItem {
  record_id: string
  workspace_id: string
  kind: AgentZeroKind
  text: string
  owner?: string | null
  due_date?: string | null
  review_date?: string | null
  date_cashflow?: string | null
  account: string
  reference: string
  area: string
  amount: string
}

export interface AgentZeroHighlights {
  success: boolean
  items: AgentZeroItem[]
  last_analyzed_at: string | null
  stale_count: number
  stats?: { analyzed: number; llm_calls: number; skipped: number }
}

export const agentZeroApi = {
  async highlights(workspaceId: string): Promise<AgentZeroHighlights> {
    const res = await apiClient.get(`/workspaces/${workspaceId}/agent-zero/highlights`)
    return res.data
  },

  async run(workspaceId: string): Promise<AgentZeroHighlights> {
    const res = await apiClient.post(`/workspaces/${workspaceId}/agent-zero/run`)
    return res.data
  },
}
