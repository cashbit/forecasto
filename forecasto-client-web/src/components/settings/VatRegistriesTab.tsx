import { useState } from 'react'
import { Plus, Pencil, Trash2, Receipt, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { vatRegistryApi } from '@/api/vatRegistry'
import type { VatRegistry, VatBalance } from '@/types/vat'

interface RegistryFormData {
  name: string
  vat_number: string
}

interface BalanceFormData {
  month: string
  amount: string
  note: string
}

export function VatRegistriesTab() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRegistry, setEditingRegistry] = useState<VatRegistry | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false)
  const [editingBalance, setEditingBalance] = useState<VatBalance | null>(null)
  const [balanceRegistryId, setBalanceRegistryId] = useState<string | null>(null)

  const { data: registries = [], isLoading } = useQuery({
    queryKey: ['vat-registries'],
    queryFn: vatRegistryApi.list,
  })

  const createMutation = useMutation({
    mutationFn: (data: RegistryFormData) => vatRegistryApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-registries'] })
      toast({ title: 'Partita IVA creata', variant: 'success' })
      setDialogOpen(false)
    },
    onError: () => toast({ title: 'Errore durante la creazione', variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RegistryFormData }) =>
      vatRegistryApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-registries'] })
      toast({ title: 'Partita IVA aggiornata', variant: 'success' })
      setDialogOpen(false)
    },
    onError: () => toast({ title: 'Errore durante il salvataggio', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vatRegistryApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-registries'] })
      toast({ title: 'Partita IVA eliminata', variant: 'success' })
    },
    onError: () => toast({ title: 'Errore durante l\'eliminazione', variant: 'destructive' }),
  })

  const registryForm = useForm<RegistryFormData>({
    defaultValues: { name: '', vat_number: '' },
  })

  const balanceForm = useForm<BalanceFormData>({
    defaultValues: { month: '', amount: '', note: '' },
  })

  const openCreateDialog = () => {
    setEditingRegistry(null)
    registryForm.reset({ name: '', vat_number: '' })
    setDialogOpen(true)
  }

  const openEditDialog = (registry: VatRegistry) => {
    setEditingRegistry(registry)
    registryForm.reset({ name: registry.name, vat_number: registry.vat_number })
    setDialogOpen(true)
  }

  const handleRegistrySubmit = (data: RegistryFormData) => {
    if (editingRegistry) {
      updateMutation.mutate({ id: editingRegistry.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleDelete = (registry: VatRegistry) => {
    if (confirm(`Eliminare la partita IVA "${registry.name}"? I saldi associati verranno eliminati.`)) {
      deleteMutation.mutate(registry.id)
    }
  }

  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  // ── Balance handlers ──────────────────────────────────────────

  const openBalanceDialog = (registryId: string, balance?: VatBalance) => {
    setBalanceRegistryId(registryId)
    setEditingBalance(balance || null)
    balanceForm.reset({
      month: balance?.month || '',
      amount: balance?.amount || '',
      note: balance?.note || '',
    })
    setBalanceDialogOpen(true)
  }

  const createBalanceMutation = useMutation({
    mutationFn: ({ registryId, data }: { registryId: string; data: BalanceFormData }) =>
      vatRegistryApi.createBalance(registryId, {
        month: data.month,
        amount: data.amount,
        note: data.note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-balances'] })
      toast({ title: 'Saldo aggiunto', variant: 'success' })
      setBalanceDialogOpen(false)
    },
    onError: () => toast({ title: 'Errore', variant: 'destructive' }),
  })

  const updateBalanceMutation = useMutation({
    mutationFn: ({
      registryId,
      balanceId,
      data,
    }: {
      registryId: string
      balanceId: string
      data: BalanceFormData
    }) =>
      vatRegistryApi.updateBalance(registryId, balanceId, {
        amount: data.amount,
        note: data.note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-balances'] })
      toast({ title: 'Saldo aggiornato', variant: 'success' })
      setBalanceDialogOpen(false)
    },
    onError: () => toast({ title: 'Errore', variant: 'destructive' }),
  })

  const deleteBalanceMutation = useMutation({
    mutationFn: ({ registryId, balanceId }: { registryId: string; balanceId: string }) =>
      vatRegistryApi.deleteBalance(registryId, balanceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vat-balances'] })
      toast({ title: 'Saldo eliminato', variant: 'success' })
    },
    onError: () => toast({ title: 'Errore', variant: 'destructive' }),
  })

  const handleBalanceSubmit = (data: BalanceFormData) => {
    if (!balanceRegistryId) return
    if (editingBalance) {
      updateBalanceMutation.mutate({
        registryId: balanceRegistryId,
        balanceId: editingBalance.id,
        data,
      })
    } else {
      createBalanceMutation.mutate({ registryId: balanceRegistryId, data })
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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Partite IVA</CardTitle>
              <CardDescription>
                Gestisci le partite IVA e i saldi iniziali per il calcolo IVA
              </CardDescription>
            </div>
            <Button onClick={openCreateDialog} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Aggiungi P.IVA
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {registries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nessuna partita IVA configurata</p>
              <p className="text-sm mt-1">Crea la prima per iniziare il calcolo IVA</p>
            </div>
          ) : (
            <div className="space-y-2">
              {registries.map((registry) => (
                <RegistryRow
                  key={registry.id}
                  registry={registry}
                  isExpanded={expandedId === registry.id}
                  onToggle={() => toggleExpanded(registry.id)}
                  onEdit={() => openEditDialog(registry)}
                  onDelete={() => handleDelete(registry)}
                  onAddBalance={() => openBalanceDialog(registry.id)}
                  onEditBalance={(b) => openBalanceDialog(registry.id, b)}
                  onDeleteBalance={(b) =>
                    deleteBalanceMutation.mutate({
                      registryId: registry.id,
                      balanceId: b.id,
                    })
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Registry Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRegistry ? 'Modifica Partita IVA' : 'Nuova Partita IVA'}
            </DialogTitle>
            <DialogDescription>
              {editingRegistry
                ? 'Modifica le informazioni della partita IVA'
                : 'Inserisci le informazioni della nuova partita IVA'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={registryForm.handleSubmit(handleRegistrySubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reg-name">Nome *</Label>
              <Input
                id="reg-name"
                placeholder="es. TechMakers SRL"
                {...registryForm.register('name', { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-vat">Numero Partita IVA *</Label>
              <Input
                id="reg-vat"
                placeholder="es. IT01234567890"
                {...registryForm.register('vat_number', { required: true })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingRegistry ? 'Salva' : 'Crea'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Balance Create/Edit Dialog */}
      <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBalance ? 'Modifica Saldo IVA' : 'Nuovo Saldo IVA'}
            </DialogTitle>
            <DialogDescription>
              Inserisci il saldo IVA per un mese specifico. Positivo = credito, negativo = debito.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={balanceForm.handleSubmit(handleBalanceSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bal-month">Mese *</Label>
              <Input
                id="bal-month"
                type="month"
                {...balanceForm.register('month', { required: !editingBalance })}
                disabled={!!editingBalance}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bal-amount">Importo * (+ credito, - debito)</Label>
              <Input
                id="bal-amount"
                type="number"
                step="0.01"
                placeholder="es. 1500.00 o -500.00"
                {...balanceForm.register('amount', { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bal-note">Nota</Label>
              <Input
                id="bal-note"
                placeholder="es. Saldo da dichiarazione annuale"
                {...balanceForm.register('note')}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBalanceDialogOpen(false)}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={
                  createBalanceMutation.isPending || updateBalanceMutation.isPending
                }
              >
                {(createBalanceMutation.isPending || updateBalanceMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingBalance ? 'Salva' : 'Aggiungi'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── RegistryRow with expandable balances ────────────────────────────

function RegistryRow({
  registry,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onAddBalance,
  onEditBalance,
  onDeleteBalance,
}: {
  registry: VatRegistry
  isExpanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onAddBalance: () => void
  onEditBalance: (b: VatBalance) => void
  onDeleteBalance: (b: VatBalance) => void
}) {
  const { data: balances = [], isLoading } = useQuery({
    queryKey: ['vat-balances', registry.id],
    queryFn: () => vatRegistryApi.listBalances(registry.id),
    enabled: isExpanded,
  })

  return (
    <div className="rounded-lg border bg-card">
      <div
        className="flex items-center justify-between p-3 hover:bg-accent/50 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <Receipt className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="font-medium truncate">{registry.name}</div>
            <div className="text-sm text-muted-foreground truncate">
              {registry.vat_number}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t px-3 pb-3 pt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Saldi IVA</span>
            <Button variant="outline" size="sm" onClick={onAddBalance}>
              <Plus className="mr-1 h-3 w-3" />
              Aggiungi Saldo
            </Button>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : balances.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">
              Nessun saldo inserito
            </p>
          ) : (
            <div className="space-y-1">
              {balances.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded text-sm hover:bg-accent/30"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-muted-foreground w-20">{b.month}</span>
                    <span
                      className={`font-medium ${
                        parseFloat(b.amount) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {parseFloat(b.amount) >= 0 ? '+' : ''}
                      {parseFloat(b.amount).toLocaleString('it-IT', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    {b.note && (
                      <span className="text-muted-foreground truncate max-w-[200px]">
                        {b.note}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditBalance(b)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        if (confirm('Eliminare questo saldo?')) onDeleteBalance(b)
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
