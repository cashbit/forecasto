import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

import { CreateWorkspaceDialog } from '@/components/workspaces/CreateWorkspaceDialog'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

export function MainLayout() {
  const { fetchWorkspaces } = useWorkspaceStore()

  useKeyboardShortcuts()

  useEffect(() => {
    fetchWorkspaces()
  }, [fetchWorkspaces])

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      {/* Dialogs */}
      <CreateWorkspaceDialog />
    </div>
  )
}
