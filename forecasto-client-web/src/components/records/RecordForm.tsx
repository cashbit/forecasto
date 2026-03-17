import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { STAGES, STAGE_LABELS_BY_AREA, SIGN_OPTIONS, AREA_LABELS } from '@/lib/constants'
import type { Record as RecordType, RecordCreate, RecordUpdate, Area } from '@/types/record'
import type { Sign } from '@/types/workspace'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { AlertCircle, X, ArrowRight, Maximize2, Minimize2 } from 'lucide-react'
import { MarkdownTextarea } from '@/components/common/MarkdownTextarea'
import { bankAccountsApi } from '@/api/bank-accounts'

const schema = z.object({
  account: z.string().min(1, 'Conto obbligatorio'),
  reference: z.string().min(1, 'Riferimento obbligatorio'),
  transaction_id: z.string().min(1, 'ID Transazione obbligatorio'),
  note: z.string().optional(),
  date_cashflow: z.string().min(1, 'Data cashflow obbligatoria'),
  date_offer: z.string().min(1, 'Data offerta obbligatoria'),
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
  bank_account_id: z.string().optional(),
  sign: z.enum(['in', 'out'], { message: 'Seleziona entrata o uscita' }),
})

type FormData = z.infer<typeof schema>

interface RecordFormProps {
  record?: RecordType
  area: Area
  onSubmit: (data: RecordCreate | RecordUpdate) => void
  onCancel: () => void
  onClose: () => void
  isLoading?: boolean
  reviewMode?: boolean
  onReview?: (days: number, data: RecordUpdate) => void
  onPromote?: (recordId: string, toArea: Area, data: RecordUpdate) => void
}

// Map legacy stage values to 0/1
const normalizeLegacyStage = (stage?: string): string => {
  const legacyMap: Record<string, string> = {
    unpaid: '0',
    paid: '1',
    draft: '0',
    approved: '1',
  }
  return stage ? (legacyMap[stage] || stage) : '0'
}

const NEXT_AREA: Partial<Record<string, Area>> = {
  budget: 'prospect',
  prospect: 'orders',
  orders: 'actual',
}

export function RecordForm({ record, area, onSubmit, onCancel, onClose, isLoading, reviewMode, onReview, onPromote }: RecordFormProps) {
  const recordArea = record?.area || area
  const nextArea = NEXT_AREA[recordArea]
  const stages = STAGES[area] || []
  const { checkPermission, selectedWorkspaceIds } = useWorkspaceStore()
  const { user } = useAuthStore()

  // Check permissions for create/edit
  const isEditing = !!record
  const getCanCreate = (sign: Sign) => checkPermission(area, sign, 'can_create')
  const getCanEdit = (sign: Sign) => {
    if (!record) return true
    return checkPermission(area, sign, 'can_edit_others', record.created_by, user?.id)
  }

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      account: record?.account || '',
      reference: record?.reference || '',
      transaction_id: record?.transaction_id || '',
      note: record?.note || '',
      date_cashflow: record?.date_cashflow?.split('T')[0] || '',
      date_offer: record?.date_offer?.split('T')[0] || new Date().toISOString().split('T')[0],
      owner: record?.owner || '',
      amount: record?.amount ? Math.abs(parseFloat(record.amount)).toString() : '',
      total: record?.total ? Math.abs(parseFloat(record.total)).toString() : '',
      vat: (() => {
        if (!record?.amount || !record?.total) return ''
        const a = Math.abs(parseFloat(record.amount))
        const t = Math.abs(parseFloat(record.total))
        if (a <= 0) return '0'
        return (((t - a) / a) * 100).toFixed(0)
      })(),
      stage: normalizeLegacyStage(record?.stage) || stages[0] || '0',
      nextaction: record?.nextaction || '',
      review_date: record?.review_date?.split('T')[0] || '',
      vat_deduction: record?.vat_deduction ? parseFloat(record.vat_deduction).toFixed(0) : '100',
      vat_month: record?.vat_month || '',
      project_code: record?.project_code || '',
      bank_account_id: record?.bank_account_id || '',
      sign: record?.amount ? (parseFloat(record.amount) >= 0 ? 'in' : 'out') : undefined,
    },
  })

  const selectedStage = watch('stage')
  const selectedSign = watch('sign')

  // Track which field (vat or total) was last manually edited
  const [noteExpanded, setNoteExpanded] = useState(false)

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankAccountsApi.listUserAccounts(),
    staleTime: 60000,
  })

  // Check permission based on selected sign
  const canPerformAction = selectedSign
    ? (isEditing ? getCanEdit(selectedSign) : getCanCreate(selectedSign))
    : false
  const noPermissionMessage = selectedSign
    ? (isEditing
        ? `Non hai i permessi per modificare record ${selectedSign === 'in' ? 'in entrata' : 'in uscita'} di altri utenti in quest'area`
        : `Non hai i permessi per creare record ${selectedSign === 'in' ? 'in entrata' : 'in uscita'} in quest'area`)
    : null

  // Recalculate total from amount + vat
  const calcTotalFromVat = (amount: string, vat: string) => {
    const a = parseFloat(amount) || 0
    const v = parseFloat(vat) || 0
    if (a <= 0) return
    setValue('total', (a * (1 + v / 100)).toFixed(2))
  }

  // Recalculate amount from total + vat%
  const calcAmountFromTotal = (total: string, vat: string) => {
    const t = parseFloat(total) || 0
    const v = parseFloat(vat) || 0
    if (t === 0) return
    setValue('amount', (t / (1 + v / 100)).toFixed(2))
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setValue('amount', val)
    calcTotalFromVat(val, watch('vat'))
  }

  const handleVatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setValue('vat', val)
    calcTotalFromVat(watch('amount'), val)
  }

  const handleTotalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setValue('total', val)
    calcAmountFromTotal(val, watch('vat'))
  }

  const processFormData = (data: FormData) => {
    const amountNum = parseFloat(data.amount) || 0
    const totalNum = parseFloat(data.total) || 0
    const vat = data.vat || (amountNum > 0 ? (((totalNum - amountNum) / amountNum) * 100).toFixed(0) : '0')

    // Apply sign: out = negative
    const signMultiplier = data.sign === 'out' ? -1 : 1
    const signedAmount = (amountNum * signMultiplier).toString()
    const signedTotal = (totalNum * signMultiplier).toString()

    const vatDeduction = data.vat_deduction || '100'

    // Remove sign and vat from data (UI-only fields); normalize bank_account_id empty string to undefined
    const { sign, vat: _vat, vat_deduction: _vatDed, vat_month, review_date, bank_account_id, ...submitData } = data

    // In create mode: '' → undefined (don't send field)
    // In update mode: '' → null (explicitly clear the field on server)
    const normalizedBankAccountId = bank_account_id
      ? bank_account_id
      : record ? null : undefined

    return { submitData, signedAmount, signedTotal, vat, vatDeduction, vatMonth: vat_month || undefined, review_date, bank_account_id: normalizedBankAccountId }
  }

  const handleFormSubmit = (data: FormData) => {
    const { submitData, signedAmount, signedTotal, vat, vatDeduction, vatMonth, review_date, bank_account_id } = processFormData(data)

    if (record) {
      onSubmit({ ...submitData, amount: signedAmount, total: signedTotal, vat, vat_deduction: vatDeduction, vat_month: vatMonth, review_date: review_date || undefined, bank_account_id } as RecordUpdate)
    } else {
      // Add default type for new records
      onSubmit({ ...submitData, area, amount: signedAmount, total: signedTotal, vat, vat_deduction: vatDeduction, vat_month: vatMonth, review_date: review_date || undefined, bank_account_id, type: 'standard' } as RecordCreate)
    }
  }

  const handleReviewClick = (days: number) => {
    handleSubmit((data: FormData) => {
      const { submitData, signedAmount, signedTotal, vat, vatDeduction, vatMonth, bank_account_id } = processFormData(data)
      onReview?.(days, { ...submitData, amount: signedAmount, total: signedTotal, vat, vat_deduction: vatDeduction, vat_month: vatMonth, bank_account_id } as RecordUpdate)
    })()
  }

  const handlePromoteClick = (toArea: Area) => {
    if (!record) return
    handleSubmit((data: FormData) => {
      const { submitData, signedAmount, signedTotal, vat, vatDeduction, vatMonth, bank_account_id } = processFormData(data)
      onPromote?.(record.id, toArea, { ...submitData, amount: signedAmount, total: signedTotal, vat, vat_deduction: vatDeduction, vat_month: vatMonth, bank_account_id } as RecordUpdate)
    })()
  }

  return (
    <>
    {/* Note expanded overlay */}
    {noteExpanded && (
      <div className="w-120 border-r flex flex-col bg-background absolute right-full top-0 h-full z-20 shadow-lg">
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <Label className="text-lg font-semibold">Note</Label>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setNoteExpanded(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 p-4 min-h-0">
          <MarkdownTextarea
            value={watch('note') || ''}
            onValueChange={(v) => setValue('note', v)}
          />
        </div>
      </div>
    )}
    <Card className="h-full border-0 rounded-none flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 flex-shrink-0">
        <CardTitle className="text-lg">
          {record ? 'Modifica Record' : 'Nuovo Record'}
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <Separator className="flex-shrink-0" />

      <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col flex-1 min-h-0">
        <CardContent className="pt-4 space-y-3 flex-1 overflow-y-auto">
          {/* Tipo (Entrata/Uscita) */}
          <div className="space-y-1" data-tour="form-sign">
            <Label className="text-sm font-medium">Tipo</Label>
            <div className="flex gap-1">
              {SIGN_OPTIONS.map((option) => {
                const signValue = option.value as Sign
                const canUseSign = isEditing ? getCanEdit(signValue) : getCanCreate(signValue)
                return (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={selectedSign === option.value ? (option.value === 'in' ? 'default' : 'destructive') : 'outline'}
                    onClick={() => setValue('sign', option.value as 'in' | 'out')}
                    className="flex-1"
                    disabled={!canUseSign}
                    title={!canUseSign ? `Non autorizzato per ${option.label}` : undefined}
                  >
                    {option.label}
                  </Button>
                )
              })}
            </div>
            {errors.sign && <p className="text-sm text-destructive">{errors.sign.message}</p>}
          </div>

          {/* Conto */}
          <div className="space-y-1">
            <Label htmlFor="account">Conto</Label>
            <AutocompleteInput
              id="account"
              field="account"
              workspaceIds={selectedWorkspaceIds}
              value={watch('account') ?? ''}
              onChange={v => setValue('account', v, { shouldValidate: true })}
              onBlur={() => trigger('account')}
            />
            {errors.account && <p className="text-sm text-destructive">{errors.account.message}</p>}
          </div>

          {/* Riferimento */}
          <div className="space-y-1">
            <Label htmlFor="reference">Riferimento</Label>
            <AutocompleteInput
              id="reference"
              field="reference"
              workspaceIds={selectedWorkspaceIds}
              value={watch('reference') ?? ''}
              onChange={v => setValue('reference', v, { shouldValidate: true })}
              onBlur={() => trigger('reference')}
            />
            {errors.reference && <p className="text-sm text-destructive">{errors.reference.message}</p>}
          </div>

          {/* ID Transazione */}
          <div className="space-y-1">
            <Label htmlFor="transaction_id">ID Transazione</Label>
            <Input id="transaction_id" {...register('transaction_id')} />
            {errors.transaction_id && <p className="text-sm text-destructive">{errors.transaction_id.message}</p>}
          </div>

          {/* Codice Progetto */}
          <div className="space-y-1">
            <Label htmlFor="project_code">Codice Progetto</Label>
            <AutocompleteInput
              id="project_code"
              field="project_code"
              workspaceIds={selectedWorkspaceIds}
              value={watch('project_code') ?? ''}
              onChange={v => setValue('project_code', v)}
              placeholder="es. PROJ-001"
            />
          </div>

          {/* Data Cashflow + Data Offerta (grid 2 col) */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="date_cashflow">Data Cashflow</Label>
              <Input id="date_cashflow" type="date" {...register('date_cashflow')} />
              {errors.date_cashflow && <p className="text-sm text-destructive">{errors.date_cashflow.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="date_offer">Data Offerta</Label>
              <Input id="date_offer" type="date" {...register('date_offer')} />
              {errors.date_offer && <p className="text-sm text-destructive">{errors.date_offer.message}</p>}
            </div>
          </div>

          {/* Imponibile + IVA% + Totale */}
          <div className="grid grid-cols-[1fr_4rem_1fr] gap-2">
            <div className="space-y-1">
              <Label htmlFor="amount">Imponibile</Label>
              <Input id="amount" type="number" step="0.01" value={watch('amount')} onChange={handleAmountChange} />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="vat">IVA %</Label>
              <Input id="vat" type="number" step="1" value={watch('vat')} onChange={handleVatChange} className="px-1 text-center" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="total">Totale</Label>
              <Input id="total" type="number" step="0.01" value={watch('total')} onChange={handleTotalChange} />
              {errors.total && <p className="text-sm text-destructive">{errors.total.message}</p>}
            </div>
          </div>

          {/* Detrazione IVA + Mese IVA */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="vat_deduction">Detrazione IVA %</Label>
              <Input id="vat_deduction" type="number" step="1" min="0" max="100" {...register('vat_deduction')} className="text-center" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vat_month">Mese IVA</Label>
              <Input id="vat_month" type="month" {...register('vat_month')} />
            </div>
          </div>

          {/* Stato */}
          <div className="space-y-1" data-tour="form-stage">
            <Label>Stato</Label>
            <div className="flex gap-1">
              {stages.map((stage) => (
                <Button
                  key={stage}
                  type="button"
                  size="sm"
                  variant={selectedStage === stage ? (stage === '1' ? 'default' : 'destructive') : 'outline'}
                  onClick={() => setValue('stage', stage)}
                  className="flex-1"
                >
                  {STAGE_LABELS_BY_AREA[area]?.[stage] || stage}
                </Button>
              ))}
            </div>
            {errors.stage && <p className="text-sm text-destructive">{errors.stage.message}</p>}
          </div>

          {/* Responsabile */}
          <div className="space-y-1">
            <Label htmlFor="owner">Responsabile</Label>
            <AutocompleteInput
              id="owner"
              field="owner"
              workspaceIds={selectedWorkspaceIds}
              value={watch('owner') ?? ''}
              onChange={v => setValue('owner', v)}
              placeholder="Nome"
            />
          </div>

          {/* Prossima Azione */}
          <div className="space-y-1">
            <Label htmlFor="nextaction">Prossima Azione</Label>
            <AutocompleteInput
              id="nextaction"
              field="nextaction"
              workspaceIds={selectedWorkspaceIds}
              value={watch('nextaction') ?? ''}
              onChange={v => setValue('nextaction', v)}
              placeholder="Azione"
            />
          </div>

          {/* Prossima Revisione */}
          <div className="space-y-1">
            <Label htmlFor="review_date">Prossima Revisione</Label>
            <Input id="review_date" type="date" {...register('review_date')} />
          </div>

          {/* Note */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="note">Note</Label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setNoteExpanded(!noteExpanded)}
              >
                {noteExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <MarkdownTextarea
              value={watch('note') || ''}
              onValueChange={(v) => setValue('note', v)}
              heightClass="h-20"
            />
          </div>

          {/* Conto Bancario */}
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
                {bankAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name}{acc.bank_name ? ` — ${acc.bank_name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>

        {/* Footer sticky */}
        <div className="flex-shrink-0 p-4 border-t space-y-2">
          {selectedSign && !canPerformAction && (
            <div className="flex items-center gap-1 text-sm text-amber-600">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{noPermissionMessage}</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
              Annulla
            </Button>
            {reviewMode && record && onReview && (
              <>
                <Button type="button" variant="outline" className="bg-amber-50 border-amber-300 hover:bg-amber-100 text-amber-700" onClick={() => handleReviewClick(7)}>
                  Rivedi 7gg
                </Button>
                <Button type="button" variant="outline" className="bg-amber-50 border-amber-300 hover:bg-amber-100 text-amber-700" onClick={() => handleReviewClick(15)}>
                  Rivedi 15gg
                </Button>
              </>
            )}
            {record && nextArea && onPromote && (
              <Button
                type="button"
                variant="outline"
                className="bg-blue-50 border-blue-300 hover:bg-blue-100 text-blue-700"
                onClick={() => handlePromoteClick(nextArea)}
                data-tour="form-promote"
              >
                <ArrowRight className="h-3.5 w-3.5 mr-1" />
                {AREA_LABELS[nextArea]}
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={isLoading || !canPerformAction} data-tour="form-submit">
              {isLoading ? 'Salvataggio...' : record ? 'Aggiorna' : 'Crea'}
            </Button>
          </div>
        </div>
      </form>
    </Card>
    </>
  )
}
