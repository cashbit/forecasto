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
    selectedAreas, dateRange, dateField, yearFilter, monthFilter, dayFilter,
    sign, stageFilter, ownerFilter, nextactionFilter, expiredFilter,
    textFilter, textFilterField, projectCodeFilter, bankAccountFilter, includeDeleted
  } = useFilterStore()
  const reviewMode = useUiStore(state => state.reviewMode)
  const recentFilter = useUiStore(state => state.recentFilter)
  const queryClient = useQueryClient()

  const baseFilters = {
    date_start: dateRange?.start,
    date_end: dateRange?.end,
    date_field: dateField !== 'date_cashflow' ? dateField : undefined,
    sign: sign !== 'all' ? sign : undefined,
    text_filter: textFilter || undefined,
    text_filter_field: textFilter && textFilterField ? textFilterField : undefined,
    project_code: projectCodeFilter || undefined,
    bank_account_id: bankAccountFilter || undefined,
    include_deleted: includeDeleted || undefined,
  }

  // Fetch records from all selected workspaces × selected areas using combine
  const { records, total, isLoading, isError, error } = useQueries({
    queries: selectedWorkspaceIds.flatMap(workspaceId =>
      selectedAreas.map(area => ({
        queryKey: ['records', workspaceId, area, baseFilters],
        queryFn: () => recordsApi.list(workspaceId, { ...baseFilters, area }),
        staleTime: 30000,
      }))
    ),
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

      // Apply date filters (using selected date field)
      if (yearFilter !== null) {
        filteredRecords = filteredRecords.filter((r) => {
          const dateStr = dateField === 'date_document' ? r.date_document : dateField === 'date_offer' ? r.date_offer : r.date_cashflow
          if (!dateStr) return false
          const date = new Date(dateStr)
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

      // Apply recent filter on updated_at (covers both insert and update — updated_at is set on creation too)
      if (recentFilter !== 'all') {
        const threshold = new Date()
        if (recentFilter === 'today') {
          threshold.setHours(0, 0, 0, 0)
        } else if (recentFilter === 'week') {
          threshold.setDate(threshold.getDate() - 7)
        } else if (recentFilter === 'month') {
          threshold.setMonth(threshold.getMonth() - 1)
        }
        const thresholdIso = threshold.toISOString()
        filteredRecords = filteredRecords.filter(r => r.updated_at >= thresholdIso)
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
    queryClient.invalidateQueries({ queryKey: ['focus'] })
    queryClient.invalidateQueries({ queryKey: ['reminders'] })
    queryClient.invalidateQueries({ queryKey: ['cashflow'] })
    queryClient.invalidateQueries({ queryKey: ['drilldown'] })
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

  const bulkCreateMutation = useMutation({
    mutationFn: (records: RecordCreate[]) => recordsApi.bulkImport(primaryWorkspaceId!, records),
    onSuccess: () => {
      invalidateAllWorkspaces()
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: ({ ids, workspaceId }: { ids: string[]; workspaceId?: string }) =>
      recordsApi.bulkDelete(workspaceId || primaryWorkspaceId!, ids),
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

  const restoreMutation = useMutation({
    mutationFn: ({ recordId, workspaceId }: { recordId: string; workspaceId?: string }) =>
      recordsApi.restore(workspaceId || primaryWorkspaceId!, recordId),
    onSuccess: () => {
      invalidateAllWorkspaces()
    },
  })

  const invalidateReminderQueries = async (workspaceId: string | undefined) => {
    const promises: Promise<unknown>[] = []
    selectedWorkspaceIds.forEach((wsId) => {
      promises.push(queryClient.invalidateQueries({ queryKey: ['records', wsId] }))
    })
    const targetWs = workspaceId || primaryWorkspaceId
    if (targetWs) {
      promises.push(queryClient.invalidateQueries({ queryKey: ['reminders', targetWs] }))
    }
    await Promise.all(promises)
  }

  const sendRemindersMutation = useMutation({
    mutationFn: ({ recordIds, workspaceId }: { recordIds: string[]; workspaceId?: string }) =>
      recordsApi.sendReminders(workspaceId || primaryWorkspaceId!, recordIds),
    onSuccess: (_, variables) => invalidateReminderQueries(variables.workspaceId),
  })

  const undoReminderMutation = useMutation({
    mutationFn: ({ recordIds, workspaceId }: { recordIds: string[]; workspaceId?: string }) =>
      recordsApi.undoReminder(workspaceId || primaryWorkspaceId!, recordIds),
    onSuccess: (_, variables) => invalidateReminderQueries(variables.workspaceId),
  })

  return {
    records,
    total,
    isLoading,
    isError,
    error,
    createRecord: createMutation.mutateAsync,
    bulkCreateRecords: bulkCreateMutation.mutateAsync,
    isBulkCreating: bulkCreateMutation.isPending,
    updateRecord: (params: { recordId: string; data: RecordUpdate; workspaceId?: string }) => updateMutation.mutateAsync(params),
    deleteRecord: (recordId: string, workspaceId?: string) => deleteMutation.mutateAsync({ recordId, workspaceId }),
    bulkDeleteRecords: (params: { ids: string[]; workspaceId?: string }) => bulkDeleteMutation.mutateAsync(params),
    transferRecord: (params: { recordId: string; toArea: Area; note?: string; workspaceId?: string }) => transferMutation.mutateAsync(params),
    restoreRecord: (recordId: string, workspaceId?: string) => restoreMutation.mutateAsync({ recordId, workspaceId }),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isBulkDeleting: bulkDeleteMutation.isPending,
    isTransferring: transferMutation.isPending,
    isRestoring: restoreMutation.isPending,
    sendReminders: (params: { recordIds: string[]; workspaceId?: string }) => sendRemindersMutation.mutateAsync(params),
    undoReminder: (params: { recordIds: string[]; workspaceId?: string }) => undoReminderMutation.mutateAsync(params),
    isSendingReminder: sendRemindersMutation.isPending,
    isUndoingReminder: undoReminderMutation.isPending,
    primaryWorkspaceId,
  }
}
