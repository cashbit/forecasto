export interface UsageSummary {
  total_documents: number
  total_pages: number
  total_input_tokens: number
  total_output_tokens: number
  by_model: ModelUsageSummary[]
  // Monthly quota (user-level)
  monthly_page_quota: number
  pages_this_month: number
  pages_remaining: number
  // Agente-zero (separate feature, billed in EUR)
  agent_zero?: AgentZeroUsage
}

export interface AgentZeroUsageMonth {
  month: string
  input_tokens: number
  output_tokens: number
  cost_eur: number
  runs: number
}

export interface AgentZeroUsage {
  runs_this_month: number
  input_tokens_this_month: number
  output_tokens_this_month: number
  cost_eur_this_month: number
  by_month: AgentZeroUsageMonth[]
}

export interface ModelUsageSummary {
  llm_model: string
  document_count: number
  pages: number
  input_tokens: number
  output_tokens: number
}

export interface UsageRecord {
  id: string
  workspace_id: string
  job_id: string
  llm_provider: string
  llm_model: string
  pages_processed: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  total_tokens: number
  created_at: string
}
