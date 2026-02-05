import { useEffect } from 'react'
import { useUiStore } from '@/stores/uiStore'

export function useKeyboardShortcuts() {
  const { setRightPanelOpen, closeAllDialogs } = useUiStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape = Close panels/dialogs
      if (e.key === 'Escape') {
        closeAllDialogs()
        setRightPanelOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeAllDialogs, setRightPanelOpen])
}
