import { useState } from 'react'
import { Building2, Plus, Trash, Merge, CheckSquare, Square, Copy, Crown, ShieldCheck } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/useToast'

export function Sidebar() {
  const { sidebarOpen, setCreateWorkspaceDialogOpen } = useUiStore()
  const {
    workspaces,
    selectedWorkspaceIds,
    toggleWorkspaceSelection,
    setSelectedWorkspaces,
    selectAllWorkspaces,
    deselectAllWorkspaces,
    deleteWorkspace,
    duplicateWorkspace,
    mergeWorkspaces
  } = useWorkspaceStore()

  // Select only this workspace (deselect all others)
  const selectSingleWorkspace = (workspaceId: string) => {
    setSelectedWorkspaces([workspaceId])
  }

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [mergeTargetName, setMergeTargetName] = useState('')
  const [duplicateName, setDuplicateName] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isMerging, setIsMerging] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [workspacesToDelete, setWorkspacesToDelete] = useState<string[]>([])

  const handleDeleteClick = () => {
    if (selectedWorkspaceIds.length === 0) {
      toast({ title: 'Seleziona almeno un workspace da eliminare', variant: 'destructive' })
      return
    }
    if (selectedWorkspaceIds.length === workspaces.length) {
      toast({ title: 'Non puoi eliminare tutti i workspace', variant: 'destructive' })
      return
    }
    // Check ownership on all selected workspaces
    const notOwned = workspaces.filter(w => selectedWorkspaceIds.includes(w.id) && w.role !== 'owner')
    if (notOwned.length > 0) {
      toast({
        title: 'Permesso negato',
        description: `Solo il proprietario può eliminare un workspace. Non sei owner di: ${notOwned.map(w => w.name).join(', ')}`,
        variant: 'destructive',
      })
      return
    }
    setWorkspacesToDelete(selectedWorkspaceIds)
    setShowDeleteDialog(true)
  }

  const handleDeleteConfirm = async () => {
    if (workspacesToDelete.length === 0) return

    setIsDeleting(true)
    try {
      for (const id of workspacesToDelete) {
        await deleteWorkspace(id)
      }
      toast({ title: workspacesToDelete.length === 1 ? 'Workspace eliminato' : 'Workspace eliminati', variant: 'success' })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto'
      toast({ title: 'Errore durante l\'eliminazione', description: errorMessage, variant: 'destructive' })
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
      setWorkspacesToDelete([])
    }
  }

  const handleMergeClick = () => {
    if (selectedWorkspaceIds.length < 2) {
      toast({ title: 'Seleziona almeno 2 workspace da unire', variant: 'destructive' })
      return
    }
    setMergeTargetName('')
    setShowMergeDialog(true)
  }

  const handleMergeConfirm = async () => {
    if (!mergeTargetName.trim()) {
      toast({ title: 'Inserisci un nome per il workspace', variant: 'destructive' })
      return
    }

    setIsMerging(true)
    try {
      await mergeWorkspaces(selectedWorkspaceIds, mergeTargetName.trim())
      toast({ title: 'Workspace uniti con successo', description: 'Tutti i record sono stati spostati nel nuovo workspace', variant: 'success' })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto'
      toast({ title: 'Errore durante l\'unione', description: errorMessage, variant: 'destructive' })
    } finally {
      setIsMerging(false)
      setShowMergeDialog(false)
    }
  }

  const handleDuplicateClick = () => {
    if (selectedWorkspaceIds.length !== 1) {
      toast({ title: 'Seleziona un solo workspace da duplicare', variant: 'destructive' })
      return
    }
    const ws = workspaces.find(w => w.id === selectedWorkspaceIds[0])
    setDuplicateName(ws ? `${ws.name} (copia)` : '')
    setShowDuplicateDialog(true)
  }

  const handleDuplicateConfirm = async () => {
    if (!duplicateName.trim()) {
      toast({ title: 'Inserisci un nome per il workspace', variant: 'destructive' })
      return
    }

    setIsDuplicating(true)
    try {
      await duplicateWorkspace(selectedWorkspaceIds[0], duplicateName.trim())
      toast({ title: 'Workspace duplicato con successo', description: 'Tutti i record sono stati copiati nel nuovo workspace', variant: 'success' })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto'
      toast({ title: 'Errore durante la duplicazione', description: errorMessage, variant: 'destructive' })
    } finally {
      setIsDuplicating(false)
      setShowDuplicateDialog(false)
    }
  }

  const allSelected = selectedWorkspaceIds.length === workspaces.length
  const someSelected = selectedWorkspaceIds.length > 0 && selectedWorkspaceIds.length < workspaces.length

  const selectedWorkspaceNames = workspaces
    .filter(w => selectedWorkspaceIds.includes(w.id))
    .map(w => w.name)

  const workspacesToDeleteNames = workspaces
    .filter(w => workspacesToDelete.includes(w.id))
    .map(w => w.name)

  return (
    <>
      <aside
        className={cn(
          'h-full w-64 border-r bg-background transition-all duration-300 flex-shrink-0',
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden border-r-0'
        )}
      >
        <div className="flex h-full flex-col w-64">
          <div className="p-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Workspace
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedWorkspaceIds.length} di {workspaces.length} selezionati
            </p>
          </div>

          {/* Actions Bar */}
          <div className="px-4 pb-3 flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setCreateWorkspaceDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Nuovo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteClick}
              disabled={selectedWorkspaceIds.length === 0 || selectedWorkspaceIds.length === workspaces.length}
              className={cn(selectedWorkspaceIds.length > 0 && selectedWorkspaceIds.length < workspaces.length && "text-destructive hover:text-destructive")}
              title="Elimina workspace selezionati"
            >
              <Trash className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleMergeClick}
              disabled={selectedWorkspaceIds.length < 2}
              title="Unisci workspace selezionati"
            >
              <Merge className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDuplicateClick}
              disabled={selectedWorkspaceIds.length !== 1}
              title="Duplica workspace selezionato"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <Separator />

          {/* Select All / Deselect All */}
          {workspaces.length > 1 && (
            <div className="px-4 py-2 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={allSelected ? deselectAllWorkspaces : selectAllWorkspaces}
                className="h-7 px-2 text-xs"
              >
                {allSelected ? (
                  <>
                    <Square className="h-3 w-3 mr-1" />
                    Deseleziona tutti
                  </>
                ) : (
                  <>
                    <CheckSquare className="h-3 w-3 mr-1" />
                    Seleziona tutti
                  </>
                )}
              </Button>
            </div>
          )}

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {workspaces.map((ws) => {
                const isSelected = selectedWorkspaceIds.includes(ws.id)
                return (
                  <div
                    key={ws.id}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/50',
                      isSelected && 'bg-primary/10 border border-primary/30'
                    )}
                    onClick={() => selectSingleWorkspace(ws.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleWorkspaceSelection(ws.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className={cn(
                          'text-sm truncate',
                          isSelected && 'font-medium'
                        )}>
                          {ws.name}
                        </p>
                        {ws.role === 'owner' && <Crown className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                        {ws.role === 'admin' && <ShieldCheck className="h-3 w-3 text-blue-500 flex-shrink-0" />}
                      </div>
                    </div>
                  </div>
                )
              })}

              {workspaces.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nessun workspace</p>
                  <p className="text-xs">Crea il tuo primo workspace</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </aside>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina workspace</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare {workspacesToDelete.length === 1 ? 'il workspace' : `${workspacesToDelete.length} workspace`}?
              {workspacesToDelete.length <= 3 && (
                <span className="block mt-2 font-medium text-foreground">
                  {workspacesToDeleteNames.join(', ')}
                </span>
              )}
              <span className="block mt-2 text-destructive">
                Questa azione non può essere annullata. Tutti i record associati verranno eliminati.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Eliminazione...' : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Merge Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unisci workspace</DialogTitle>
            <DialogDescription>
              Unisci {selectedWorkspaceIds.length} workspace in uno nuovo. I record di tutti i workspace selezionati verranno spostati nel nuovo workspace.
              {selectedWorkspaceIds.length <= 3 && (
                <span className="block mt-2 font-medium text-foreground">
                  {selectedWorkspaceNames.join(', ')}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="merge-name">Nome del nuovo workspace</Label>
            <Input
              id="merge-name"
              value={mergeTargetName}
              onChange={(e) => setMergeTargetName(e.target.value)}
              placeholder="Es: Workspace Unificato"
              className="mt-2"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMergeDialog(false)} disabled={isMerging}>
              Annulla
            </Button>
            <Button onClick={handleMergeConfirm} disabled={isMerging || !mergeTargetName.trim()}>
              {isMerging ? 'Unione in corso...' : 'Unisci'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplica workspace</DialogTitle>
            <DialogDescription>
              Crea una copia del workspace selezionato con tutti i suoi record.
              {selectedWorkspaceIds.length === 1 && (
                <span className="block mt-2 font-medium text-foreground">
                  {selectedWorkspaceNames[0]}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="duplicate-name">Nome del nuovo workspace</Label>
            <Input
              id="duplicate-name"
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder="Es: Workspace Copia"
              className="mt-2"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDuplicateDialog(false)} disabled={isDuplicating}>
              Annulla
            </Button>
            <Button onClick={handleDuplicateConfirm} disabled={isDuplicating || !duplicateName.trim()}>
              {isDuplicating ? 'Duplicazione in corso...' : 'Duplica'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  )
}
