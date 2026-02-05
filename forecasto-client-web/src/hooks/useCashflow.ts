import { useQueries } from '@tanstack/react-query'
import { cashflowApi } from '@/api/cashflow'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { CashflowParams, CashflowEntry, CashflowSummary } from '@/types/cashflow'

export function useCashflow(params: CashflowParams) {
  const selectedWorkspaceIds = useWorkspaceStore(state => state.selectedWorkspaceIds)

  // Create query for each selected workspace
  const queries = useQueries({
    queries: selectedWorkspaceIds.map(workspaceId => ({
      queryKey: ['cashflow', workspaceId, params],
      queryFn: () => cashflowApi.getCashflow(workspaceId, params),
      staleTime: 30000, // 30 seconds
    })),
    combine: (results) => {
      const isLoading = results.some(r => r.isLoading)
      const isError = results.some(r => r.isError)
      const responses = results.filter(r => r.data).map(r => r.data!)

      // If loading or no data, return early
      if (isLoading || responses.length === 0) {
        return {
          cashflow: [] as CashflowEntry[],
          summary: undefined as CashflowSummary | undefined,
          initialBalance: undefined as { total: number; by_account: Record<string, number> } | undefined,
          isLoading,
          isError,
        }
      }

      // Merge cashflow entries by date
      const cashflowByDate = new Map<string, CashflowEntry>()

      // Helper to ensure numeric values
      const toNum = (val: unknown): number => {
        if (typeof val === 'number') return val
        if (typeof val === 'string') return parseFloat(val) || 0
        return 0
      }

      for (const response of responses) {
        const entries = response.cashflow || []
        for (const entry of entries) {
          if (!entry || !entry.date) continue

          const existing = cashflowByDate.get(entry.date)
          if (existing) {
            existing.inflows += toNum(entry.inflows)
            existing.outflows += toNum(entry.outflows)
            existing.net += toNum(entry.net)
            if (entry.by_area) {
              if (!existing.by_area) existing.by_area = {}
              for (const area of ['budget', 'prospect', 'orders', 'actual'] as const) {
                const areaData = entry.by_area[area]
                if (areaData) {
                  if (!existing.by_area[area]) {
                    existing.by_area[area] = { inflows: 0, outflows: 0 }
                  }
                  existing.by_area[area]!.inflows += toNum(areaData.inflows)
                  existing.by_area[area]!.outflows += toNum(areaData.outflows)
                }
              }
            }
          } else {
            const newEntry: CashflowEntry = {
              date: entry.date,
              inflows: toNum(entry.inflows),
              outflows: toNum(entry.outflows),
              net: toNum(entry.net),
              running_balance: 0,
              by_area: {},
            }
            if (entry.by_area) {
              for (const area of ['budget', 'prospect', 'orders', 'actual'] as const) {
                const areaData = entry.by_area[area]
                if (areaData) {
                  newEntry.by_area[area] = {
                    inflows: toNum(areaData.inflows),
                    outflows: toNum(areaData.outflows)
                  }
                }
              }
            }
            cashflowByDate.set(entry.date, newEntry)
          }
        }
      }

      // Sort by date
      const sortedEntries = Array.from(cashflowByDate.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )

      // Aggregate initial balance
      const totalInitialBalance = responses.reduce(
        (sum, r) => sum + toNum(r.initial_balance?.total),
        0
      )

      // Merge by_account
      const mergedByAccount: Record<string, number> = {}
      for (const response of responses) {
        const byAccount = response.initial_balance?.by_account
        if (byAccount) {
          for (const [account, balance] of Object.entries(byAccount)) {
            mergedByAccount[account] = (mergedByAccount[account] || 0) + toNum(balance)
          }
        }
      }

      // Recalculate running balance
      let runningBalance = totalInitialBalance
      for (const entry of sortedEntries) {
        runningBalance += entry.net
        entry.running_balance = runningBalance
      }

      // Aggregate summary
      let aggregatedSummary: CashflowSummary | undefined = undefined
      if (sortedEntries.length > 0) {
        let minBalance = totalInitialBalance
        let minBalanceDate = ''
        for (const entry of sortedEntries) {
          if (entry.running_balance < minBalance) {
            minBalance = entry.running_balance
            minBalanceDate = entry.date
          }
        }

        aggregatedSummary = {
          total_inflows: responses.reduce((sum, r) => sum + toNum(r.summary?.total_inflows), 0),
          total_outflows: responses.reduce((sum, r) => sum + toNum(r.summary?.total_outflows), 0),
          net_cashflow: responses.reduce((sum, r) => sum + toNum(r.summary?.net_cashflow), 0),
          initial_balance: totalInitialBalance,
          final_balance: runningBalance,
          min_balance: minBalance,
          min_balance_date: minBalanceDate,
        }
      }

      return {
        cashflow: sortedEntries,
        summary: aggregatedSummary,
        initialBalance: {
          total: totalInitialBalance,
          by_account: mergedByAccount,
        },
        isLoading,
        isError,
      }
    },
  })

  return queries
}
