import { useState } from 'react'
import { Landmark, Loader2, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/useToast'
import { useUserBankAccounts, useWorkspaceAccounts, useWorkspaceBankAccount } from '@/hooks/useBankAccounts'

interface Props {
  workspaceId: string
}

export function WorkspaceBankAccountsSection({ workspaceId }: Props) {
  const { accounts: userAccounts } = useUserBankAccounts()
  const { accounts: wsAccounts, isLoading, addAccount, removeAccount, isAdding, isRemoving } =
    useWorkspaceAccounts(workspaceId)
  const { account: primaryAccount, setAccount, isSetting } = useWorkspaceBankAccount(workspaceId)
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')

  // Accounts available to add (active user accounts not yet associated)
  const addableAccounts = userAccounts.filter(
    a => a.is_active && !wsAccounts.some(wa => wa.id === a.id)
  )

  const handleAddAccount = async () => {
    if (!selectedAccountId) return
    try {
      await addAccount(selectedAccountId)
      setSelectedAccountId('')
      toast({ title: 'Conto bancario associato al workspace', variant: 'success' })
    } catch {
      toast({ title: "Errore durante l'associazione", variant: 'destructive' })
    }
  }

  const handleRemoveAccount = async (accountId: string) => {
    try {
      await removeAccount(accountId)
      toast({ title: 'Conto bancario rimosso dal workspace', variant: 'success' })
    } catch {
      toast({ title: 'Errore durante la rimozione', variant: 'destructive' })
    }
  }

  const handleSetPrimary = async (accountId: string) => {
    try {
      await setAccount(accountId)
      toast({ title: 'Conto principale aggiornato', variant: 'success' })
    } catch {
      toast({ title: "Errore durante l'aggiornamento", variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <Separator />
      <div>
        <Label className="text-base font-semibold">Conti Bancari</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Associa uno o più conti bancari a questo workspace. Il conto principale (★) viene usato
          come riferimento per il cashflow. I conti associati sono visibili agli ospiti del workspace.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* List of associated accounts */}
          {wsAccounts.length > 0 ? (
            <div className="space-y-2">
              {wsAccounts.map(acc => {
                const isPrimary = primaryAccount?.id === acc.id
                return (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate">{acc.name}</span>
                          {isPrimary && (
                            <span className="text-xs text-amber-500 font-medium flex items-center gap-0.5">
                              <Star className="h-3 w-3 fill-amber-500" />
                              Principale
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {acc.bank_name || 'Banca non specificata'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!isPrimary && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2 text-muted-foreground"
                          onClick={() => handleSetPrimary(acc.id)}
                          disabled={isSetting}
                          title="Imposta come principale"
                        >
                          {isSetting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Star className="h-3 w-3 mr-1" />
                          )}
                          Imposta principale
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveAccount(acc.id)}
                        disabled={isRemoving}
                        title="Rimuovi dal workspace"
                      >
                        {isRemoving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-1">
              Nessun conto bancario associato a questo workspace.
            </p>
          )}

          {/* Add account section */}
          {addableAccounts.length > 0 && (
            <div className="flex items-end gap-2 pt-1">
              <div className="flex-1">
                <Label className="text-sm">Aggiungi conto</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Seleziona un conto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {addableAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} {a.bank_name ? `— ${a.bank_name}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleAddAccount}
                disabled={!selectedAccountId || isAdding}
                size="sm"
              >
                {isAdding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Landmark className="h-4 w-4 mr-1" />
                )}
                Associa
              </Button>
            </div>
          )}

          {addableAccounts.length === 0 && userAccounts.filter(a => a.is_active).length === 0 && (
            <p className="text-sm text-muted-foreground py-1">
              Non hai ancora creato nessun conto bancario. Vai nella tab "Conti Bancari" per crearne uno.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
