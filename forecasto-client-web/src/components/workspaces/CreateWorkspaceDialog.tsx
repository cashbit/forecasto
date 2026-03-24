import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { addYears, format, parseISO } from 'date-fns'
import { AxiosError } from 'axios'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useUiStore } from '@/stores/uiStore'
import { toast } from '@/hooks/useToast'
import { bankAccountsApi } from '@/api/bank-accounts'
import { recordsApi } from '@/api/records'
import { workspacesApi } from '@/api/workspaces'
import { vatRegistryApi } from '@/api/vatRegistry'
import { useQuery } from '@tanstack/react-query'
import { useFilterStore } from '@/stores/filterStore'
import type { RecordCreate, Area } from '@/types/record'
import demoRecords from '@/data/workspacedemo.json'
import demoSetup from '@/data/workspacedemo_setup.json'

const DEMO_BASE_YEAR = 2026

// type → area mapping derived from the demo data structure
const TYPE_AREA_MAP: Record<string, Area> = {
  '0': 'actual',
  '1': 'orders',
  '2': 'prospect',
}

function shiftDate(dateStr: string, yearOffset: number): string {
  if (!dateStr) return dateStr
  return format(addYears(parseISO(dateStr), yearOffset), 'yyyy-MM-dd')
}

const schema = z.object({
  name: z.string().min(1, 'Nome obbligatorio').max(100, 'Nome troppo lungo'),
  description: z.string().max(500, 'Descrizione troppo lunga').optional(),
})

type FormData = z.infer<typeof schema>

export function CreateWorkspaceDialog() {
  const { createWorkspaceDialogOpen, setCreateWorkspaceDialogOpen } = useUiStore()
  const { createWorkspace, updateWorkspace } = useWorkspaceStore()
  const { resetFilters, selectSingleArea } = useFilterStore()
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [loadDemo, setLoadDemo] = useState(false)
  const [selectedVatRegistryId, setSelectedVatRegistryId] = useState('')
  const { data: vatRegistries = [] } = useQuery({
    queryKey: ['vat-registries'],
    queryFn: vatRegistryApi.list,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  })

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      const workspace = await createWorkspace(data.name, data.description)
      if (!workspace) throw new Error('Workspace non creato')

      // Associate vat_registry if selected
      if (selectedVatRegistryId) {
        await updateWorkspace(workspace.id, { vat_registry_id: selectedVatRegistryId })
      }

      if (loadDemo) {
        // 1. Compute year offset
        const currentYear = new Date().getFullYear()
        const yearOffset = currentYear - DEMO_BASE_YEAR

        // 2. Shift all dates
        const shifted = (demoRecords as Record<string, string>[]).map(r => ({
          ...r,
          date_cashflow: shiftDate(r.date_cashflow, yearOffset),
          date_offer: shiftDate(r.date_offer, yearOffset),
          review_date: r.review_date ? shiftDate(r.review_date, yearOffset) : r.review_date,
        }))

        // 3. Earliest cashflow date (for initial balance)
        const minDate = shifted.reduce((min, r) => r.date_cashflow < min ? r.date_cashflow : min, shifted[0].date_cashflow)

        // 4. Create bank account
        const setup = demoSetup as { InitialBalance: number; Account: { Name: string; Bank: string }; VATID: string }
        const bankAccount = await bankAccountsApi.create({
          name: setup.Account.Name,
          bank_name: setup.Account.Bank,
        })

        // 5. Associate bank account to workspace
        await bankAccountsApi.setWorkspaceAccount(workspace.id, bankAccount.id)

        // 6. Set initial balance (snapshot at earliest date)
        await bankAccountsApi.addBalance(workspace.id, bankAccount.id, {
          balance_date: minDate,
          balance: setup.InitialBalance,
          source: 'manual',
          note: 'Saldo iniziale demo',
        })

        // 7. Find or create vat_registry for demo P.IVA and associate to workspace
        let demoRegistry = vatRegistries.find(r => r.vat_number === setup.VATID)
        if (!demoRegistry) {
          demoRegistry = await vatRegistryApi.create({ name: data.name, vat_number: setup.VATID })
          queryClient.invalidateQueries({ queryKey: ['vat-registries'] })
        }
        await updateWorkspace(workspace.id, { vat_registry_id: demoRegistry.id })

        // 8. Build RecordCreate array
        const records: RecordCreate[] = shifted.map(r => ({
          area: TYPE_AREA_MAP[r.type] ?? 'actual',
          type: r.type,
          account: r.account,
          reference: r.reference,
          note: r.note || undefined,
          date_cashflow: r.date_cashflow,
          date_offer: r.date_offer,
          amount: r.amount,
          vat: r.vat || undefined,
          vat_deduction: r.vat_deduction || undefined,
          total: r.total,
          stage: r.stage || '0',
          transaction_id: r.transaction_id || '',
          project_code: r.project_code || undefined,
          owner: r.owner || undefined,
          review_date: r.review_date || undefined,
          bank_account_id: bankAccount.id,
        }))

        // 9. Bulk import records
        await recordsApi.bulkImport(workspace.id, records)

        toast({
          title: 'Workspace demo pronto',
          description: `"${data.name}" creato con ${records.length} record demo e saldo iniziale di €${setup.InitialBalance.toLocaleString('it-IT')}.`,
          variant: 'success',
        })

        // Reset filters and go to actual
        resetFilters()
        selectSingleArea('actual')
      } else {
        toast({
          title: 'Workspace creato',
          description: `Il workspace "${data.name}" è stato creato con successo.`,
          variant: 'success',
        })
      }

      reset()
      setLoadDemo(false)
      setSelectedVatRegistryId('')
      setCreateWorkspaceDialogOpen(false)

      // Refetch records after dialog closes so DashboardPage is active
      if (loadDemo) {
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ['records'] })
        }, 100)
      }
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error
        || axiosError.response?.data?.message
        || 'Si è verificato un errore durante la creazione del workspace.'
      toast({
        title: 'Errore',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    reset()
    setLoadDemo(false)
    setSelectedVatRegistryId('')
    setCreateWorkspaceDialogOpen(false)
  }

  return (
    <Dialog open={createWorkspaceDialogOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuovo Workspace</DialogTitle>
          <DialogDescription>
            Crea un nuovo workspace per organizzare i tuoi dati finanziari.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome del workspace</Label>
              <Input
                id="name"
                placeholder="Es: Budget 2026"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrizione (opzionale)</Label>
              <Input
                id="description"
                placeholder="Es: Gestione budget annuale"
                {...register('description')}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="vat-registry">Partita IVA (opzionale)</Label>
              <Select
                value={selectedVatRegistryId || '__none__'}
                onValueChange={(v) => setSelectedVatRegistryId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger id="vat-registry">
                  <SelectValue placeholder="Nessuna" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessuna</SelectItem>
                  {vatRegistries.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} ({r.vat_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 rounded-md border p-3 bg-muted/30">
              <Checkbox
                id="load-demo"
                checked={loadDemo}
                onCheckedChange={(v) => setLoadDemo(!!v)}
              />
              <div className="grid gap-0.5">
                <Label htmlFor="load-demo" className="cursor-pointer">Imposta con i dati demo</Label>
                <p className="text-xs text-muted-foreground">
                  Carica record di esempio, conto bancario demo e saldo iniziale per esplorare l&apos;app.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (loadDemo ? 'Caricamento dati demo...' : 'Creazione...') : 'Crea Workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
