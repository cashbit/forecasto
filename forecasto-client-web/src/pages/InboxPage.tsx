import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Inbox, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InboxItemCard } from '@/components/inbox/InboxItemCard'
import { DocumentUploadZone } from '@/components/inbox/DocumentUploadZone'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { inboxApi } from '@/api/inbox'
import { toast } from '@/hooks/useToast'
import type { InboxItem, InboxItemUpdate, RecordSuggestion, ReconciliationMatch } from '@/types/inbox'

type StatusFilter = 'pending' | 'confirmed' | 'rejected' | undefined

export function InboxPage() {
  const queryClient = useQueryClient()
  const { getPrimaryWorkspace, selectedWorkspaceIds } = useWorkspaceStore()
  const primaryWorkspace = getPrimaryWorkspace()
  const workspaceId = primaryWorkspace?.id ?? selectedWorkspaceIds[0]

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['inbox', workspaceId, statusFilter],
    queryFn: () => inboxApi.list(workspaceId, { status: statusFilter, limit: 100 }),
    enabled: !!workspaceId,
  })

  const { data: countData } = useQuery({
    queryKey: ['inbox-count', workspaceId],
    queryFn: () => inboxApi.count(workspaceId),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inbox', workspaceId] })
    queryClient.invalidateQueries({ queryKey: ['inbox-count', workspaceId] })
  }

  const updateMutation = useMutation({
    mutationFn: ({ item, suggestions, reconciliationMatches }: { item: InboxItem; suggestions: RecordSuggestion[]; reconciliationMatches?: ReconciliationMatch[] }) => {
      const updateData: InboxItemUpdate = { extracted_data: suggestions }
      if (reconciliationMatches !== undefined) {
        updateData.reconciliation_matches = reconciliationMatches
      }
      return inboxApi.update(workspaceId, item.id, updateData)
    },
    onSuccess: () => {
      toast({ title: 'Modifiche salvate', variant: 'success' })
      invalidate()
    },
    onError: () => toast({ title: 'Errore nel salvataggio', variant: 'destructive' }),
  })

  const confirmMutation = useMutation({
    mutationFn: ({ item, suggestions }: { item: InboxItem; suggestions: RecordSuggestion[] }) =>
      inboxApi.update(workspaceId, item.id, { extracted_data: suggestions })
        .then(() => inboxApi.confirm(workspaceId, item.id)),
    onSuccess: (confirmed) => {
      toast({
        title: 'Record confermati',
        description: `${confirmed.confirmed_record_ids.length} record creati con successo`,
        variant: 'success',
      })
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['records'] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto'
      toast({ title: 'Errore nella conferma', description: msg, variant: 'destructive' })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (item: InboxItem) => inboxApi.reject(workspaceId, item.id),
    onSuccess: () => {
      toast({ title: 'Documento rifiutato' })
      invalidate()
    },
    onError: () => toast({ title: 'Errore nel rifiuto', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (item: InboxItem) => inboxApi.delete(workspaceId, item.id),
    onSuccess: () => {
      toast({ title: 'Elemento eliminato' })
      invalidate()
    },
    onError: () => toast({ title: 'Errore nell\'eliminazione', variant: 'destructive' }),
  })

  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Inbox className="h-12 w-12 mb-3 opacity-40" />
        <p>Seleziona un workspace per vedere la inbox</p>
      </div>
    )
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pendingCount = countData?.pending ?? 0

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Inbox className="h-6 w-6" />
          <div>
            <h1 className="text-xl font-semibold">Inbox Agente</h1>
            <p className="text-sm text-muted-foreground">
              Documenti elaborati dal Forecasto Agent in attesa di conferma
            </p>
          </div>
          {pendingCount > 0 && (
            <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full bg-red-500 text-white text-xs font-medium">
              {pendingCount}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Aggiorna
        </Button>
      </div>

      {/* Upload zone */}
      {workspaceId && (
        <DocumentUploadZone
          workspaceId={workspaceId}
          onProcessingComplete={() => {
            invalidate()
          }}
        />
      )}

      {/* Tabs */}
      <Tabs value={statusFilter ?? 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? undefined : v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="pending">
            In attesa
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-xs">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="confirmed">Confermati</TabsTrigger>
          <TabsTrigger value="rejected">Rifiutati</TabsTrigger>
          <TabsTrigger value="all">Tutti</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Content */}
      {isLoading && (
        <div className="flex justify-center py-12 text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin" />
        </div>
      )}

      {isError && (
        <div className="text-center py-12 text-destructive">
          Errore nel caricamento della inbox
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Inbox className="h-12 w-12 mb-3 opacity-30" />
          <p className="font-medium">Nessun documento{statusFilter ? ` ${statusFilter === 'pending' ? 'in attesa' : statusFilter === 'confirmed' ? 'confermato' : 'rifiutato'}` : ''}</p>
          <p className="text-sm mt-1">
            {statusFilter === 'pending'
              ? "Quando l'agente elabora un documento apparirà qui"
              : 'Nessun elemento in questa sezione'}
          </p>
        </div>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <InboxItemCard
              key={item.id}
              item={item}
              onConfirm={(i, suggestions) => confirmMutation.mutateAsync({ item: i, suggestions })}
              onReject={(i) => rejectMutation.mutateAsync(i)}
              onDelete={(i) => deleteMutation.mutateAsync(i)}
              onUpdate={(i, suggestions, reconciliationMatches) => updateMutation.mutateAsync({ item: i, suggestions, reconciliationMatches })}
            />
          ))}
          {total > items.length && (
            <p className="text-center text-sm text-muted-foreground py-2">
              Mostrati {items.length} di {total} elementi
            </p>
          )}
        </div>
      )}
    </div>
  )
}
