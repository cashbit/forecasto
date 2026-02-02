export interface Project {
  id: string
  workspace_id: string
  name: string
  code: string
  description?: string
  client?: string
  status: ProjectStatus
  start_date?: string
  end_date?: string
  budget_amount?: string
  phases: Phase[]
  created_at: string
  updated_at: string
}

export type ProjectStatus = 'draft' | 'active' | 'completed' | 'archived'

export interface Phase {
  id: string
  project_id: string
  name: string
  description?: string
  sequence: number
  start_date?: string
  end_date?: string
  budget_amount?: string
  created_at: string
  updated_at: string
}

export interface ProjectCreate {
  name: string
  code: string
  description?: string
  client?: string
  start_date?: string
  end_date?: string
  budget_amount?: string
}

export interface ProjectUpdate {
  name?: string
  code?: string
  description?: string
  client?: string
  status?: ProjectStatus
  start_date?: string
  end_date?: string
  budget_amount?: string
}

export interface PhaseCreate {
  name: string
  description?: string
  sequence: number
  start_date?: string
  end_date?: string
  budget_amount?: string
}

export interface PhaseUpdate {
  name?: string
  description?: string
  sequence?: number
  start_date?: string
  end_date?: string
  budget_amount?: string
}

export interface ProjectSummary {
  project_id: string
  project_name: string
  total_budget: string
  total_actual: string
  total_orders: string
  total_prospect: string
  variance: string
  completion_percentage: number
}
