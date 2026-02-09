import { useState } from 'react'
import { Landmark, Loader2, X } from 'lucide-react'
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
import { useUserBankAccounts, useWorkspaceBankAccount } from '@/hooks/useBankAccounts'

interface Props {
  workspaceId: string
}

export function WorkspaceBankAccountsSection({ workspaceId }: Props) {
  const { accounts: userAccounts } = useUserBankAccounts()
  const { account, setAccount, unsetAccount, isLoading, isSetting, isUnsetting } =
    useWorkspaceBankAccount(workspaceId)
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')

  // Active accounts available for selection
  const activeAccounts = userAccounts.filter(a => a.is_active)

  const handleSetAccount = async () => {
    if (!selectedAccountId) return
    try {
      await setAccount(selectedAccountId)
      setSelectedAccountId('')
      toast({ title: 'Conto bancario associato al workspace', variant: 'success' })
    } catch {
      toast({ title: "Errore durante l'associazione", variant: 'destructive' })
    }
  }

  const handleChangeAccount = async (accountId: string) => {
    try {
      await setAccount(accountId)
      toast({ title: 'Conto bancario aggiornato', variant: 'success' })
    } catch {
      toast({ title: "Errore durante l'aggiornamento", variant: 'destructive' })
    }
  }

  const handleUnsetAccount = async () => {
    try {
      await unsetAccount()
      toast({ title: 'Conto bancario rimosso dal workspace', variant: 'success' })
    } catch {
      toast({ title: 'Errore durante la rimozione', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <Separator />
      <div>
        <Label className="text-base font-semibold">Conto Bancario</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Associa un conto bancario a questo workspace per il tracking del cashflow per conto.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : account ? (
        /* Account is set - show current account with change/remove options */
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-3 min-w-0">
              <Landmark className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="font-medium truncate">{account.name}</div>
                <div className="text-sm text-muted-foreground truncate">
                  {account.bank_name || 'Banca non specificata'}
                  {account.description && ` - ${account.description}`}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive shrink-0"
              onClick={handleUnsetAccount}
              disabled={isUnsetting}
            >
              {isUnsetting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Change account dropdown */}
          {activeAccounts.length > 1 && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-sm">Cambia conto</Label>
                <Select
                  onValueChange={handleChangeAccount}
                  disabled={isSetting}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Seleziona un altro conto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts
                      .filter(a => a.id !== account.id)
                      .map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} {a.bank_name ? `(${a.bank_name})` : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* No account set - show selector */
        <div>
          {activeAccounts.length > 0 ? (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-sm">Seleziona un conto</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Seleziona un conto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} {a.bank_name ? `(${a.bank_name})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleSetAccount}
                disabled={!selectedAccountId || isSetting}
                size="sm"
              >
                {isSetting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Landmark className="h-4 w-4 mr-1" />
                )}
                Associa
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              Non hai ancora creato nessun conto bancario. Vai nella tab "Conti Bancari" per crearne uno.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
