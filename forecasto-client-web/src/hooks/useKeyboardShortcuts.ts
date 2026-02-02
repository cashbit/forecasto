import { useEffect } from 'react'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useUiStore } from '@/stores/uiStore'

export function useKeyboardShortcuts() {
  const { undo, redo, canUndo, canRedo } = useSessionStore()
  const { currentWorkspaceId } = useWorkspaceStore()
  const { setCommitDialogOpen, setRightPanelOpen, closeAllDialogs } = useUiStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey

      // Cmd/Ctrl + Z = Undo
      if (isMod && e.key === 'z' && !e.shiftKey && canUndo && currentWorkspaceId) {
        e.preventDefault()
        undo(currentWorkspaceId)
      }

      // Cmd/Ctrl + Shift + Z = Redo
      if (isMod && e.key === 'z' && e.shiftKey && canRedo && currentWorkspaceId) {
        e.preventDefault()
        redo(currentWorkspaceId)
      }

      // Cmd/Ctrl + S = Commit dialog
      if (isMod && e.key === 's') {
        e.preventDefault()
        setCommitDialogOpen(true)
      }

      // Escape = Close panels/dialogs
      if (e.key === 'Escape') {
        closeAllDialogs()
        setRightPanelOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, canUndo, canRedo, currentWorkspaceId, setCommitDialogOpen, closeAllDialogs, setRightPanelOpen])
}
