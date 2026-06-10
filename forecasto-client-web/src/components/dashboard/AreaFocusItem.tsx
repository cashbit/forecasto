import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, recordAmount } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { Record } from '@/types/record'

interface AreaFocusItemProps {
  record: Record
  onClick: () => void
}

function daysToCashflow(date: string | undefined | null): number | null {
  if (!date) return null
  try {
    const parsed = parseISO(date)
    if (isNaN(parsed.getTime())) return null
    return differenceInCalendarDays(parsed, new Date())
  } catch {
    return null
  }
}

function daysLabel(days: number): string {
  if (days === 0) return 'Oggi'
  if (days === 1) return 'Domani'
  if (days === -1) return 'Ieri'
  if (days < 0) return `${Math.abs(days)} gg fa`
  return `tra ${days} gg`
}

export function AreaFocusItem({ record, onClick }: AreaFocusItemProps) {
  const days = daysToCashflow(record.date_cashflow)
  const vatMode = useUiStore((s) => s.vatMode)
  const amount = recordAmount(record, vatMode === 'gross')
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const selectedWorkspaceIds = useWorkspaceStore((s) => s.selectedWorkspaceIds)
  const showWorkspace = selectedWorkspaceIds.length > 1
  const workspaceName = showWorkspace
    ? workspaces.find((w) => w.id === record.workspace_id)?.name
    : undefined

  const daysTone =
    days === null
      ? 'text-muted-foreground'
      : days < 0
      ? 'text-red-600 dark:text-red-400'
      : days <= 7
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-muted-foreground'

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md border bg-background p-2.5 text-left text-xs shadow-sm transition-colors hover:bg-muted/60"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold" title={record.reference || '(senza riferimento)'}>
            {record.reference || '(senza riferimento)'}
          </div>
          {record.transaction_id && (
            <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={record.transaction_id}>
              {record.transaction_id}
            </div>
          )}
        </div>
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
          {formatCurrency(amount)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={cn('text-[11px] font-medium', daysTone)}>
          {days === null ? '—' : daysLabel(days)}
        </span>
        <div className="flex items-center gap-1.5">
          {workspaceName && (
            <Badge
              variant="secondary"
              className="h-5 max-w-[120px] truncate px-1.5 text-[10px] font-normal"
              title={workspaceName}
            >
              {workspaceName}
            </Badge>
          )}
          {record.owner && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
              {record.owner}
            </Badge>
          )}
        </div>
      </div>

      {record.nextaction && (
        <div className="mt-1.5 line-clamp-2 text-[11px] italic text-amber-600 dark:text-amber-400">
          {record.nextaction}
        </div>
      )}
    </button>
  )
}
