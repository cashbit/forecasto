import { useEffect } from 'react'
import { Plus, Pencil, Trash, ArrowRight, RotateCcw, History } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
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
}

function HistoryItem({ entry, onRollback, isRollingBack }: HistoryItemProps) {
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
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRollback(entry.id)}
        disabled={isRollingBack}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        title="Torna a questo punto"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  )
}

export function OperationList() {
  const { history, isLoading, fetchHistory, rollbackToVersion } = useHistoryStore()
  const { selectedWorkspaceIds } = useWorkspaceStore()
  const queryClient = useQueryClient()

  useEffect(() => {
    // Fetch history for all selected workspaces
    selectedWorkspaceIds.forEach(id => fetchHistory(id))
  }, [selectedWorkspaceIds, fetchHistory])

  const handleRollback = async (versionId: string) => {
    // Note: rollback only works for the primary workspace for now
    const primaryWorkspaceId = selectedWorkspaceIds[0]
    if (!primaryWorkspaceId) return

    const confirmed = window.confirm(
      'Sei sicuro di voler tornare a questo punto? Tutte le modifiche successive verranno annullate.'
    )
    if (!confirmed) return

    try {
      await rollbackToVersion(primaryWorkspaceId, versionId)
      selectedWorkspaceIds.forEach(id => {
        queryClient.invalidateQueries({ queryKey: ['records', id] })
      })
      toast({ title: 'Rollback completato', variant: 'success' })
    } catch (error) {
      toast({ title: 'Errore durante il rollback', variant: 'destructive' })
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
      <div className="p-4">
        <h3 className="font-semibold">Cronologia Operazioni</h3>
        <p className="text-sm text-muted-foreground">{history.length} operazioni</p>
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
            history.map((entry) => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                onRollback={handleRollback}
                isRollingBack={isLoading}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
