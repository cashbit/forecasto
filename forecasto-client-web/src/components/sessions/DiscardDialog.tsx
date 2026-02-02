import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useUiStore } from '@/stores/uiStore'

export function DiscardDialog() {
  const { discardDialogOpen, setDiscardDialogOpen } = useUiStore()
  const { activeSession, operations, discardSession } = useSessionStore()
  const { currentWorkspaceId } = useWorkspaceStore()
  const [isLoading, setIsLoading] = useState(false)

  const handleDiscard = async () => {
    if (!currentWorkspaceId) return

    setIsLoading(true)
    try {
      await discardSession(currentWorkspaceId)
      setDiscardDialogOpen(false)
    } catch (error) {
      console.error('Failed to discard session:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Annulla Sessione
          </DialogTitle>
          <DialogDescription>
            Stai per annullare la sessione "{activeSession?.title}" con {operations.length} operazioni.
            Tutte le modifiche non salvate andranno perse. Questa azione e irreversibile.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDiscardDialogOpen(false)}>
            Mantieni Sessione
          </Button>
          <Button variant="destructive" onClick={handleDiscard} disabled={isLoading}>
            {isLoading ? 'Annullamento...' : 'Annulla Sessione'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
