export interface Session {
  id: string
  workspace_id: string
  user_id: string
  title: string
  status: SessionStatus
  operations_count: number
  created_at: string
  updated_at: string
  committed_at?: string
  discarded_at?: string
}

export type SessionStatus = 'active' | 'committed' | 'discarded'

export interface SessionCreate {
  title: string
}

export interface SessionCommit {
  message: string
}

export interface Operation {
  id: string
  sequence: number
  operation_type: OperationType
  record_id: string
  area: string
  before_snapshot?: Record<string, unknown>
  after_snapshot: Record<string, unknown>
  from_area?: string
  to_area?: string
  is_undone: boolean
  created_at: string
}

export type OperationType = 'create' | 'update' | 'delete' | 'transfer'

export interface ChatMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  metadata?: {
    operations?: string[]
    suggestions?: string[]
  }
  created_at: string
}
