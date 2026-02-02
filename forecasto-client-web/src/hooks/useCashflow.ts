import { useQuery } from '@tanstack/react-query'
import { cashflowApi } from '@/api/cashflow'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { CashflowParams } from '@/types/cashflow'

export function useCashflow(params: CashflowParams) {
  const { currentWorkspaceId } = useWorkspaceStore()

  const query = useQuery({
    queryKey: ['cashflow', currentWorkspaceId, params],
    queryFn: () => cashflowApi.getCashflow(currentWorkspaceId!, params),
    enabled: !!currentWorkspaceId,
  })

  return {
    cashflow: query.data?.cashflow || [],
    summary: query.data?.summary,
    initialBalance: query.data?.initial_balance,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
