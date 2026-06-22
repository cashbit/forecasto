import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { customersApi } from '@/api/customers'
import { toast } from '@/hooks/useToast'
import { extractError } from '@/lib/apiError'
import type { CustomerUpsert } from '@/types/customer'

export function useCustomers(workspaceId: string | undefined, search?: string) {
  const queryClient = useQueryClient()

  const listQuery = useQuery({
    queryKey: ['customers', workspaceId, search ?? ''],
    queryFn: () => customersApi.list(workspaceId!, search),
    enabled: !!workspaceId,
    staleTime: 30000,
  })

  const upsertMutation = useMutation({
    mutationFn: (data: CustomerUpsert) => customersApi.upsert(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', workspaceId] })
      toast({ title: 'Cliente salvato', variant: 'success' })
    },
    onError: (e: unknown) =>
      toast({ title: extractError(e, 'Errore nel salvataggio del cliente'), variant: 'destructive' }),
  })

  return {
    customers: listQuery.data?.customers ?? [],
    total: listQuery.data?.total ?? 0,
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    upsertCustomer: upsertMutation.mutateAsync,
    isSaving: upsertMutation.isPending,
  }
}
