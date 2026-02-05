import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatMessage } from './ChatMessage'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ChatMessage as ChatMessageType } from '@/types/chat'

interface ChatAreaProps {
  messages: ChatMessageType[]
  onSendMessage: (content: string) => void
  isLoading?: boolean
}

export function ChatArea({ messages, onSendMessage, isLoading }: ChatAreaProps) {
  const { selectedWorkspaceIds } = useWorkspaceStore()
  const [input, setInput] = useState('')

  const handleSend = () => {
    if (!input.trim()) return
    onSendMessage(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (selectedWorkspaceIds.length === 0) return null

  return (
    <div className="border-t bg-muted/30">
      <ScrollArea className="h-48 p-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Scrivi un messaggio per interagire con l'assistente
            </p>
          )}
        </div>
      </ScrollArea>
      <div className="p-4 pt-0 flex gap-2">
        <Textarea
          placeholder="Scrivi un messaggio..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[60px] resize-none"
          disabled={isLoading}
        />
        <Button onClick={handleSend} disabled={!input.trim() || isLoading} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
