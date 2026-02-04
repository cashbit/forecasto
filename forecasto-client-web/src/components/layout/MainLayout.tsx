import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { Footer } from './Footer'
import { CreateSessionDialog } from '@/components/sessions/CreateSessionDialog'
import { CreateWorkspaceDialog } from '@/components/workspaces/CreateWorkspaceDialog'
import { CommitDialog } from '@/components/sessions/CommitDialog'
import { DiscardDialog } from '@/components/sessions/DiscardDialog'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

export function MainLayout() {
  const { currentWorkspaceId, fetchWorkspaces } = useWorkspaceStore()
  const { fetchSessions } = useSessionStore()

  useKeyboardShortcuts()

  useEffect(() => {
    fetchWorkspaces()
  }, [fetchWorkspaces])

  useEffect(() => {
    if (currentWorkspaceId) {
      fetchSessions(currentWorkspaceId)
    }
  }, [currentWorkspaceId, fetchSessions])

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <Footer />

      {/* Dialogs */}
      <CreateSessionDialog />
      <CreateWorkspaceDialog />
      <CommitDialog />
      <DiscardDialog />
    </div>
  )
}
