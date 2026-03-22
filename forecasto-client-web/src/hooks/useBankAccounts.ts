import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bankAccountsApi } from '@/api/bank-accounts'
import { useWorkspaceStore } from '@/stores/workspaceStore'
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
 * Hook for workspace-level primary bank account (1-to-1 relationship).
 * Each workspace has at most one primary bank account.
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
      queryClient.invalidateQueries({ queryKey: ['workspace-bank-accounts'] })
    },
  })

  const unsetAccountMutation = useMutation({
    mutationFn: () => bankAccountsApi.unsetWorkspaceAccount(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankAccounts', 'workspace', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['workspace-bank-accounts'] })
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

/**
 * Hook for managing all bank accounts associated with a workspace (many-to-many).
 * Used in workspace settings to add/remove account associations.
 */
export function useWorkspaceAccounts(workspaceId: string) {
  const queryClient = useQueryClient()
  const { fetchWorkspaces } = useWorkspaceStore()

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['bankAccounts', 'workspace', workspaceId, 'all'],
    queryFn: () => bankAccountsApi.listWorkspaceAccounts(workspaceId),
    staleTime: 30000,
    enabled: !!workspaceId,
  })

  const addMutation = useMutation({
    mutationFn: (accountId: string) =>
      bankAccountsApi.addWorkspaceAccount(workspaceId, accountId),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['bankAccounts', 'workspace', workspaceId] })
      await fetchWorkspaces()
    },
  })

  const removeMutation = useMutation({
    mutationFn: (accountId: string) =>
      bankAccountsApi.removeWorkspaceAccount(workspaceId, accountId),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['bankAccounts', 'workspace', workspaceId] })
      await fetchWorkspaces()
    },
  })

  return {
    accounts,
    isLoading,
    addAccount: (accountId: string) => addMutation.mutateAsync(accountId),
    removeAccount: (accountId: string) => removeMutation.mutateAsync(accountId),
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
  }
}
