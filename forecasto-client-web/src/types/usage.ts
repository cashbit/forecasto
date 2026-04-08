export interface UsageSummary {
  total_documents: number
  total_input_tokens: number
  total_output_tokens: number
  total_cost_usd: number
  total_billed_cost_usd: number
  by_model: ModelUsageSummary[]
}

export interface ModelUsageSummary {
  llm_model: string
  document_count: number
  input_tokens: number
  output_tokens: number
  total_cost_usd: number
  billed_cost_usd: number
}

export interface UsageRecord {
  id: string
  workspace_id: string
  job_id: string
  llm_provider: string
  llm_model: string
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  input_cost_usd: number
  output_cost_usd: number
  total_cost_usd: number
  billed_cost_usd: number
  multiplier: number
  created_at: string
}
