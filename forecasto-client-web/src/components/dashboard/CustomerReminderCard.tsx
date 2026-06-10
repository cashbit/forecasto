import { useState } from 'react'
import { MoreVertical, Send, Undo2, Loader2, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { formatCurrency, formatDate, recordAmount } from '@/lib/formatters'
import { buildReminderMailto, reminderActionFromCount, type EmailProvider } from '@/lib/reminder-mailto'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { Record } from '@/types/record'

interface CustomerReminderCardProps {
  reference: string
  records: Record[]
  signature?: string
  provider?: EmailProvider
  showOverdueBadge?: boolean
  showCountBadge?: boolean
  onSend: (recordIds: string[]) => Promise<void>
  onUndo: (recordIds: string[]) => Promise<void>
  onRecordClick?: (record: Record) => void
  busy?: boolean
}

export function CustomerReminderCard({
  reference,
  records,
  signature,
  provider,
  showOverdueBadge,
  showCountBadge,
  onSend,
  onUndo,
  onRecordClick,
  busy,
}: CustomerReminderCardProps) {
  const [sending, setSending] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const disabled = Boolean(busy) || sending || undoing

  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const selectedWorkspaceIds = useWorkspaceStore((s) => s.selectedWorkspaceIds)
  const showWorkspace = selectedWorkspaceIds.length > 1
  const workspaceNameById = (id: string) =>
    showWorkspace ? workspaces.find((w) => w.id === id)?.name : undefined

  const includeVat = useUiStore((s) => s.vatMode) === 'gross'
  const total = records.reduce((sum, r) => sum + recordAmount(r, includeVat), 0)

  // Tutti i record del gruppo condividono lo stesso reminder_count (sono nella stessa colonna)
  const currentCount = records[0]?.reminder_count ?? -1
  const action = reminderActionFromCount(currentCount)
  const nextStepLabel =
    action.kind === 'promemoria' ? 'Invia promemoria' : `Invia ${action.number}° sollecito`

  const today = new Date().toISOString().slice(0, 10)

  const handleSend = async () => {
    if (disabled) return
    setSending(true)
    try {
      const mailto = buildReminderMailto({
        reference,
        records,
        action,
        signature,
        provider,
      })
      window.open(mailto, '_blank')
      await onSend(records.map((r) => r.id))
    } finally {
      setSending(false)
    }
  }

  const handleUndo = async () => {
    if (disabled) return
    setUndoing(true)
    try {
      await onUndo(records.map((r) => r.id))
    } finally {
      setUndoing(false)
    }
  }

  const canUndo = currentCount >= 0

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/30 px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="truncate text-sm font-semibold" title={reference || '(senza riferimento)'}>
                {reference || '(senza riferimento)'}
              </h4>
              {showCountBadge && currentCount >= 2 && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {currentCount + 1}°
                </Badge>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>
                {records.length} {records.length === 1 ? 'riga' : 'righe'}
              </span>
              <span>·</span>
              <span className="font-medium tabular-nums text-foreground">{formatCurrency(total)}</span>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleUndo} disabled={!canUndo || disabled}>
                <Undo2 className="mr-2 h-4 w-4" />
                Annulla ultimo invio
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ul className="divide-y">
        {records
          .slice()
          .sort((a, b) => a.date_cashflow.localeCompare(b.date_cashflow))
          .map((r) => {
            const isOverdue = r.date_cashflow < today
            const wsName = workspaceNameById(r.workspace_id)
            return (
              <li
                key={r.id}
                className="cursor-pointer px-3 py-2 text-xs hover:bg-muted/50"
                onClick={() => onRecordClick?.(r)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">{formatDate(r.date_cashflow)}</span>
                      {showOverdueBadge && isOverdue && (
                        <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          In ritardo
                        </span>
                      )}
                      {wsName && (
                        <Badge
                          variant="secondary"
                          className="h-4 max-w-[110px] truncate px-1 text-[10px] font-normal"
                          title={wsName}
                        >
                          {wsName}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 truncate">{r.account || '-'}</div>
                  </div>
                  <span className="whitespace-nowrap font-medium tabular-nums">
                    {formatCurrency(recordAmount(r, includeVat))}
                  </span>
                </div>
              </li>
            )
          })}
      </ul>
      <div className="border-t bg-muted/20 p-2">
        <Button
          size="sm"
          className="w-full"
          onClick={handleSend}
          disabled={disabled}
        >
          {sending || (busy && !undoing) ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Invio in corso
            </>
          ) : (
            <>
              <Send className="mr-2 h-3.5 w-3.5" />
              {nextStepLabel}
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}
