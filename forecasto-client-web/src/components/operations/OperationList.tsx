import { Plus, Pencil, Trash, ArrowRight, Undo, Redo } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/common/EmptyState'
import { DateDisplay } from '@/components/common/DateDisplay'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { Operation } from '@/types/session'
import { cn } from '@/lib/utils'
import { History } from 'lucide-react'

const operationIcons = {
  create: Plus,
  update: Pencil,
  delete: Trash,
  transfer: ArrowRight,
}

const operationColors = {
  create: 'text-income',
  update: 'text-yellow-500',
  delete: 'text-expense',
  transfer: 'text-blue-500',
}

const operationLabels = {
  create: 'Creato',
  update: 'Modificato',
  delete: 'Eliminato',
  transfer: 'Trasferito',
}

interface OperationItemProps {
  operation: Operation
}

function OperationItem({ operation }: OperationItemProps) {
  const Icon = operationIcons[operation.type]
  const color = operationColors[operation.type]
  const label = operationLabels[operation.type]

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50',
        operation.is_undone && 'opacity-50'
      )}
    >
      <div className={cn('p-2 rounded-full bg-muted', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {label} {operation.entity_type}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          ID: {operation.entity_id.slice(0, 8)}...
        </p>
        <DateDisplay date={operation.created_at} format="datetime" className="text-xs" />
      </div>
    </div>
  )
}

export function OperationList() {
  const { operations, canUndo, canRedo, undo, redo } = useSessionStore()
  const { currentWorkspaceId } = useWorkspaceStore()

  const handleUndo = () => {
    if (currentWorkspaceId) undo(currentWorkspaceId)
  }

  const handleRedo = () => {
    if (currentWorkspaceId) redo(currentWorkspaceId)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4">
        <h3 className="font-semibold">Operazioni Sessione</h3>
        <p className="text-sm text-muted-foreground">{operations.length} operazioni</p>
      </div>

      <div className="flex gap-2 px-4 pb-4">
        <Button onClick={handleUndo} disabled={!canUndo} variant="outline" size="sm" className="flex-1">
          <Undo className="mr-2 h-4 w-4" />
          Annulla
        </Button>
        <Button onClick={handleRedo} disabled={!canRedo} variant="outline" size="sm" className="flex-1">
          <Redo className="mr-2 h-4 w-4" />
          Ripeti
        </Button>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {operations.length === 0 ? (
            <EmptyState
              icon={History}
              title="Nessuna operazione"
              description="Le operazioni eseguite in questa sessione appariranno qui"
              className="py-8"
            />
          ) : (
            operations
              .slice()
              .reverse()
              .map((op) => <OperationItem key={op.id} operation={op} />)
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
