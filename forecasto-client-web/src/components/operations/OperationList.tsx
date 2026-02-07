import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash, Trash2, ArrowRight, RotateCcw, History } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
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
import { EmptyState } from '@/components/common/EmptyState'
import { DateDisplay } from '@/components/common/DateDisplay'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { useHistoryStore, type HistoryEntry } from '@/stores/historyStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

const operationIcons: Record<string, typeof Plus> = {
  create: Plus,
  update: Pencil,
  delete: Trash,
  transfer: ArrowRight,
  restore: RotateCcw,
  rollback: RotateCcw,
}

const operationColors: Record<string, string> = {
  create: 'text-income',
  update: 'text-yellow-500',
  delete: 'text-expense',
  transfer: 'text-blue-500',
  restore: 'text-purple-500',
  rollback: 'text-orange-500',
}

const operationLabels: Record<string, string> = {
  create: 'Creato',
  update: 'Modificato',
  delete: 'Eliminato',
  transfer: 'Trasferito',
  restore: 'Ripristinato',
  rollback: 'Rollback',
}

interface HistoryItemProps {
  entry: HistoryEntry
  onRollback: (versionId: string) => void
  isRollingBack: boolean
  showRollback: boolean
}

function HistoryItem({ entry, onRollback, isRollingBack, showRollback }: HistoryItemProps) {
  const opType = entry.change_type
  const Icon = operationIcons[opType] || Pencil
  const color = operationColors[opType] || 'text-muted-foreground'
  const label = operationLabels[opType] || opType

  const reference = String(entry.snapshot?.reference || entry.snapshot?.account || '')

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 group">
      <div className={cn('p-2 rounded-full bg-muted', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {label} record
        </p>
        {reference && (
          <p className="text-xs text-muted-foreground truncate">{reference}</p>
        )}
        {entry.change_note && (
          <p className="text-xs text-muted-foreground italic">{entry.change_note}</p>
        )}
        <DateDisplay date={entry.changed_at} format="datetime" className="text-xs" />
      </div>
      {showRollback && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            console.log('[History] Rollback clicked for entry:', entry.id, entry.change_type)
            onRollback(entry.id)
          }}
          disabled={isRollingBack}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title="Torna a questo punto"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

export function OperationList() {
  const { history, isLoading, fetchHistory, rollbackToVersion, deleteHistory } = useHistoryStore()
  const { selectedWorkspaceIds } = useWorkspaceStore()
  const queryClient = useQueryClient()
  const [rollbackTargetId, setRollbackTargetId] = useState<string | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  useEffect(() => {
    // Fetch history for all selected workspaces
    selectedWorkspaceIds.forEach(id => fetchHistory(id))
  }, [selectedWorkspaceIds, fetchHistory])

  const handleClearHistory = async () => {
    const primaryWorkspaceId = selectedWorkspaceIds[0]
    if (!primaryWorkspaceId) return

    try {
      await deleteHistory(primaryWorkspaceId)
      toast({ title: 'Cronologia cancellata', variant: 'success' })
    } catch {
      toast({ title: 'Errore durante la cancellazione', variant: 'destructive' })
    } finally {
      setShowClearConfirm(false)
    }
  }

  const handleRollbackRequest = (versionId: string) => {
    setRollbackTargetId(versionId)
  }

  const handleRollbackConfirm = async () => {
    if (!rollbackTargetId) return

    const primaryWorkspaceId = selectedWorkspaceIds[0]
    if (!primaryWorkspaceId) {
      console.error('[History] No workspace selected for rollback')
      return
    }

    console.log('[History] Confirming rollback:', { workspaceId: primaryWorkspaceId, versionId: rollbackTargetId })

    try {
      await rollbackToVersion(primaryWorkspaceId, rollbackTargetId)
      console.log('[History] Rollback successful')
      selectedWorkspaceIds.forEach(id => {
        queryClient.invalidateQueries({ queryKey: ['records', id] })
      })
      toast({ title: 'Rollback completato', variant: 'success' })
    } catch (error) {
      console.error('[History] Rollback failed:', error)
      toast({ title: 'Errore durante il rollback', variant: 'destructive' })
    } finally {
      setRollbackTargetId(null)
    }
  }

  if (isLoading && history.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Cronologia Operazioni</h3>
          <p className="text-sm text-muted-foreground">{history.length} operazioni</p>
        </div>
        {history.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowClearConfirm(true)}
            disabled={isLoading}
            className="text-muted-foreground hover:text-destructive"
            title="Pulisci cronologia"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {history.length === 0 ? (
            <EmptyState
              icon={History}
              title="Nessuna operazione"
              description="La cronologia delle operazioni apparirà qui"
              className="py-8"
            />
          ) : (
            history.map((entry, index) => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                onRollback={handleRollbackRequest}
                isRollingBack={isLoading}
                showRollback={index > 0}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pulisci cronologia</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler cancellare tutta la cronologia? Questa azione è irreversibile e non sarà più possibile effettuare rollback.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearHistory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancella tutto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rollbackTargetId !== null} onOpenChange={(open) => { if (!open) setRollbackTargetId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma rollback</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler tornare a questo punto? Tutte le modifiche successive verranno annullate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleRollbackConfirm}>
              Conferma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
