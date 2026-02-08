import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { recordsApi } from '@/api/records'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useFilterStore } from '@/stores/filterStore'
import { useUiStore } from '@/stores/uiStore'
import type { Record, RecordCreate, RecordUpdate, Area } from '@/types/record'

export function useRecords() {
  // Use selectors for better performance and proper reactivity
  const selectedWorkspaceIds = useWorkspaceStore(state => state.selectedWorkspaceIds)
  const {
    currentArea, dateRange, yearFilter, monthFilter, dayFilter,
    sign, stageFilter, ownerFilter, nextactionFilter, expiredFilter,
    textFilter, projectCodeFilter, bankAccountFilter
  } = useFilterStore()
  const reviewMode = useUiStore(state => state.reviewMode)
  const queryClient = useQueryClient()

  const filters = {
    area: currentArea,
    date_start: dateRange?.start,
    date_end: dateRange?.end,
    sign: sign !== 'all' ? sign : undefined,
    text_filter: textFilter || undefined,
    project_code: projectCodeFilter || undefined,
    bank_account_id: bankAccountFilter || undefined,
  }

  // Fetch records from all selected workspaces using combine
  const { records, total, isLoading, isError, error } = useQueries({
    queries: selectedWorkspaceIds.map(workspaceId => ({
      queryKey: ['records', workspaceId, filters],
      queryFn: () => recordsApi.list(workspaceId, filters),
      staleTime: 30000,
    })),
    combine: (results) => {
      const isLoading = results.some(r => r.isLoading)
      const isError = results.some(r => r.isError)
      const error = results.find(r => r.error)?.error

      // Merge all records from all workspaces
      let allRecords: Record[] = []
      for (const result of results) {
        if (result.data?.items) {
          allRecords = allRecords.concat(result.data.items)
        }
      }

      // Apply client-side filters
      let filteredRecords = allRecords

      // Apply stage filter
      if (stageFilter !== 'all') {
        const legacyMap: { [key: string]: string[] } = {
          '0': ['0', 'unpaid', 'draft'],
          '1': ['1', 'paid', 'approved'],
        }
        const validStages = legacyMap[stageFilter] || [stageFilter]
        filteredRecords = filteredRecords.filter((r) => validStages.includes(r.stage))
      }

      // Apply date filters
      if (yearFilter !== null) {
        filteredRecords = filteredRecords.filter((r) => {
          const date = new Date(r.date_cashflow)
          if (date.getFullYear() !== yearFilter) return false
          if (monthFilter !== null && (date.getMonth() + 1) !== monthFilter) return false
          if (dayFilter !== null && date.getDate() !== dayFilter) return false
          return true
        })
      }

      // Apply owner filter
      if (ownerFilter.length > 0) {
        filteredRecords = filteredRecords.filter((r) => {
          if (ownerFilter.includes('_noowner_')) {
            return !r.owner || ownerFilter.includes(r.owner)
          }
          return r.owner && ownerFilter.includes(r.owner)
        })
      }

      // Apply nextaction filter
      if (nextactionFilter === 'with') {
        filteredRecords = filteredRecords.filter((r) => r.nextaction && r.nextaction.trim() !== '')
      } else if (nextactionFilter === 'without') {
        filteredRecords = filteredRecords.filter((r) => !r.nextaction || r.nextaction.trim() === '')
      }

      // Apply expired filter (date_cashflow < today)
      if (expiredFilter !== 'all') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        filteredRecords = filteredRecords.filter((r) => {
          const date = new Date(r.date_cashflow)
          date.setHours(0, 0, 0, 0)
          const isExpired = date.getTime() < today.getTime()
          return expiredFilter === 'yes' ? isExpired : !isExpired
        })
      }

      // Apply review mode filter (review_date <= today)
      if (reviewMode) {
        const today = new Date().toISOString().split('T')[0]
        filteredRecords = filteredRecords.filter(r =>
          r.review_date && r.review_date <= today
        )
      }

      // Sort by date (most recent first)
      filteredRecords.sort((a, b) => new Date(b.date_cashflow).getTime() - new Date(a.date_cashflow).getTime())

      return {
        records: filteredRecords,
        total: filteredRecords.length,
        isLoading,
        isError,
        error,
      }
    },
  })

  const invalidateAllWorkspaces = () => {
    selectedWorkspaceIds.forEach(workspaceId => {
      queryClient.invalidateQueries({ queryKey: ['records', workspaceId] })
    })
  }

  // For mutations, use the first selected workspace
  const primaryWorkspaceId = selectedWorkspaceIds[0]

  const createMutation = useMutation({
    mutationFn: (data: RecordCreate) => recordsApi.create(primaryWorkspaceId!, data),
    onSuccess: () => {
      invalidateAllWorkspaces()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ recordId, data, workspaceId }: { recordId: string; data: RecordUpdate; workspaceId?: string }) =>
      recordsApi.update(workspaceId || primaryWorkspaceId!, recordId, data),
    onSuccess: () => {
      invalidateAllWorkspaces()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({ recordId, workspaceId }: { recordId: string; workspaceId?: string }) =>
      recordsApi.delete(workspaceId || primaryWorkspaceId!, recordId),
    onSuccess: () => {
      invalidateAllWorkspaces()
    },
  })

  const transferMutation = useMutation({
    mutationFn: ({ recordId, toArea, note, workspaceId }: { recordId: string; toArea: Area; note?: string; workspaceId?: string }) =>
      recordsApi.transfer(workspaceId || primaryWorkspaceId!, recordId, { to_area: toArea, note }),
    onSuccess: () => {
      invalidateAllWorkspaces()
    },
  })

  return {
    records,
    total,
    isLoading,
    isError,
    error,
    createRecord: createMutation.mutateAsync,
    updateRecord: (params: { recordId: string; data: RecordUpdate; workspaceId?: string }) => updateMutation.mutateAsync(params),
    deleteRecord: (recordId: string, workspaceId?: string) => deleteMutation.mutateAsync({ recordId, workspaceId }),
    transferRecord: (params: { recordId: string; toArea: Area; note?: string; workspaceId?: string }) => transferMutation.mutateAsync(params),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isTransferring: transferMutation.isPending,
    primaryWorkspaceId,
  }
}
