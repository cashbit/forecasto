import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AxiosError } from 'axios'
import { AlertCircle, Repeat as RepeatIcon } from 'lucide-react'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'
import { MarkdownTextarea } from '@/components/common/MarkdownTextarea'
import { AmountDisplay } from '@/components/common/AmountDisplay'
import { useUiStore } from '@/stores/uiStore'
import { useFilterStore } from '@/stores/filterStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useRecords } from '@/hooks/useRecords'
import { toast } from '@/hooks/useToast'
import { AREAS, AREA_LABELS, AREA_DESCRIPTIONS, STAGES, STAGE_LABELS_BY_AREA, SIGN_OPTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import {
  generateInstallments,
  recalcInstallmentField,
  type Installment,
  type IntervalUnit,
  type RepeatMode,
  type SplitPreset,
} from '@/lib/recurrence'

type DistPreset = 'clone' | 'equal' | '50-50' | '20-80' | '30-70' | '30-40-30' | 'custom'
type CadPreset = '1/12' | '1/24' | '1/36' | 'monthly' | 'bimonthly' | 'quarterly' | 'semestral' | 'annual' | 'custom'

function getActiveDist(mode: RepeatMode, count: number, preset: SplitPreset): DistPreset {
  if (preset === 'custom') return 'custom'
  if (mode === 'clone') return 'clone'
  if (preset === '50-50' && count === 2) return '50-50'
  if (preset === '20-80' && count === 2) return '20-80'
  if (preset === '30-70' && count === 2) return '30-70'
  if (preset === '30-40-30' && count === 3) return '30-40-30'
  if (preset === 'equal') return 'equal'
  return 'custom'
}

function getActiveCad(
  count: number,
  intervalValue: number,
  intervalUnit: IntervalUnit,
  mode: RepeatMode,
  preset: SplitPreset,
): CadPreset {
  if (intervalUnit !== 'months') return 'custom'
  if (intervalValue === 1) {
    if (mode === 'split' && preset === 'equal') {
      if (count === 12) return '1/12'
      if (count === 24) return '1/24'
      if (count === 36) return '1/36'
    }
    return 'monthly'
  }
  if (intervalValue === 2) return 'bimonthly'
  if (intervalValue === 3) return 'quarterly'
  if (intervalValue === 6) return 'semestral'
  if (intervalValue === 12) return 'annual'
  return 'custom'
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-7 px-2.5 rounded-full border text-xs font-medium transition-colors whitespace-nowrap',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}
import type { Area, RecordCreate } from '@/types/record'
import type { Sign } from '@/types/workspace'

const schema = z.object({
  account: z.string().min(1, 'Conto obbligatorio'),
  reference: z.string().min(1, 'Riferimento obbligatorio'),
  transaction_id: z.string().min(1, 'ID Transazione obbligatorio'),
  note: z.string().optional(),
  date_cashflow: z.string().min(1, 'Data cashflow obbligatoria'),
  date_offer: z.string().min(1, 'Data offerta obbligatoria'),
  date_document: z.string().optional(),
  owner: z.string().optional(),
  amount: z.string().min(1, 'Imponibile obbligatorio'),
  total: z.string().min(1, 'Totale obbligatorio'),
  stage: z.string().min(1, 'Stato obbligatorio'),
  nextaction: z.string().optional(),
  review_date: z.string().optional(),
  project_code: z.string().optional(),
  vat: z.string().optional(),
  vat_deduction: z.string().optional(),
  vat_month: z.string().optional(),
  withholding_rate: z.string().optional(),
  bank_account_id: z.string().optional(),
  sign: z.enum(['in', 'out'], { message: 'Seleziona entrata o uscita' }),
  repeat_enabled: z.boolean(),
  repeat_count: z.number().int().min(2).max(60).optional(),
  repeat_interval_value: z.number().int().min(1).optional(),
  repeat_interval_unit: z.enum(['days', 'weeks', 'months']).optional(),
  repeat_mode: z.enum(['clone', 'split']).optional(),
  repeat_preset: z.enum(['equal', '50-50', '20-80', '30-70', '30-40-30', 'custom']).optional(),
})

type FormData = z.infer<typeof schema>

const defaultFormValues = (initialArea: Area): FormData => ({
  account: '',
  reference: '',
  transaction_id: '',
  note: '',
  date_cashflow: new Date().toISOString().split('T')[0],
  date_offer: new Date().toISOString().split('T')[0],
  date_document: '',
  owner: '',
  amount: '',
  total: '',
  stage: STAGES[initialArea]?.[0] ?? '0',
  nextaction: '',
  review_date: '',
  project_code: '',
  vat: '22',
  vat_deduction: '100',
  vat_month: '',
  withholding_rate: '',
  bank_account_id: '',
  sign: 'in',
  repeat_enabled: false,
  repeat_count: 2,
  repeat_interval_value: 1,
  repeat_interval_unit: 'months',
  repeat_mode: 'clone',
  repeat_preset: 'equal',
})

interface ZoneProps {
  title: string
  hint: string
  className?: string
  children: React.ReactNode
}

function Zone({ title, hint, className, children }: ZoneProps) {
  return (
    <section className={cn('rounded-lg border bg-card p-3 space-y-2', className)}>
      <div className="flex items-baseline gap-2 min-w-0">
        <h3 className="text-sm font-semibold shrink-0">{title}</h3>
        <p className="text-xs text-muted-foreground truncate" title={hint}>{hint}</p>
      </div>
      <Separator />
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function NewRecordSheet() {
  const open = useUiStore(s => s.createRecordDialogOpen)
  const setOpen = useUiStore(s => s.setCreateRecordDialogOpen)
  const selectedAreas = useFilterStore(s => s.selectedAreas)
  const fallbackArea: Area = selectedAreas[0] ?? 'actual'
  const { checkPermission, selectedWorkspaceIds } = useWorkspaceStore()
  const primaryWorkspace = useWorkspaceStore(s => s.getPrimaryWorkspace())
  const bankAccounts = primaryWorkspace?.bank_accounts ?? []
  const primaryBankAccountId = primaryWorkspace?.bank_account_id
  const { createRecord, bulkCreateRecords, isCreating, isBulkCreating, primaryWorkspaceId } = useRecords()

  const [area, setArea] = useState<Area>(fallbackArea)
  const [installments, setInstallments] = useState<Installment[]>([])

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
    defaultValues: defaultFormValues(fallbackArea),
  })

  const sign = watch('sign')
  const amount = watch('amount')
  const vat = watch('vat')
  const total = watch('total')
  const dateCashflow = watch('date_cashflow')
  const stage = watch('stage')
  const note = watch('note')
  const repeatEnabled = watch('repeat_enabled')
  const repeatCount = watch('repeat_count') ?? 2
  const repeatIntervalValue = watch('repeat_interval_value') ?? 1
  const repeatIntervalUnit = watch('repeat_interval_unit') ?? 'months'
  const repeatMode = watch('repeat_mode') ?? 'clone'
  const repeatPreset = watch('repeat_preset') ?? 'equal'

  const activeDist: DistPreset = getActiveDist(repeatMode, repeatCount, repeatPreset)
  const activeCad: CadPreset = getActiveCad(repeatCount, repeatIntervalValue, repeatIntervalUnit, repeatMode, repeatPreset)

  const applyDist = {
    clone: () => {
      setValue('repeat_mode', 'clone')
    },
    equal: () => {
      setValue('repeat_mode', 'split')
      setValue('repeat_preset', 'equal')
    },
    '50-50': () => {
      setValue('repeat_mode', 'split')
      setValue('repeat_preset', '50-50')
      setValue('repeat_count', 2)
    },
    '20-80': () => {
      setValue('repeat_mode', 'split')
      setValue('repeat_preset', '20-80')
      setValue('repeat_count', 2)
    },
    '30-70': () => {
      setValue('repeat_mode', 'split')
      setValue('repeat_preset', '30-70')
      setValue('repeat_count', 2)
    },
    '30-40-30': () => {
      setValue('repeat_mode', 'split')
      setValue('repeat_preset', '30-40-30')
      setValue('repeat_count', 3)
    },
    custom: () => {
      setValue('repeat_preset', 'custom')
    },
  }

  const applyCad = {
    '1/12': () => {
      setValue('repeat_mode', 'split')
      setValue('repeat_preset', 'equal')
      setValue('repeat_count', 12)
      setValue('repeat_interval_value', 1)
      setValue('repeat_interval_unit', 'months')
    },
    '1/24': () => {
      setValue('repeat_mode', 'split')
      setValue('repeat_preset', 'equal')
      setValue('repeat_count', 24)
      setValue('repeat_interval_value', 1)
      setValue('repeat_interval_unit', 'months')
    },
    '1/36': () => {
      setValue('repeat_mode', 'split')
      setValue('repeat_preset', 'equal')
      setValue('repeat_count', 36)
      setValue('repeat_interval_value', 1)
      setValue('repeat_interval_unit', 'months')
    },
    monthly: () => {
      setValue('repeat_interval_value', 1)
      setValue('repeat_interval_unit', 'months')
    },
    bimonthly: () => {
      setValue('repeat_interval_value', 2)
      setValue('repeat_interval_unit', 'months')
    },
    quarterly: () => {
      setValue('repeat_interval_value', 3)
      setValue('repeat_interval_unit', 'months')
    },
    semestral: () => {
      setValue('repeat_interval_value', 6)
      setValue('repeat_interval_unit', 'months')
    },
    annual: () => {
      setValue('repeat_interval_value', 12)
      setValue('repeat_interval_unit', 'months')
    },
    custom: () => {
      setValue('repeat_interval_unit', 'days')
    },
  }

  useEffect(() => {
    if (open) {
      reset(defaultFormValues(fallbackArea))
      setArea(fallbackArea)
      setInstallments([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    setValue('stage', STAGES[area]?.[0] ?? '0')
  }, [area, setValue])

  const baseAmountNum = useMemo(() => {
    const a = parseFloat(amount || '0') || 0
    return sign === 'out' ? -Math.abs(a) : Math.abs(a)
  }, [amount, sign])

  const baseTotalNum = useMemo(() => {
    const t = parseFloat(total || '0') || 0
    return sign === 'out' ? -Math.abs(t) : Math.abs(t)
  }, [total, sign])

  const vatPercent = useMemo(() => parseFloat(vat || '0') || 0, [vat])

  useEffect(() => {
    if (!repeatEnabled) {
      setInstallments([])
      return
    }
    const next = generateInstallments({
      baseDate: dateCashflow || new Date().toISOString().split('T')[0],
      baseAmount: baseAmountNum,
      baseTotal: baseTotalNum,
      vatPercent,
      count: Math.max(2, Math.min(60, Math.floor(repeatCount))),
      intervalValue: Math.max(1, Math.floor(repeatIntervalValue)),
      intervalUnit: repeatIntervalUnit,
      mode: repeatMode,
      preset: repeatPreset,
    })
    setInstallments(next)
  }, [
    repeatEnabled,
    repeatCount,
    repeatIntervalValue,
    repeatIntervalUnit,
    repeatMode,
    repeatPreset,
    baseAmountNum,
    baseTotalNum,
    vatPercent,
    dateCashflow,
  ])

  const totals = useMemo(() => {
    const totalAmount = installments.reduce((s, i) => s + i.amount, 0)
    const totalTotal = installments.reduce((s, i) => s + i.total, 0)
    const totalPercent = installments.reduce((s, i) => s + i.splitPercent, 0)
    return {
      totalAmount,
      totalTotal,
      totalPercent,
      deltaAmount: totalAmount - baseAmountNum,
      deltaTotal: totalTotal - baseTotalNum,
    }
  }, [installments, baseAmountNum, baseTotalNum])

  const calcTotalFromVat = (a: string | undefined, v: string | undefined) => {
    const an = parseFloat(a ?? '') || 0
    const vn = parseFloat(v ?? '') || 0
    if (an <= 0) return
    setValue('total', (an * (1 + vn / 100)).toFixed(2))
  }
  const calcAmountFromTotal = (t: string | undefined, v: string | undefined) => {
    const tn = parseFloat(t ?? '') || 0
    const vn = parseFloat(v ?? '') || 0
    if (tn === 0) return
    setValue('amount', (tn / (1 + vn / 100)).toFixed(2))
  }

  const canCreate = checkPermission(area, sign as Sign, 'can_create')
  const stages = STAGES[area] ?? []

  const updateInstallment = (
    index: number,
    field: 'date' | 'splitPercent' | 'amount' | 'vatPercent' | 'total',
    value: string | number,
  ) => {
    setInstallments(prev =>
      prev.map((inst, i) =>
        i !== index
          ? inst
          : recalcInstallmentField(
              inst,
              field,
              value,
              Math.abs(baseAmountNum),
              baseAmountNum < 0 ? -1 : 1,
            ),
      ),
    )
  }

  const buildRecordCreate = (
    base: FormData,
    overrides: Partial<Pick<RecordCreate, 'date_cashflow' | 'date_offer' | 'amount' | 'vat' | 'total' | 'review_date' | 'transaction_id'>>,
  ): RecordCreate => {
    const amountNum = parseFloat(base.amount) || 0
    const totalNum = parseFloat(base.total) || 0
    const vatPct = base.vat || (amountNum > 0 ? (((totalNum - amountNum) / amountNum) * 100).toFixed(0) : '0')
    const signMultiplier = base.sign === 'out' ? -1 : 1
    const signedAmount = (amountNum * signMultiplier).toString()
    const signedTotal = (totalNum * signMultiplier).toString()
    const vatDeduction = base.vat_deduction || '100'
    const withholdingRate = base.withholding_rate && parseFloat(base.withholding_rate) > 0
      ? base.withholding_rate
      : undefined

    return {
      area,
      type: 'standard',
      account: base.account,
      reference: base.reference,
      transaction_id: overrides.transaction_id ?? base.transaction_id,
      note: base.note || undefined,
      date_cashflow: overrides.date_cashflow ?? base.date_cashflow,
      date_offer: overrides.date_offer ?? base.date_offer,
      date_document: base.date_document || undefined,
      owner: base.owner || undefined,
      nextaction: base.nextaction || undefined,
      review_date: overrides.review_date ?? (base.review_date || undefined),
      project_code: base.project_code || undefined,
      amount: overrides.amount ?? signedAmount,
      vat: overrides.vat ?? vatPct,
      vat_deduction: vatDeduction,
      vat_month: base.vat_month || undefined,
      withholding_rate: withholdingRate,
      total: overrides.total ?? signedTotal,
      stage: base.stage,
      bank_account_id: base.bank_account_id || undefined,
    }
  }

  const handleClose = () => {
    setOpen(false)
  }

  const showError = (error: unknown, fallback: string) => {
    const ax = error as AxiosError<{ error?: string; message?: string; detail?: Array<{ msg: string; loc: string[] }> | string }>
    let message = fallback
    if (ax.response?.data?.error) message = ax.response.data.error
    else if (ax.response?.data?.message) message = ax.response.data.message
    else if (ax.response?.data?.detail) {
      const d = ax.response.data.detail
      message = Array.isArray(d) ? d.map(x => `${x.loc?.join('.')}: ${x.msg}`).join(', ') : d
    }
    toast({ title: 'Errore', description: message, variant: 'destructive' })
  }

  const onSubmit = async (data: FormData) => {
    if (!primaryWorkspaceId) {
      toast({ title: 'Errore', description: 'Nessun workspace selezionato', variant: 'destructive' })
      return
    }
    try {
      if (!data.repeat_enabled) {
        const payload = buildRecordCreate(data, {})
        await createRecord(payload)
        toast({ title: 'Record creato', variant: 'success' })
      } else {
        if (installments.length < 2) {
          toast({ title: 'Errore', description: 'Inserisci almeno 2 ripetizioni', variant: 'destructive' })
          return
        }
        const records: RecordCreate[] = installments.map((inst, i) => {
          const dateOffer = data.date_offer
            ? new Date(new Date(data.date_offer).getTime() + (new Date(inst.date).getTime() - new Date(data.date_cashflow).getTime()))
                .toISOString()
                .split('T')[0]
            : inst.date
          const reviewDate = data.review_date
            ? new Date(new Date(data.review_date).getTime() + (new Date(inst.date).getTime() - new Date(data.date_cashflow).getTime()))
                .toISOString()
                .split('T')[0]
            : undefined
          const txBase = data.transaction_id ? ` ${data.transaction_id}` : ''
          return buildRecordCreate(data, {
            date_cashflow: inst.date,
            date_offer: dateOffer,
            review_date: reviewDate,
            amount: inst.amount.toString(),
            total: inst.total.toString(),
            vat: Math.abs(inst.total - inst.amount).toFixed(2),
            transaction_id: `(${i + 1}/${installments.length})${txBase}`,
          })
        })
        await bulkCreateRecords(records)
        toast({ title: `${records.length} record creati`, variant: 'success' })
      }
      setOpen(false)
    } catch (e) {
      showError(e, 'Errore durante la creazione del record.')
    }
  }

  const submitting = isCreating || isBulkCreating

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent
        side="bottom"
        hideCloseButton
        className="h-[min(92vh,900px)] flex flex-col p-0 sm:max-w-none"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
        <SheetHeader className="px-6 py-2 border-b flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-baseline gap-3 min-w-0 flex-1">
              <SheetTitle className="shrink-0">Nuovo Record</SheetTitle>
              <SheetDescription className="truncate" title="Scegli prima l'area: dove sta questo movimento nel tuo flusso? Poi compila il resto.">
                Scegli prima l'area: dove sta questo movimento nel tuo flusso? Poi compila il resto.
              </SheetDescription>
            </div>
            {!canCreate && sign && (
              <span
                className="hidden md:flex items-center gap-1 text-xs text-amber-600 shrink-0"
                title={`Non hai i permessi per creare record ${sign === 'in' ? 'in entrata' : 'in uscita'} in ${AREA_LABELS[area]}`}
              >
                <AlertCircle className="h-3.5 w-3.5" />
                Permessi mancanti
              </span>
            )}
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={handleClose}>
                Annulla
              </Button>
              <Button type="submit" size="sm" disabled={submitting || !canCreate} data-tour="form-submit">
                {submitting
                  ? 'Salvataggio...'
                  : repeatEnabled
                    ? <><RepeatIcon className="h-4 w-4 mr-1" />Crea {installments.length} voci</>
                    : 'Crea'}
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="px-4 py-3 border-b flex-shrink-0 grid grid-cols-2 md:grid-cols-4 gap-2">
          {AREAS.map(a => {
            const selected = area === a
            return (
              <button
                key={a}
                type="button"
                onClick={() => setArea(a)}
                className={cn(
                  'text-left rounded-lg border-2 p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
                  selected
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted/50',
                )}
                aria-pressed={selected}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={cn('text-sm font-semibold', selected && 'text-primary')}>
                    {AREA_LABELS[a]}
                  </span>
                  <span
                    className={cn(
                      'inline-flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors',
                      selected ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                    )}
                  >
                    {selected && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-snug">
                  {AREA_DESCRIPTIONS[a]}
                </p>
              </button>
            )
          })}
        </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_320px]">
          <div className="overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-3 min-w-0">
            <Zone title="Tipo movimento" hint="Definisci cosa è e con chi avviene lo scambio.">
              <div className="space-y-1" data-tour="form-sign">
                <Label>Tipo</Label>
                <div className="flex gap-1">
                  {SIGN_OPTIONS.map(opt => {
                    const v = opt.value as Sign
                    const allowed = checkPermission(area, v, 'can_create')
                    return (
                      <Button
                        key={opt.value}
                        type="button"
                        size="sm"
                        variant={sign === opt.value ? (opt.value === 'in' ? 'default' : 'destructive') : 'outline'}
                        onClick={() => setValue('sign', opt.value as 'in' | 'out')}
                        className="flex-1"
                        disabled={!allowed}
                        title={!allowed ? `Non autorizzato per ${opt.label}` : undefined}
                      >
                        {opt.label}
                      </Button>
                    )
                  })}
                </div>
                {errors.sign && <p className="text-xs text-destructive">{errors.sign.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="nrs-account">Conto</Label>
                <AutocompleteInput
                  id="nrs-account"
                  field="account"
                  workspaceIds={selectedWorkspaceIds}
                  value={watch('account') ?? ''}
                  onChange={v => setValue('account', v, { shouldValidate: true })}
                  onBlur={() => trigger('account')}
                />
                {errors.account && <p className="text-xs text-destructive">{errors.account.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="nrs-reference">Riferimento</Label>
                <AutocompleteInput
                  id="nrs-reference"
                  field="reference"
                  workspaceIds={selectedWorkspaceIds}
                  value={watch('reference') ?? ''}
                  onChange={v => setValue('reference', v, { shouldValidate: true })}
                  onBlur={() => trigger('reference')}
                />
                {errors.reference && <p className="text-xs text-destructive">{errors.reference.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="nrs-transaction_id">ID Transazione</Label>
                  <Input id="nrs-transaction_id" {...register('transaction_id')} />
                  {errors.transaction_id && <p className="text-xs text-destructive">{errors.transaction_id.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nrs-project_code">Codice Progetto</Label>
                  <AutocompleteInput
                    id="nrs-project_code"
                    field="project_code"
                    workspaceIds={selectedWorkspaceIds}
                    value={watch('project_code') ?? ''}
                    onChange={v => setValue('project_code', v)}
                    placeholder="es. PROJ-001"
                  />
                </div>
              </div>
            </Zone>

            <Zone title="Stato e conto" hint="Dove sta nel flusso e su quale conto bancario va.">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1" data-tour="form-stage">
                  <Label>Stato</Label>
                  <div className="flex gap-1">
                    {stages.map(s => (
                      <Button
                        key={s}
                        type="button"
                        size="sm"
                        variant={stage === s ? (s === '1' ? 'default' : 'destructive') : 'outline'}
                        onClick={() => setValue('stage', s)}
                        className="flex-1"
                      >
                        {STAGE_LABELS_BY_AREA[area]?.[s] || s}
                      </Button>
                    ))}
                  </div>
                  {errors.stage && <p className="text-xs text-destructive">{errors.stage.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Conto Bancario</Label>
                  <Select
                    value={watch('bank_account_id') || '__none__'}
                    onValueChange={(v) => setValue('bank_account_id', v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Default workspace" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Default workspace</SelectItem>
                      {bankAccounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name}{acc.bank_name ? ` — ${acc.bank_name}` : ''}
                          {acc.id === primaryBankAccountId && (
                            <span className="ml-1 text-xs text-muted-foreground">★</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Zone>
          </div>

          <div className="flex flex-col gap-3 min-w-0">
            <Zone title="Date" hint="Offerta = quando nasce. Cashflow = quando incide sulla cassa.">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="nrs-date_offer">Data Offerta</Label>
                  <Input id="nrs-date_offer" type="date" {...register('date_offer')} />
                  {errors.date_offer && <p className="text-xs text-destructive">{errors.date_offer.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nrs-date_document">Data Documento</Label>
                  <Input id="nrs-date_document" type="date" {...register('date_document')} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nrs-date_cashflow">Data Cashflow</Label>
                  <Input id="nrs-date_cashflow" type="date" {...register('date_cashflow')} />
                  {errors.date_cashflow && <p className="text-xs text-destructive">{errors.date_cashflow.message}</p>}
                </div>
              </div>
            </Zone>

            <Zone title="Importi" hint="Imponibile, IVA% e totale: si autocompletano fra loro.">
              <div className="grid grid-cols-[1fr_4rem_1fr] gap-2">
                <div className="space-y-1">
                  <Label htmlFor="nrs-amount">Imponibile</Label>
                  <Input
                    id="nrs-amount"
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => {
                      setValue('amount', e.target.value, { shouldValidate: true })
                      calcTotalFromVat(e.target.value, vat)
                    }}
                  />
                  {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nrs-vat">IVA %</Label>
                  <Input
                    id="nrs-vat"
                    type="number"
                    step="1"
                    value={vat}
                    onChange={(e) => {
                      setValue('vat', e.target.value)
                      calcTotalFromVat(amount, e.target.value)
                    }}
                    className="px-1 text-center"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nrs-total">Totale</Label>
                  <Input
                    id="nrs-total"
                    type="number"
                    step="0.01"
                    value={total}
                    onChange={(e) => {
                      setValue('total', e.target.value, { shouldValidate: true })
                      calcAmountFromTotal(e.target.value, vat)
                    }}
                  />
                  {errors.total && <p className="text-xs text-destructive">{errors.total.message}</p>}
                </div>
              </div>
            </Zone>

            <Zone title="Revisione zero" hint="Cosa fare dopo, chi rivede e quando rivederlo.">
              <div className="space-y-1">
                <Label htmlFor="nrs-nextaction">Prossima Azione</Label>
                <AutocompleteInput
                  id="nrs-nextaction"
                  field="nextaction"
                  workspaceIds={selectedWorkspaceIds}
                  value={watch('nextaction') ?? ''}
                  onChange={v => setValue('nextaction', v)}
                  placeholder="Azione"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="nrs-owner">Responsabile</Label>
                  <AutocompleteInput
                    id="nrs-owner"
                    field="owner"
                    workspaceIds={selectedWorkspaceIds}
                    value={watch('owner') ?? ''}
                    onChange={v => setValue('owner', v)}
                    placeholder="Nome"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nrs-review_date">Prossima Revisione</Label>
                  <Input id="nrs-review_date" type="date" {...register('review_date')} />
                </div>
              </div>
            </Zone>
          </div>

            <Zone
              title="Ripeti"
              hint="Affitti, stipendi, abbonamenti: crea le voci future in un colpo solo."
              className="md:col-span-2"
            >
              <div className="flex items-center gap-3">
                <Switch
                  id="nrs-repeat-enabled"
                  checked={repeatEnabled}
                  onCheckedChange={(v) => setValue('repeat_enabled', v)}
                />
                <Label htmlFor="nrs-repeat-enabled" className="cursor-pointer">
                  Crea voci ripetute
                </Label>
                {repeatEnabled && (
                  <span className="text-xs text-muted-foreground">
                    Verranno create {installments.length} voci totali.
                  </span>
                )}
              </div>

              {repeatEnabled && (
                <>
                  {/* Distribuzione */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground mr-1 self-center w-16">Importo</span>
                    <Chip active={activeDist === 'clone'} onClick={applyDist.clone}>Clona</Chip>
                    <Chip active={activeDist === 'equal'} onClick={applyDist.equal}>Equa</Chip>
                    <Chip active={activeDist === '50-50'} onClick={applyDist['50-50']}>50/50</Chip>
                    <Chip active={activeDist === '20-80'} onClick={applyDist['20-80']}>20/80</Chip>
                    <Chip active={activeDist === '30-70'} onClick={applyDist['30-70']}>30/70</Chip>
                    <Chip active={activeDist === '30-40-30'} onClick={applyDist['30-40-30']}>30/40/30</Chip>
                    <Chip active={activeDist === 'custom'} onClick={applyDist.custom}>Custom…</Chip>
                  </div>

                  {/* Cadenza */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground mr-1 self-center w-16">Cadenza</span>
                    <Chip active={activeCad === '1/12'} onClick={applyCad['1/12']}>1/12</Chip>
                    <Chip active={activeCad === '1/24'} onClick={applyCad['1/24']}>1/24</Chip>
                    <Chip active={activeCad === '1/36'} onClick={applyCad['1/36']}>1/36</Chip>
                    <Chip active={activeCad === 'monthly'} onClick={applyCad.monthly}>Mensile</Chip>
                    <Chip active={activeCad === 'bimonthly'} onClick={applyCad.bimonthly}>Bimestrale</Chip>
                    <Chip active={activeCad === 'quarterly'} onClick={applyCad.quarterly}>Trimestrale</Chip>
                    <Chip active={activeCad === 'semestral'} onClick={applyCad.semestral}>Semestrale</Chip>
                    <Chip active={activeCad === 'annual'} onClick={applyCad.annual}>Annuale</Chip>
                    <Chip active={activeCad === 'custom'} onClick={applyCad.custom}>Custom…</Chip>
                  </div>

                  {/* Manual controls — visibili solo se Custom selezionato sulla rispettiva riga */}
                  {(activeDist === 'custom' || activeCad === 'custom') && (
                    <div className="flex flex-wrap items-center gap-3 text-sm pt-2 border-t">
                      {activeDist === 'custom' && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs">Numero voci</span>
                          <Input
                            type="number"
                            min={2}
                            max={60}
                            value={repeatCount}
                            onChange={(e) => setValue('repeat_count', Math.max(2, Math.min(60, parseInt(e.target.value) || 2)))}
                            className="w-20 h-9"
                            aria-label="Numero voci"
                          />
                        </div>
                      )}
                      {activeCad === 'custom' && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs">Ogni</span>
                          <Input
                            type="number"
                            min={1}
                            value={repeatIntervalValue}
                            onChange={(e) => setValue('repeat_interval_value', Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-16 h-9"
                            aria-label="Intervallo"
                          />
                          <Select
                            value={repeatIntervalUnit}
                            onValueChange={(v) => setValue('repeat_interval_unit', v as IntervalUnit)}
                          >
                            <SelectTrigger className="w-32 h-9" aria-label="Unità">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="days">giorni</SelectItem>
                              <SelectItem value="weeks">settimane</SelectItem>
                              <SelectItem value="months">mesi</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-64 overflow-y-auto overflow-x-auto">
                      <table className="w-full text-sm table-fixed">
                        <colgroup>
                          <col className="w-12" />
                          <col className="w-40" />
                          <col className="w-24" />
                          <col />
                          <col className="w-20" />
                          <col />
                        </colgroup>
                        <thead className="bg-muted sticky top-0 z-10">
                          <tr>
                            <th className="text-left font-medium px-2 py-2 whitespace-nowrap">#</th>
                            <th className="text-left font-medium px-2 py-2 whitespace-nowrap">Data</th>
                            <th className="text-right font-medium px-2 py-2 whitespace-nowrap">%</th>
                            <th className="text-right font-medium px-2 py-2 whitespace-nowrap">Imponibile</th>
                            <th className="text-right font-medium px-2 py-2 whitespace-nowrap">% IVA</th>
                            <th className="text-right font-medium px-2 py-2 whitespace-nowrap">Totale</th>
                          </tr>
                        </thead>
                        <tbody>
                          {installments.map((inst, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted-foreground align-middle">
                                {idx + 1}/{installments.length}
                              </td>
                              <td className="px-2 py-1.5 align-middle">
                                <Input
                                  type="date"
                                  value={inst.date}
                                  onChange={(e) => updateInstallment(idx, 'date', e.target.value)}
                                  className="h-7 w-full"
                                />
                              </td>
                              <td className="px-2 py-1.5 align-middle">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={inst.splitPercent}
                                  onChange={(e) => updateInstallment(idx, 'splitPercent', e.target.value)}
                                  className="h-7 w-full text-right"
                                  disabled={repeatMode === 'clone'}
                                />
                              </td>
                              <td className="px-2 py-1.5 align-middle">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={inst.amount}
                                  onChange={(e) => updateInstallment(idx, 'amount', e.target.value)}
                                  className="h-7 w-full text-right"
                                />
                              </td>
                              <td className="px-2 py-1.5 align-middle">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={inst.vatPercent}
                                  onChange={(e) => updateInstallment(idx, 'vatPercent', e.target.value)}
                                  className="h-7 w-full text-right"
                                />
                              </td>
                              <td className="px-2 py-1.5 align-middle">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={inst.total}
                                  onChange={(e) => updateInstallment(idx, 'total', e.target.value)}
                                  className="h-7 w-full text-right"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-muted border-t sticky bottom-0 z-10 shadow-[0_-1px_2px_rgba(0,0,0,0.05)]">
                          <tr>
                            <td className="px-2 py-2 text-xs font-medium" colSpan={2}>Totali</td>
                            <td className="px-2 py-2 text-right">
                              {repeatMode === 'split' ? (
                                <span className={cn('text-xs font-medium', Math.abs(totals.totalPercent - 100) > 0.05 ? 'text-amber-600' : '')}>
                                  {totals.totalPercent.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <AmountDisplay amount={totals.totalAmount} className="font-medium text-xs" />
                            </td>
                            <td />
                            <td className="px-2 py-2 text-right">
                              <AmountDisplay amount={totals.totalTotal} className="font-medium text-xs" />
                            </td>
                          </tr>
                          {repeatMode === 'split' && (Math.abs(totals.deltaAmount) > 0.01 || Math.abs(totals.deltaTotal) > 0.01) && (
                            <tr>
                              <td className="px-2 py-2 text-xs" colSpan={3}>
                                <span className="flex items-center gap-1 text-amber-600">
                                  <AlertCircle className="h-3.5 w-3.5" /> Delta vs originale
                                </span>
                              </td>
                              <td className="px-2 py-2 text-right text-xs font-medium text-amber-600">
                                {totals.deltaAmount > 0 ? '+' : ''}{totals.deltaAmount.toFixed(2)} €
                              </td>
                              <td />
                              <td className="px-2 py-2 text-right text-xs font-medium text-amber-600">
                                {totals.deltaTotal > 0 ? '+' : ''}{totals.deltaTotal.toFixed(2)} €
                              </td>
                            </tr>
                          )}
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </Zone>
          </div>

          <aside className="border-t lg:border-t-0 lg:border-l flex flex-col min-h-0">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2 flex-shrink-0">
              <Label className="text-sm font-semibold">Note</Label>
              <span className="text-xs text-muted-foreground">Tutto quello che serve sapere su questa voce.</span>
            </div>
            <div className="flex-1 px-4 pb-3 min-h-[160px] lg:min-h-0">
              <MarkdownTextarea
                value={note ?? ''}
                onValueChange={(v) => setValue('note', v)}
                heightClass="h-full"
              />
            </div>
            {sign === 'out' && (
              <div className="border-t px-4 py-3 flex-shrink-0 space-y-2">
                <div className="flex items-baseline gap-2 min-w-0">
                  <div className="text-xs font-semibold shrink-0">Simulazione IVA e ritenuta</div>
                  <p className="text-[11px] text-muted-foreground truncate" title="Compila solo se simuli liquidazioni IVA o F24 ritenute d'acconto.">Solo per simulazioni fiscali.</p>
                </div>
                <div className="grid grid-cols-[3.5rem_1fr_3.5rem] gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="nrs-vat_deduction" className="text-xs">Det. %</Label>
                    <Input id="nrs-vat_deduction" type="number" step="1" min={0} max={100} {...register('vat_deduction')} className="px-1 text-center h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="nrs-vat_month" className="text-xs">Mese IVA</Label>
                    <Input id="nrs-vat_month" type="text" placeholder="YYYY-MM" maxLength={7} {...register('vat_month')} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="nrs-withholding_rate" className="text-xs">Rit. %</Label>
                    <Input id="nrs-withholding_rate" type="number" step="0.01" min={0} max={100} {...register('withholding_rate')} className="px-1 text-center h-8" placeholder="20" />
                  </div>
                </div>
              </div>
            )}
          </aside>
          </div>

        </form>
      </SheetContent>
    </Sheet>
  )
}
