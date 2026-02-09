import { useState } from 'react'
import { Plus, Pencil, Landmark, Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/useToast'
import { useUserBankAccounts } from '@/hooks/useBankAccounts'
import type { BankAccount, BankAccountCreate, BankAccountUpdate } from '@/types/cashflow'

interface AccountFormData {
  name: string
  bank_name: string
  description: string
  currency: string
  credit_limit: string
}

export function BankAccountsTab() {
  const { accounts, isLoading, createAccount, updateAccount, isCreating, isUpdating } = useUserBankAccounts()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null)

  const form = useForm<AccountFormData>({
    defaultValues: {
      name: '',
      bank_name: '',
      description: '',
      currency: 'EUR',
      credit_limit: '0',
    },
  })

  const openCreateDialog = () => {
    setEditingAccount(null)
    form.reset({
      name: '',
      bank_name: '',
      description: '',
      currency: 'EUR',
      credit_limit: '0',
    })
    setDialogOpen(true)
  }

  const openEditDialog = (account: BankAccount) => {
    setEditingAccount(account)
    form.reset({
      name: account.name,
      bank_name: account.bank_name || '',
      description: account.description || '',
      currency: account.currency,
      credit_limit: String(account.credit_limit || 0),
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (data: AccountFormData) => {
    try {
      if (editingAccount) {
        const updateData: BankAccountUpdate = {
          name: data.name,
          bank_name: data.bank_name || undefined,
          description: data.description || undefined,
          currency: data.currency,
          credit_limit: parseFloat(data.credit_limit) || 0,
        }
        await updateAccount(editingAccount.id, updateData)
        toast({ title: 'Conto aggiornato', variant: 'success' })
      } else {
        const createData: BankAccountCreate = {
          name: data.name,
          bank_name: data.bank_name || undefined,
          description: data.description || undefined,
          currency: data.currency,
          credit_limit: parseFloat(data.credit_limit) || 0,
        }
        await createAccount(createData)
        toast({ title: 'Conto creato', variant: 'success' })
      }
      setDialogOpen(false)
    } catch {
      toast({ title: 'Errore durante il salvataggio', variant: 'destructive' })
    }
  }

  const handleToggleActive = async (account: BankAccount) => {
    try {
      await updateAccount(account.id, { is_active: !account.is_active })
      toast({
        title: account.is_active ? 'Conto disattivato' : 'Conto riattivato',
        variant: 'success',
      })
    } catch {
      toast({ title: 'Errore', variant: 'destructive' })
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const activeAccounts = accounts.filter(a => a.is_active)
  const inactiveAccounts = accounts.filter(a => !a.is_active)

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Conti Bancari</CardTitle>
              <CardDescription>Gestisci la tua anagrafica conti bancari personale</CardDescription>
            </div>
            <Button onClick={openCreateDialog} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Aggiungi Conto
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Landmark className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nessun conto bancario configurato</p>
              <p className="text-sm mt-1">Crea il tuo primo conto per iniziare</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeAccounts.map(account => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
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
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline">{account.currency}</Badge>
                    {account.credit_limit > 0 && (
                      <Badge variant="secondary">Fido: {account.credit_limit.toLocaleString()}</Badge>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(account)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => handleToggleActive(account)}
                    >
                      Disattiva
                    </Button>
                  </div>
                </div>
              ))}
              {inactiveAccounts.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground mb-2">Conti disattivati</p>
                  {inactiveAccounts.map(account => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-dashed opacity-60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Landmark className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{account.name}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {account.bank_name || 'Banca non specificata'}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleToggleActive(account)}
                      >
                        Riattiva
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAccount ? 'Modifica Conto' : 'Nuovo Conto Bancario'}</DialogTitle>
            <DialogDescription>
              {editingAccount
                ? 'Modifica le informazioni del conto bancario'
                : 'Inserisci le informazioni del nuovo conto bancario'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account-name">Nome conto *</Label>
              <Input
                id="account-name"
                placeholder="es. Conto Corrente Principale"
                {...form.register('name', { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank-name">Nome banca</Label>
              <Input
                id="bank-name"
                placeholder="es. Intesa Sanpaolo"
                {...form.register('bank_name')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                placeholder="Note opzionali sul conto..."
                {...form.register('description')}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currency">Valuta</Label>
                <Input
                  id="currency"
                  placeholder="EUR"
                  {...form.register('currency')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="credit-limit">Fido</Label>
                <Input
                  id="credit-limit"
                  type="number"
                  step="0.01"
                  placeholder="0"
                  {...form.register('credit_limit')}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={isCreating || isUpdating}>
                {(isCreating || isUpdating) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingAccount ? 'Salva' : 'Crea Conto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
