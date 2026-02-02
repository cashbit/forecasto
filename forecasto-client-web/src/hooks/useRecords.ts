import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { recordsApi } from '@/api/records'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useFilterStore } from '@/stores/filterStore'
import { useSessionStore } from '@/stores/sessionStore'
import type { RecordCreate, RecordUpdate, Area } from '@/types/record'

export function useRecords() {
  const { currentWorkspaceId } = useWorkspaceStore()
  const { currentArea, dateRange, sign, textFilter, projectFilter, bankAccountFilter } = useFilterStore()
  const { activeSessionId } = useSessionStore()
  const queryClient = useQueryClient()

  const filters = {
    area: currentArea,
    date_start: dateRange?.start,
    date_end: dateRange?.end,
    sign: sign !== 'all' ? sign : undefined,
    text_filter: textFilter || undefined,
    project_id: projectFilter || undefined,
    bank_account_id: bankAccountFilter || undefined,
    session_id: activeSessionId || undefined,
  }

  const query = useQuery({
    queryKey: ['records', currentWorkspaceId, filters],
    queryFn: () => recordsApi.list(currentWorkspaceId!, filters),
    enabled: !!currentWorkspaceId,
  })

  const createMutation = useMutation({
    mutationFn: (data: RecordCreate) => recordsApi.create(currentWorkspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', currentWorkspaceId] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ recordId, data }: { recordId: string; data: RecordUpdate }) =>
      recordsApi.update(currentWorkspaceId!, recordId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', currentWorkspaceId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (recordId: string) => recordsApi.delete(currentWorkspaceId!, recordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', currentWorkspaceId] })
    },
  })

  const transferMutation = useMutation({
    mutationFn: ({ recordId, toArea, note }: { recordId: string; toArea: Area; note?: string }) =>
      recordsApi.transfer(currentWorkspaceId!, recordId, { to_area: toArea, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', currentWorkspaceId] })
    },
  })

  return {
    records: query.data?.items || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    createRecord: createMutation.mutateAsync,
    updateRecord: updateMutation.mutateAsync,
    deleteRecord: deleteMutation.mutateAsync,
    transferRecord: transferMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isTransferring: transferMutation.isPending,
  }
}
