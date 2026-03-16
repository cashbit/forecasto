import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'
import { ChipPicker } from './ChipPicker'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { recordsApi } from '@/api/records'
import { authApi } from '@/api/auth'
import { bankAccountsApi } from '@/api/bank-accounts'
import { AREA_LABELS, SIGN_OPTIONS, STAGE_LABELS_BY_AREA } from '@/lib/constants'
import type { Area } from '@/types/record'
import { toast } from '@/hooks/useToast'
import { ChevronDown, ChevronUp } from 'lucide-react'

const schema = z.object({
  sign: z.enum(['in', 'out'], { message: 'Seleziona entrata o uscita' }),
  account: z.string().min(1, 'Conto obbligatorio'),
  reference: z.string().min(1, 'Riferimento obbligatorio'),
  amount: z.string().min(1, 'Importo obbligatorio'),
  date_cashflow: z.string().min(1, 'Data obbligatoria'),
  note: z.string().optional(),
  owner: z.string().optional(),
  vat: z.string().optional(),
  bank_account_id: z.string().optional(),
  stage: z.string().optional(),
  nextaction: z.string().optional(),
  review_date: z.string().optional(),
  project_code: z.string().optional(),
  transaction_id: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const TODAY = new Date().toISOString().split('T')[0]
const AREAS: Area[] = ['budget', 'prospect', 'orders', 'actual']

function getMobilePrefs(user: { ui_preferences?: Record<string, unknown> } | null) {
  const prefs = user?.ui_preferences?.mobile as { last_workspace_id?: string; last_area?: Area } | undefined
  return prefs ?? {}
}

export function MobileQuickEntry() {
  const { workspaces, selectedWorkspaceIds } = useWorkspaceStore()
  const { user } = useAuthStore()

  const mobilePrefs = getMobilePrefs(user)

  const defaultWorkspaceId =
    mobilePrefs.last_workspace_id && workspaces.some(w => w.id === mobilePrefs.last_workspace_id)
      ? mobilePrefs.last_workspace_id
      : selectedWorkspaceIds[0] ?? workspaces[0]?.id ?? ''

  const defaultArea: Area = mobilePrefs.last_area ?? 'actual'

  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId)
  const [area, setArea] = useState<Area>(defaultArea)
  const [showSecondary, setShowSecondary] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountsApi.listUserAccounts(),
    staleTime: 60000,
  })

  const stages = STAGE_LABELS_BY_AREA[area] ?? {}

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      sign: undefined,
      account: '',
      reference: '',
      amount: '',
      date_cashflow: TODAY,
      note: '',
      owner: '',
      vat: '0',
      bank_account_id: '',
      stage: '0',
      nextaction: '',
      review_date: TODAY,
      project_code: '',
      transaction_id: '',
    },
  })

  const selectedSign = watch('sign')
  const selectedAccount = watch('account')

  const { data: accountChips = [], isFetching: accountChipsLoading } = useQuery({
    queryKey: ['field-values', workspaceId, 'account', selectedSign],
    queryFn: () => recordsApi.getFieldValues(workspaceId, 'account', undefined, selectedSign),
    enabled: !!workspaceId && !!selectedSign,
    staleTime: 30000,
  })

  const { data: referenceChips = [], isFetching: referenceChipsLoading } = useQuery({
    queryKey: ['field-values', workspaceId, 'reference', selectedAccount],
    queryFn: () => recordsApi.getFieldValues(workspaceId, 'reference', undefined, undefined, selectedAccount),
    enabled: !!workspaceId && !!selectedAccount,
    staleTime: 30000,
  })

  const saveMobilePrefs = async (newWorkspaceId: string, newArea: Area) => {
    try {
      const updated = await authApi.updateProfile({
        ui_preferences: {
          ...user?.ui_preferences,
          mobile: {
            ...(user?.ui_preferences?.mobile as object ?? {}),
            last_workspace_id: newWorkspaceId,
            last_area: newArea,
          },
        },
      })
      useAuthStore.setState(state => ({ ...state, user: updated }))
    } catch {
      // Non bloccare l'UI per un errore di salvataggio preferenze
    }
  }

  const handleWorkspaceChange = (id: string) => {
    setWorkspaceId(id)
    saveMobilePrefs(id, area)
  }

  const handleAreaChange = (a: Area) => {
    setArea(a)
    saveMobilePrefs(workspaceId, a)
  }

  const onSubmit = async (data: FormData) => {
    if (!workspaceId) {
      toast({ title: 'Seleziona un workspace', variant: 'destructive' })
      return
    }

    setIsSaving(true)
    try {
      const amountNum = parseFloat(data.amount) || 0
      const vatPct = parseFloat(data.vat || '0') || 0
      const total = amountNum * (1 + vatPct / 100)
      const signMultiplier = data.sign === 'out' ? -1 : 1

      await recordsApi.create(workspaceId, {
        area,
        type: 'standard',
        account: data.account,
        reference: data.reference,
        note: data.note || undefined,
        owner: data.owner || undefined,
        date_cashflow: data.date_cashflow,
        date_offer: data.date_cashflow,
        amount: (amountNum * signMultiplier).toString(),
        total: (total * signMultiplier).toString(),
        vat: vatPct.toString(),
        vat_deduction: '100',
        stage: data.stage || '0',
        nextaction: data.nextaction || undefined,
        review_date: data.review_date || TODAY,
        transaction_id: data.transaction_id || crypto.randomUUID(),
        bank_account_id: data.bank_account_id || undefined,
        project_code: data.project_code || undefined,
      })

      toast({ title: 'Voce salvata', variant: 'success' })

      reset({
        sign: undefined,
        account: '',
        reference: '',
        amount: '',
        date_cashflow: TODAY,
        note: '',
        owner: '',
        vat: '0',
        bank_account_id: '',
        stage: '0',
        nextaction: '',
        review_date: TODAY,
        project_code: '',
        transaction_id: '',
      })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; detail?: string } } })?.response?.data?.error ||
        (err as { response?: { data?: { error?: string; detail?: string } } })?.response?.data?.detail ||
        'Errore durante il salvataggio'
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    reset({
      sign: undefined,
      account: '',
      reference: '',
      amount: '',
      date_cashflow: TODAY,
      note: '',
      owner: '',
      vat: '0',
      bank_account_id: '',
      stage: '0',
      nextaction: '',
      review_date: TODAY,
      project_code: '',
      transaction_id: '',
    })
  }

  return (
    <div className="h-full flex flex-col">
      {/* Selettori contestuali workspace + area */}
      <div className="flex gap-2 px-4 py-2 border-b bg-muted/30 flex-shrink-0">
        <Select value={workspaceId} onValueChange={handleWorkspaceChange}>
          <SelectTrigger className="flex-1 h-8 text-xs">
            <SelectValue placeholder="Workspace" />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map(ws => (
              <SelectItem key={ws.id} value={ws.id} className="text-xs">
                {ws.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={area} onValueChange={v => handleAreaChange(v as Area)}>
          <SelectTrigger className="flex-1 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AREAS.map(a => (
              <SelectItem key={a} value={a} className="text-xs">
                {AREA_LABELS[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col flex-1 overflow-hidden"
      >
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Tipo (segno) */}
          <div className="space-y-1">
            <Label className="text-sm font-medium">Tipo</Label>
            <div className="flex gap-2">
              {SIGN_OPTIONS.map(opt => (
                <Button
                  key={opt.value}
                  type="button"
                  className="flex-1 h-11 text-base"
                  variant={
                    selectedSign === opt.value
                      ? opt.value === 'in' ? 'default' : 'destructive'
                      : 'outline'
                  }
                  onClick={() => {
                    setValue('sign', opt.value as 'in' | 'out')
                    setValue('account', '')
                    setValue('reference', '')
                  }}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            {errors.sign && <p className="text-sm text-destructive">{errors.sign.message}</p>}
          </div>

          {/* Conto — appare dopo aver scelto il segno */}
          {selectedSign && (
            <ChipPicker
              id="account"
              label="Conto"
              chips={accountChips}
              value={watch('account') ?? ''}
              onChange={v => {
                setValue('account', v, { shouldValidate: true })
                setValue('reference', '')
              }}
              onBlur={() => trigger('account')}
              isLoading={accountChipsLoading && accountChips.length === 0}
              error={errors.account?.message}
              placeholder="es. Fornitore ABC"
            />
          )}

          {/* Riferimento — appare dopo aver scelto il conto */}
          {selectedAccount && (
            <ChipPicker
              id="reference"
              label="Riferimento"
              chips={referenceChips}
              value={watch('reference') ?? ''}
              onChange={v => setValue('reference', v, { shouldValidate: true })}
              onBlur={() => trigger('reference')}
              isLoading={referenceChipsLoading && referenceChips.length === 0}
              error={errors.reference?.message}
              placeholder="es. Fattura 2025-001"
            />
          )}

          {/* Importo */}
          <div className="space-y-1">
            <Label htmlFor="amount">Importo</Label>
            <Input
              id="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="h-11 text-base"
              {...register('amount')}
            />
            {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
          </div>

          {/* ID transazione */}
          <div className="space-y-1">
            <Label htmlFor="transaction_id">ID transazione</Label>
            <Input
              id="transaction_id"
              className="h-11 text-base"
              placeholder="es. FT-2025-001"
              {...register('transaction_id')}
            />
          </div>

          {/* Toggle campi secondari */}
          <button
            type="button"
            className="w-full flex items-center justify-between py-2 text-sm text-muted-foreground"
            onClick={() => setShowSecondary(v => !v)}
          >
            <Separator className="flex-1 mr-3" />
            <span className="flex items-center gap-1 whitespace-nowrap">
              Dettagli aggiuntivi
              {showSecondary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
            <Separator className="flex-1 ml-3" />
          </button>

          {/* Campi secondari */}
          {showSecondary && (
            <div className="space-y-4">
              {/* Data */}
              <div className="space-y-1">
                <Label htmlFor="date_cashflow">Data</Label>
                <Input
                  id="date_cashflow"
                  type="date"
                  className="h-11 text-base"
                  {...register('date_cashflow')}
                />
                {errors.date_cashflow && <p className="text-sm text-destructive">{errors.date_cashflow.message}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="note">Note</Label>
                <Input id="note" className="h-11 text-base" placeholder="Nota libera" {...register('note')} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="owner">Responsabile</Label>
                <AutocompleteInput
                  id="owner"
                  field="owner"
                  workspaceIds={workspaceId ? [workspaceId] : []}
                  value={watch('owner') ?? ''}
                  onChange={v => setValue('owner', v)}
                  className="h-11 text-base"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="vat">IVA %</Label>
                <Input
                  id="vat"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="0"
                  max="100"
                  className="h-11 text-base"
                  {...register('vat')}
                />
              </div>

              {bankAccounts.length > 0 && (
                <div className="space-y-1">
                  <Label>Conto bancario</Label>
                  <Select
                    value={watch('bank_account_id') || '__none__'}
                    onValueChange={v => setValue('bank_account_id', v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger className="h-11 text-base">
                      <SelectValue placeholder="Nessuno" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nessuno</SelectItem>
                      {bankAccounts.map(ba => (
                        <SelectItem key={ba.id} value={ba.id}>
                          {ba.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label>Stato</Label>
                <Select value={watch('stage') || '0'} onValueChange={v => setValue('stage', v)}>
                  <SelectTrigger className="h-11 text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(stages).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="nextaction">Prossima azione</Label>
                <Input id="nextaction" className="h-11 text-base" {...register('nextaction')} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="review_date">Data revisione</Label>
                <Input
                  id="review_date"
                  type="date"
                  className="h-11 text-base"
                  {...register('review_date')}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="project_code">Codice progetto</Label>
                <AutocompleteInput
                  id="project_code"
                  field="project_code"
                  workspaceIds={workspaceId ? [workspaceId] : []}
                  value={watch('project_code') ?? ''}
                  onChange={v => setValue('project_code', v)}
                  className="h-11 text-base"
                />
              </div>

            </div>
          )}

          <div className="h-4" />
        </div>

        {/* Footer fisso */}
        <div className="flex gap-3 px-4 py-4 border-t bg-background flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-12 text-base"
            onClick={handleCancel}
            disabled={isSaving}
          >
            Annulla
          </Button>
          <Button
            type="submit"
            className="flex-1 h-12 text-base font-semibold"
            disabled={isSaving}
          >
            {isSaving ? 'Salvataggio...' : 'Salva'}
          </Button>
        </div>
      </form>
    </div>
  )
}
