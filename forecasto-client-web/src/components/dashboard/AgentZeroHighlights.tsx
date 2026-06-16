import { useMemo, useState } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { Bot, ChevronDown, ChevronRight, RefreshCw, BellRing, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/useToast'
import { agentZeroApi, type AgentZeroItem } from '@/api/agentZero'
import { recordsApi } from '@/api/records'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { Record } from '@/types/record'

const OPEN_STORAGE_KEY = 'forecasto-agentzero-open'

function readOpen(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(OPEN_STORAGE_KEY) !== '0'
}

/** Red if cashflow date is overdue, else yellow if review date is overdue. */
function toneFor(item: AgentZeroItem): string {
  const today = new Date().toISOString().slice(0, 10)
  if (item.date_cashflow && item.date_cashflow < today) {
    return 'text-red-600 dark:text-red-400'
  }
  if (item.review_date && item.review_date < today) {
    return 'text-amber-600 dark:text-amber-400'
  }
  return 'text-foreground'
}

interface AgentZeroHighlightsProps {
  onSelectRecord: (record: Record) => void
}

export function AgentZeroHighlights({ onSelectRecord }: AgentZeroHighlightsProps) {
  const selectedWorkspaceIds = useWorkspaceStore((s) => s.selectedWorkspaceIds)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const queryClient = useQueryClient()

  // Only the selected workspaces that opted into Agente-zero (settings switch).
  const enabledWorkspaceIds = useMemo(
    () =>
      selectedWorkspaceIds.filter(
        (id) => workspaces.find((w) => w.id === id)?.settings?.agent_zero_enabled,
      ),
    [selectedWorkspaceIds, workspaces],
  )
  const showWorkspace = enabledWorkspaceIds.length > 1

  const [open, setOpen] = useState<boolean>(readOpen)
  const [running, setRunning] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)

  const { items, lastAnalyzedAt, staleCount, isLoading } = useQueries({
    queries: enabledWorkspaceIds.map((wsId) => ({
      queryKey: ['agent-zero', wsId],
      queryFn: () => agentZeroApi.highlights(wsId),
      enabled: open && !!wsId,
      staleTime: 30000,
      refetchInterval: open ? 60000 : false,
    })),
    combine: (results) => ({
      items: results.flatMap((r) => r.data?.items ?? []),
      lastAnalyzedAt: results
        .map((r) => r.data?.last_analyzed_at)
        .filter(Boolean)
        .sort()
        .pop() as string | undefined,
      staleCount: results.reduce((sum, r) => sum + (r.data?.stale_count ?? 0), 0),
      isLoading: results.some((r) => r.isLoading),
    }),
  })

  const reminders = useMemo(() => items.filter((i) => i.kind === 'reminder'), [items])
  const criticalities = useMemo(() => items.filter((i) => i.kind === 'criticality'), [items])

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(OPEN_STORAGE_KEY, next ? '1' : '0')
      }
      return next
    })
  }

  const handleRun = async () => {
    if (running || enabledWorkspaceIds.length === 0) return
    setRunning(true)
    try {
      await Promise.all(enabledWorkspaceIds.map((wsId) => agentZeroApi.run(wsId)))
      await queryClient.invalidateQueries({ queryKey: ['agent-zero'] })
      toast({ title: 'Agente-zero', description: 'Analisi aggiornata.' })
    } catch {
      toast({
        title: 'Agente-zero',
        description: "Errore durante l'analisi. Riprova.",
        variant: 'destructive',
      })
    } finally {
      setRunning(false)
    }
  }

  const handleOpenRecord = async (item: AgentZeroItem) => {
    if (openingId) return
    setOpeningId(item.record_id)
    try {
      const record = await recordsApi.get(item.workspace_id, item.record_id)
      onSelectRecord(record)
    } catch {
      toast({
        title: 'Agente-zero',
        description: 'Impossibile aprire il record di origine.',
        variant: 'destructive',
      })
    } finally {
      setOpeningId(null)
    }
  }

  const workspaceName = (wsId: string) =>
    workspaces.find((w) => w.id === wsId)?.name ?? ''

  const lastLabel = lastAnalyzedAt
    ? new Date(lastAnalyzedAt).toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const renderItemButton = (item: AgentZeroItem, extra?: React.ReactNode) => (
    <button
      key={`${item.record_id}-${item.kind}-${item.text}`}
      type="button"
      onClick={() => handleOpenRecord(item)}
      disabled={openingId === item.record_id}
      className="block w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60 disabled:opacity-50"
      title={`${item.reference} — ${item.account}`}
    >
      <span className={cn('line-clamp-2', toneFor(item))}>{item.text}</span>
      <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="truncate">{item.reference || item.account}</span>
        {item.owner && (
          <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">
            {item.owner}
          </Badge>
        )}
        {extra}
        {showWorkspace && (
          <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal">
            {workspaceName(item.workspace_id)}
          </Badge>
        )}
      </span>
    </button>
  )

  const empty = !isLoading && items.length === 0

  // Hidden entirely unless at least one selected workspace opted in.
  if (enabledWorkspaceIds.length === 0) return null

  return (
    <div className="mb-3 flex-shrink-0 rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={toggleOpen}
          className="flex min-w-0 items-center gap-2 text-sm font-medium"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Bot className="h-4 w-4 text-primary" />
          Agente-zero
          {!open && items.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {items.length}
            </Badge>
          )}
        </button>
        <div className="flex items-center gap-2">
          {staleCount > 0 && (
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              {staleCount} {staleCount === 1 ? 'voce in aggiornamento' : 'voci in aggiornamento'}
            </span>
          )}
          {lastLabel && (
            <span className="hidden text-[11px] text-muted-foreground md:inline">
              Ultima analisi {lastLabel}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={handleRun}
            disabled={running || enabledWorkspaceIds.length === 0}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', running && 'animate-spin')} />
            Agente-zero
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t px-3 py-3">
          {empty ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Nessun elemento in evidenza. Scrivi <code className="rounded bg-muted px-1">@zero</code> in
              una nota seguito da cosa ricordare o cosa blocca: l'Agente-zero interpreterà il testo e lo
              mostrerà qui.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* Cose da ricordare */}
              <div className="rounded-md border bg-background">
                <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5 text-xs font-semibold">
                  <BellRing className="h-3.5 w-3.5 text-primary" />
                  Cose da ricordare
                  <Badge variant="secondary" className="ml-auto h-4 px-1 text-[10px]">
                    {reminders.length}
                  </Badge>
                </div>
                <div className="max-h-72 overflow-y-auto p-1">
                  {reminders.length === 0 ? (
                    <p className="px-2 py-1.5 text-[11px] text-muted-foreground">—</p>
                  ) : (
                    reminders.map((item) =>
                      renderItemButton(
                        item,
                        item.due_date ? (
                          <span className="font-medium">
                            scad. {new Date(item.due_date).toLocaleDateString('it-IT', {
                              day: '2-digit',
                              month: '2-digit',
                            })}
                          </span>
                        ) : undefined,
                      ),
                    )
                  )}
                </div>
              </div>

              {/* Criticità */}
              <div className="rounded-md border bg-background">
                <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5 text-xs font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  Criticità
                  <Badge variant="secondary" className="ml-auto h-4 px-1 text-[10px]">
                    {criticalities.length}
                  </Badge>
                </div>
                <div className="max-h-72 overflow-y-auto p-1">
                  {criticalities.length === 0 ? (
                    <p className="px-2 py-1.5 text-[11px] text-muted-foreground">—</p>
                  ) : (
                    criticalities.map((item) => renderItemButton(item))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
