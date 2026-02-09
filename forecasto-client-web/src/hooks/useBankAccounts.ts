import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bankAccountsApi } from '@/api/bank-accounts'
import type { BankAccount, BankAccountCreate, BankAccountUpdate } from '@/types/cashflow'

/**
 * Hook for user-level bank account registry (personal accounts).
 */
export function useUserBankAccounts() {
  const queryClient = useQueryClient()

  const { data: accounts = [], isLoading, isError } = useQuery({
    queryKey: ['bankAccounts', 'user'],
    queryFn: () => bankAccountsApi.listUserAccounts(),
    staleTime: 30000,
  })

  const createMutation = useMutation({
    mutationFn: (data: BankAccountCreate) => bankAccountsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankAccounts', 'user'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ accountId, data }: { accountId: string; data: BankAccountUpdate }) =>
      bankAccountsApi.update(accountId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankAccounts', 'user'] })
    },
  })

  return {
    accounts,
    isLoading,
    isError,
    createAccount: createMutation.mutateAsync,
    updateAccount: (accountId: string, data: BankAccountUpdate) =>
      updateMutation.mutateAsync({ accountId, data }),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  }
}

/**
 * Hook for workspace-level bank account (1-to-1 relationship).
 * Each workspace has at most one bank account.
 */
export function useWorkspaceBankAccount(workspaceId: string) {
  const queryClient = useQueryClient()

  const { data: account, isLoading, isError } = useQuery({
    queryKey: ['bankAccounts', 'workspace', workspaceId],
    queryFn: () => bankAccountsApi.getWorkspaceAccount(workspaceId),
    staleTime: 30000,
    enabled: !!workspaceId,
  })

  const setAccountMutation = useMutation({
    mutationFn: (accountId: string) =>
      bankAccountsApi.setWorkspaceAccount(workspaceId, accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankAccounts', 'workspace', workspaceId] })
    },
  })

  const unsetAccountMutation = useMutation({
    mutationFn: () => bankAccountsApi.unsetWorkspaceAccount(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankAccounts', 'workspace', workspaceId] })
    },
  })

  return {
    account: account ?? null,
    isLoading,
    isError,
    setAccount: (accountId: string) => setAccountMutation.mutateAsync(accountId),
    unsetAccount: () => unsetAccountMutation.mutateAsync(),
    isSetting: setAccountMutation.isPending,
    isUnsetting: unsetAccountMutation.isPending,
  }
}
