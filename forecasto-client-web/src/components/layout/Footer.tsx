import { Undo, Redo, Save, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useUiStore } from '@/stores/uiStore'

export function Footer() {
  const { activeSession, operations, canUndo, canRedo, undo, redo } = useSessionStore()
  const { currentWorkspaceId } = useWorkspaceStore()
  const { setCommitDialogOpen, setDiscardDialogOpen } = useUiStore()

  const handleUndo = () => {
    if (currentWorkspaceId && canUndo) {
      undo(currentWorkspaceId)
    }
  }

  const handleRedo = () => {
    if (currentWorkspaceId && canRedo) {
      redo(currentWorkspaceId)
    }
  }

  return (
    <TooltipProvider>
      <footer className="sticky bottom-0 z-50 w-full border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-12 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            {activeSession ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-income animate-pulse" />
                  <span className="text-sm font-medium">{activeSession.title}</span>
                </div>
                <Badge variant="secondary">{operations.length} operazioni</Badge>
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">Nessuna sessione attiva - crea una sessione per modificare i dati</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUndo}
                  disabled={!activeSession || !canUndo}
                >
                  <Undo className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Annulla (Cmd+Z)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRedo}
                  disabled={!activeSession || !canRedo}
                >
                  <Redo className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ripeti (Cmd+Shift+Z)</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6" />

            <Button
              variant="outline"
              size="sm"
              onClick={() => setDiscardDialogOpen(true)}
              disabled={!activeSession}
            >
              <X className="h-4 w-4 mr-1" />
              Annulla Sessione
            </Button>

            <Button
              size="sm"
              onClick={() => setCommitDialogOpen(true)}
              disabled={!activeSession || operations.length === 0}
            >
              <Save className="h-4 w-4 mr-1" />
              Salva Modifiche
            </Button>
          </div>
        </div>
      </footer>
    </TooltipProvider>
  )
}
