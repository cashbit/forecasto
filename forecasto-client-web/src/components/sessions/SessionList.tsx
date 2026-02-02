import { SessionCard } from './SessionCard'
import { EmptyState } from '@/components/common/EmptyState'
import { useSessionStore } from '@/stores/sessionStore'
import { FolderOpen } from 'lucide-react'

export function SessionList() {
  const { sessions, activeSessionId, setActiveSession } = useSessionStore()

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="Nessuna sessione"
        description="Crea una nuova sessione per iniziare a modificare i dati"
        className="py-8"
      />
    )
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          onClick={() => setActiveSession(session.id === activeSessionId ? null : session.id)}
        />
      ))}
    </div>
  )
}
