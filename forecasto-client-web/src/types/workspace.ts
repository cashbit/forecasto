export interface Workspace {
  id: string
  name: string
  description?: string
  owner_id: string
  settings: WorkspaceSettings
  created_at: string
  updated_at: string
}

export interface WorkspaceSettings {
  currency: string
  timezone: string
  fiscal_year_start_month: number
}

export interface WorkspaceCreate {
  name: string
  description?: string
  settings?: Partial<WorkspaceSettings>
}

export interface WorkspaceUpdate {
  name?: string
  description?: string
  settings?: Partial<WorkspaceSettings>
}

export interface WorkspaceMember {
  id: string
  user_id: string
  workspace_id: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  user: {
    id: string
    email: string
    name: string
  }
  joined_at: string
}
