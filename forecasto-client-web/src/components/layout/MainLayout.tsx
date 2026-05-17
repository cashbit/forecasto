import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

import { CreateWorkspaceDialog } from '@/components/workspaces/CreateWorkspaceDialog'
import { NewRecordSheet } from '@/components/records/NewRecordSheet'
import { TourProvider } from '@/components/tour/TourProvider'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useTourStore } from '@/stores/tourStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

export function MainLayout() {
  const { fetchWorkspaces, selectedWorkspaceIds, workspaces } = useWorkspaceStore()
  const { hasSeenTour, startTour } = useTourStore()

  useKeyboardShortcuts()

  useEffect(() => {
    fetchWorkspaces()
  }, [fetchWorkspaces])

  useEffect(() => {
    let suffix = ''
    if (selectedWorkspaceIds.length === 1) {
      suffix = workspaces.find(w => w.id === selectedWorkspaceIds[0])?.name ?? ''
    } else if (selectedWorkspaceIds.length > 1) {
      suffix = `${selectedWorkspaceIds.length} workspace`
    }
    document.title = suffix ? `Forecasto - ${suffix}` : 'Forecasto'
  }, [selectedWorkspaceIds, workspaces])

  // Auto-start tour on first login when workspace is selected
  useEffect(() => {
    if (!hasSeenTour && selectedWorkspaceIds.length > 0) {
      const timer = setTimeout(() => {
        // Only start if still not seen (user might have clicked ? manually)
        if (!useTourStore.getState().hasSeenTour && !useTourStore.getState().tourActive) {
          // We can't call startTour from the store directly since it doesn't
          // have the full context. Instead we'll rely on the ? button.
          // Auto-start is handled by TourProvider itself.
        }
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [hasSeenTour, selectedWorkspaceIds])

  return (
    <TourProvider>
      <div className="h-screen flex flex-col overflow-hidden">
        <Header />
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main className="flex-1 min-h-0 overflow-auto">
            <Outlet />
          </main>
        </div>
        {/* Dialogs */}
        <CreateWorkspaceDialog />
        <NewRecordSheet />
      </div>
    </TourProvider>
  )
}
