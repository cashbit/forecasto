import { useQueries } from '@tanstack/react-query'
import { cashflowApi } from '@/api/cashflow'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { CashflowParams, CashflowEntry, CashflowSummary, InitialBalance } from '@/types/cashflow'

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
          initialBalance: undefined as InitialBalance | undefined,
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
            // Merge by_account data
            if (entry.by_account) {
              if (!existing.by_account) existing.by_account = {}
              for (const [accountId, accountData] of Object.entries(entry.by_account)) {
                if (!existing.by_account[accountId]) {
                  existing.by_account[accountId] = {
                    inflows: toNum(accountData.inflows),
                    outflows: toNum(accountData.outflows),
                    running_balance: toNum(accountData.running_balance),
                  }
                } else {
                  existing.by_account[accountId].inflows += toNum(accountData.inflows)
                  existing.by_account[accountId].outflows += toNum(accountData.outflows)
                  existing.by_account[accountId].running_balance += toNum(accountData.running_balance)
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
            // Copy by_account data
            if (entry.by_account) {
              newEntry.by_account = {}
              for (const [accountId, accountData] of Object.entries(entry.by_account)) {
                newEntry.by_account[accountId] = {
                  inflows: toNum(accountData.inflows),
                  outflows: toNum(accountData.outflows),
                  running_balance: toNum(accountData.running_balance),
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

      // Aggregate initial balance (new format with AccountBalance objects)
      const totalInitialBalance = responses.reduce(
        (sum, r) => sum + toNum(r.initial_balance?.total),
        0
      )

      // Merge by_account from InitialBalance (AccountBalance objects with name, balance, credit_limit)
      const mergedByAccount: Record<string, { name: string; balance: number; credit_limit: number }> = {}
      for (const response of responses) {
        const byAccount = response.initial_balance?.by_account
        if (byAccount) {
          for (const [accountId, accountBalance] of Object.entries(byAccount)) {
            if (!mergedByAccount[accountId]) {
              mergedByAccount[accountId] = {
                name: accountBalance.name,
                balance: toNum(accountBalance.balance),
                credit_limit: toNum(accountBalance.credit_limit),
              }
            } else {
              // Same account across workspaces: sum balances
              mergedByAccount[accountId].balance += toNum(accountBalance.balance)
            }
          }
        }
      }

      // Recalculate total running balance
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
        let maxBalance = totalInitialBalance
        let maxBalanceDate = ''

        for (const entry of sortedEntries) {
          if (entry.running_balance < minBalance) {
            minBalance = entry.running_balance
            minBalanceDate = entry.date
          }
          if (entry.running_balance > maxBalance) {
            maxBalance = entry.running_balance
            maxBalanceDate = entry.date
          }
        }

        aggregatedSummary = {
          total_inflows: responses.reduce((sum, r) => sum + toNum(r.summary?.total_inflows), 0),
          total_outflows: responses.reduce((sum, r) => sum + toNum(r.summary?.total_outflows), 0),
          net_cashflow: responses.reduce((sum, r) => sum + toNum(r.summary?.net_cashflow), 0),
          final_balance: runningBalance,
          min_balance: { date: minBalanceDate, amount: minBalance },
          max_balance: { date: maxBalanceDate, amount: maxBalance },
          credit_limit_breaches: [],
        }
      }

      return {
        cashflow: sortedEntries,
        summary: aggregatedSummary,
        initialBalance: {
          date: responses[0]?.initial_balance?.date || '',
          total: totalInitialBalance,
          by_account: mergedByAccount,
        } as InitialBalance,
        isLoading,
        isError,
      }
    },
  })

  return queries
}
