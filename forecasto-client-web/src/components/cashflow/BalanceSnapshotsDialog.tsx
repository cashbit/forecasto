import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Plus, Anchor } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { bankAccountsApi } from '@/api/bank-accounts'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { AmountDisplay } from '@/components/common/AmountDisplay'
import type { BankAccount, BankAccountBalance } from '@/types/cashflow'
import type { CashflowParams } from '@/types/cashflow'

interface WorkspaceAccount {
  workspaceId: string
  workspaceName: string
  account: BankAccount
}

interface BalanceSnapshotsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cashflowParams: CashflowParams
}

export function BalanceSnapshotsDialog({
  open,
  onOpenChange,
  cashflowParams,
}: BalanceSnapshotsDialogProps) {
  const queryClient = useQueryClient()
  const { workspaces, selectedWorkspaceIds } = useWorkspaceStore()
  const selectedWorkspaces = workspaces.filter(w => selectedWorkspaceIds.includes(w.id))

  const [selectedAccountKey, setSelectedAccountKey] = useState<string>('')
  const [date, setDate] = useState(cashflowParams.from_date)
  const [balance, setBalance] = useState('')
  const [note, setNote] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch bank accounts for each selected workspace
  const accountQueries = useQuery({
    queryKey: ['workspace-bank-accounts', selectedWorkspaceIds],
    queryFn: async (): Promise<WorkspaceAccount[]> => {
      const results: WorkspaceAccount[] = []
      for (const ws of selectedWorkspaces) {
        try {
          const account = await bankAccountsApi.getWorkspaceAccount(ws.id)
          if (account) {
            results.push({ workspaceId: ws.id, workspaceName: ws.name, account })
          }
        } catch {
          // workspace has no account
        }
      }
      return results
    },
    enabled: open,
  })

  const workspaceAccounts = accountQueries.data ?? []

  // Auto-select account when there's only one
  useEffect(() => {
    if (workspaceAccounts.length === 1 && !selectedAccountKey) {
      const wa = workspaceAccounts[0]
      setSelectedAccountKey(`${wa.workspaceId}|${wa.account.id}`)
    }
  }, [workspaceAccounts, selectedAccountKey])

  // Fetch existing balance snapshots for all workspace accounts in the cashflow period
  const snapshotsQuery = useQuery({
    queryKey: ['balance-snapshots', selectedWorkspaceIds, cashflowParams.from_date, cashflowParams.to_date],
    queryFn: async (): Promise<Array<BankAccountBalance & { workspaceName: string; accountName: string }>> => {
      const results: Array<BankAccountBalance & { workspaceName: string; accountName: string }> = []
      for (const wa of workspaceAccounts) {
        try {
          const balances = await bankAccountsApi.getBalances(
            wa.workspaceId,
            wa.account.id,
            cashflowParams.from_date,
            cashflowParams.to_date,
          )
          for (const b of balances) {
            results.push({ ...b, workspaceName: wa.workspaceName, accountName: wa.account.name })
          }
        } catch {
          // ignore
        }
      }
      return results.sort((a, b) => a.balance_date.localeCompare(b.balance_date))
    },
    enabled: open && workspaceAccounts.length > 0,
  })

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccountKey) throw new Error('Seleziona un conto')
      if (!date) throw new Error('Inserisci una data')
      if (balance === '' || isNaN(parseFloat(balance))) throw new Error('Inserisci un saldo valido')

      const [workspaceId, accountId] = selectedAccountKey.split('|')
      return bankAccountsApi.addBalance(workspaceId, accountId, {
        balance_date: date,
        balance: parseFloat(balance),
        source: 'manual',
        note: note || undefined,
      })
    },
    onSuccess: () => {
      setBalance('')
      setNote('')
      setError(null)
      setIsAdding(false)
      snapshotsQuery.refetch()
      // Invalidate cashflow so the chart updates
      queryClient.invalidateQueries({ queryKey: ['cashflow'] })
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async ({ workspaceId, accountId, balanceId }: { workspaceId: string; accountId: string; balanceId: string }) => {
      return bankAccountsApi.deleteBalance(workspaceId, accountId, balanceId)
    },
    onSuccess: () => {
      snapshotsQuery.refetch()
      queryClient.invalidateQueries({ queryKey: ['cashflow'] })
    },
  })

  const handleAdd = () => {
    setError(null)
    addMutation.mutate()
  }

  // Find workspaceId for a given snapshot by bank_account_id
  const findWorkspaceForAccount = (bankAccountId: string): { workspaceId: string; accountId: string } | undefined => {
    const wa = workspaceAccounts.find(w => w.account.id === bankAccountId)
    if (!wa) return undefined
    return { workspaceId: wa.workspaceId, accountId: wa.account.id }
  }

  const snapshots = snapshotsQuery.data ?? []
  const noAccounts = !accountQueries.isLoading && !accountQueries.isFetching && workspaceAccounts.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Anchor className="h-4 w-4" />
            Saldi a Data
          </DialogTitle>
        </DialogHeader>

        {noAccounts ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nessun conto corrente associato ai workspace selezionati.
            <br />
            Configura il conto nelle impostazioni del workspace.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Existing snapshots */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Saldi registrati nel periodo
              </p>
              {snapshotsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground py-2">Caricamento...</p>
              ) : snapshots.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Nessun saldo registrato nel periodo selezionato.</p>
              ) : (
                <div className="divide-y border rounded-md">
                  {snapshots.map((snap) => {
                    const wInfo = findWorkspaceForAccount(snap.bank_account_id)
                    return (
                      <div key={snap.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div className="space-y-0.5">
                          <AmountDisplay amount={snap.balance} className="font-medium" showSign={false} />
                          <div className="text-xs text-muted-foreground">
                            {snap.balance_date} · {snap.accountName}
                            {selectedWorkspaceIds.length > 1 && ` (${snap.workspaceName})`}
                            {snap.note && ` · ${snap.note}`}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={deleteMutation.isPending || !wInfo}
                          onClick={() => {
                            if (wInfo) {
                              deleteMutation.mutate({ workspaceId: wInfo.workspaceId, accountId: wInfo.accountId, balanceId: snap.id })
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Add form */}
            {!isAdding ? (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setIsAdding(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Aggiungi saldo a data
              </Button>
            ) : (
              <div className="border rounded-md p-3 space-y-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nuovo saldo</p>

                {/* Bank account selector */}
                {workspaceAccounts.length > 1 && (
                  <div className="space-y-1">
                    <Label className="text-xs">Conto</Label>
                    <Select value={selectedAccountKey} onValueChange={setSelectedAccountKey}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Seleziona conto..." />
                      </SelectTrigger>
                      <SelectContent>
                        {workspaceAccounts.map((wa) => (
                          <SelectItem key={`${wa.workspaceId}|${wa.account.id}`} value={`${wa.workspaceId}|${wa.account.id}`}>
                            {wa.workspaceName} — {wa.account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Data</Label>
                    <Input
                      type="date"
                      className="h-8 text-sm"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Saldo (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 text-sm"
                      placeholder="0.00"
                      value={balance}
                      onChange={(e) => setBalance(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Nota (opzionale)</Label>
                  <Textarea
                    className="text-sm min-h-0 h-16 resize-none"
                    placeholder="es. estratto conto febbraio"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>

                {error && <p className="text-xs text-destructive">{error}</p>}

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setIsAdding(false); setError(null) }}
                  >
                    Annulla
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAdd}
                    disabled={addMutation.isPending}
                  >
                    {addMutation.isPending ? 'Salvataggio...' : 'Salva'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
