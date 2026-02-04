import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { recordsApi } from '@/api/records'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useFilterStore } from '@/stores/filterStore'
import { useSessionStore } from '@/stores/sessionStore'
import type { RecordCreate, RecordUpdate, Area } from '@/types/record'

export function useRecords() {
  const { currentWorkspaceId } = useWorkspaceStore()
  const {
    currentArea, dateRange, yearFilter, monthFilter, dayFilter,
    sign, stageFilter, ownerFilter, nextactionFilter,
    textFilter, projectFilter, bankAccountFilter
  } = useFilterStore()
  const { activeSessionId, fetchOperations } = useSessionStore()
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
    queryKey: ['records', currentWorkspaceId, filters, stageFilter, yearFilter, monthFilter, dayFilter, ownerFilter, nextactionFilter],
    queryFn: () => recordsApi.list(currentWorkspaceId!, filters),
    enabled: !!currentWorkspaceId,
    select: (data) => {
      let items = data.items

      // Apply stage filter
      if (stageFilter !== 'all') {
        const legacyMap: Record<string, string[]> = {
          '0': ['0', 'unpaid', 'draft'],
          '1': ['1', 'paid', 'approved'],
        }
        const validStages = legacyMap[stageFilter] || [stageFilter]
        items = items.filter((r: { stage: string }) => validStages.includes(r.stage))
      }

      // Apply date filters
      if (yearFilter !== null) {
        items = items.filter((r: { date_cashflow: string }) => {
          const date = new Date(r.date_cashflow)
          if (date.getFullYear() !== yearFilter) return false
          if (monthFilter !== null && (date.getMonth() + 1) !== monthFilter) return false
          if (dayFilter !== null && date.getDate() !== dayFilter) return false
          return true
        })
      }

      // Apply owner filter
      if (ownerFilter.length > 0) {
        items = items.filter((r: { owner?: string }) => {
          if (ownerFilter.includes('_noowner_')) {
            // Include records without owner OR with selected owners
            return !r.owner || ownerFilter.includes(r.owner)
          }
          return r.owner && ownerFilter.includes(r.owner)
        })
      }

      // Apply nextaction filter
      if (nextactionFilter === 'with') {
        items = items.filter((r: { nextaction?: string }) => r.nextaction && r.nextaction.trim() !== '')
      } else if (nextactionFilter === 'without') {
        items = items.filter((r: { nextaction?: string }) => !r.nextaction || r.nextaction.trim() === '')
      }

      return { ...data, items }
    },
  })

  const refreshOperations = () => {
    if (currentWorkspaceId && activeSessionId) {
      fetchOperations(currentWorkspaceId, activeSessionId)
    }
  }

  const createMutation = useMutation({
    mutationFn: (data: RecordCreate) => recordsApi.create(currentWorkspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', currentWorkspaceId] })
      refreshOperations()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ recordId, data }: { recordId: string; data: RecordUpdate }) =>
      recordsApi.update(currentWorkspaceId!, recordId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', currentWorkspaceId] })
      refreshOperations()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (recordId: string) => recordsApi.delete(currentWorkspaceId!, recordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', currentWorkspaceId] })
      refreshOperations()
    },
  })

  const transferMutation = useMutation({
    mutationFn: ({ recordId, toArea, note }: { recordId: string; toArea: Area; note?: string }) =>
      recordsApi.transfer(currentWorkspaceId!, recordId, { to_area: toArea, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', currentWorkspaceId] })
      refreshOperations()
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
