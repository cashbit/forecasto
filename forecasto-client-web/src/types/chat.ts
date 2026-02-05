export interface ChatMessage {
  id: string
  workspace_id?: string
  role: 'user' | 'assistant'
  content: string
  metadata?: {
    operations?: string[]
    suggestions?: string[]
  }
  created_at: string
}
