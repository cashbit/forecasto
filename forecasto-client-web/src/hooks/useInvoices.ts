import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invoicesApi } from '@/api/invoices'
import { toast } from '@/hooks/useToast'
import { extractError } from '@/lib/apiError'
import type { InvoiceDraftCreate, InvoiceUpdate } from '@/types/invoice'

export function useInvoices(workspaceId: string | undefined) {
  const queryClient = useQueryClient()

  const listQuery = useQuery({
    queryKey: ['invoices', workspaceId],
    queryFn: () => invoicesApi.list(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 15000,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['invoices', workspaceId] })

  const createDraft = useMutation({
    mutationFn: (data: InvoiceDraftCreate) => invoicesApi.createDraft(workspaceId!, data),
    onSuccess: invalidate,
    onError: (e: unknown) =>
      toast({ title: extractError(e, 'Errore nella creazione della bozza'), variant: 'destructive' }),
  })

  const update = useMutation({
    mutationFn: ({ documentId, data }: { documentId: string; data: InvoiceUpdate }) =>
      invoicesApi.update(workspaceId!, documentId, data),
    onSuccess: (inv) => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['invoice', workspaceId, inv.document_id] })
    },
    onError: (e: unknown) =>
      toast({ title: extractError(e, 'Errore nel salvataggio della fattura'), variant: 'destructive' }),
  })

  const issue = useMutation({
    mutationFn: (documentId: string) => invoicesApi.issue(workspaceId!, documentId),
    onSuccess: (inv) => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['invoice', workspaceId, inv.document_id] })
    },
    onError: (e: unknown) =>
      toast({ title: extractError(e, "Errore durante l'emissione"), variant: 'destructive' }),
  })

  return {
    invoices: listQuery.data?.invoices ?? [],
    total: listQuery.data?.total ?? 0,
    isLoading: listQuery.isLoading,
    createDraft: createDraft.mutateAsync,
    updateInvoice: update.mutateAsync,
    issueInvoice: issue.mutateAsync,
    isSaving: createDraft.isPending || update.isPending,
    isIssuing: issue.isPending,
  }
}

export function useInvoice(workspaceId: string | undefined, documentId: string | undefined) {
  return useQuery({
    queryKey: ['invoice', workspaceId, documentId],
    queryFn: () => invoicesApi.get(workspaceId!, documentId!),
    enabled: !!workspaceId && !!documentId,
  })
}
