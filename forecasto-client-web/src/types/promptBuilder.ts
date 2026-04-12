export interface PromptUsageInfo {
  input_tokens: number
  output_tokens: number
  total_cost_eur: number
  model: string
}

export interface GeneratePromptResponse {
  success: boolean
  prompt: string
  is_update: boolean
  usage: PromptUsageInfo
  records_analyzed: number
}

export interface AgentPromptResponse {
  prompt: string | null
  last_generated_at: string | null
  records_analyzed: number
}

export interface PatternAnalysisResponse {
  total_records: number
  account_frequency: Array<{ account: string; total: number; in_count: number; out_count: number }>
  reference_account_mapping: Array<{ reference: string; account: string; count: number }>
  reference_total_patterns: Array<{ reference: string; count: number; avg_total: number; min_total: number; max_total: number }>
  type_area_mapping: Array<{ type: string; area: string; count: number }>
  vat_deduction_patterns: Array<{ account: string; vat_deduction: number; count: number }>
  withholding_patterns: Array<{ type: string; account: string; withholding_rate: number; count: number }>
  project_account_mapping: Array<{ project_code: string; account: string; count: number }>
  stage_patterns: Array<{ reference: string; stage: string; count: number }>
  payment_terms: Array<{ reference: string; count: number; avg_days: number }>
}

export interface PromptGenerationJob {
  id: string
  scope: string
  status: string
  llm_model: string | null
  input_tokens: number
  output_tokens: number
  total_cost_eur: number
  records_analyzed: number
  billing_month: string
  created_at: string
}

export interface UsageSummary {
  month: string
  total_input_tokens: number
  total_output_tokens: number
  total_cost_eur: number
  generation_count: number
}
