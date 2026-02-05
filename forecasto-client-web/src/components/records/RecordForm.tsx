import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { STAGES, STAGE_LABELS_BY_AREA, SIGN_OPTIONS } from '@/lib/constants'
import type { Record as RecordType, RecordCreate, RecordUpdate, Area } from '@/types/record'
import type { Sign } from '@/types/workspace'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { AlertCircle } from 'lucide-react'

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
  project_code: z.string().optional(),
  vat: z.string().optional(),
  sign: z.enum(['in', 'out'], { message: 'Seleziona entrata o uscita' }),
})

type FormData = z.infer<typeof schema>

interface RecordFormProps {
  record?: RecordType
  area: Area
  onSubmit: (data: RecordCreate | RecordUpdate) => void
  onCancel: () => void
  isLoading?: boolean
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

export function RecordForm({ record, area, onSubmit, onCancel, isLoading }: RecordFormProps) {
  const stages = STAGES[area] || []
  const { checkPermission } = useWorkspaceStore()
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
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      account: record?.account || '',
      reference: record?.reference || '',
      transaction_id: record?.transaction_id || '',
      note: record?.note || '',
      date_cashflow: record?.date_cashflow?.split('T')[0] || '',
      date_offer: record?.date_offer?.split('T')[0] || '',
      owner: record?.owner || '',
      amount: record?.amount ? Math.abs(parseFloat(record.amount)).toString() : '',
      total: record?.total ? Math.abs(parseFloat(record.total)).toString() : '',
      vat: (() => {
        if (!record?.amount || !record?.total) return ''
        const a = Math.abs(parseFloat(record.amount))
        const t = Math.abs(parseFloat(record.total))
        if (a <= 0) return '0'
        return (((t - a) / a) * 100).toFixed(1)
      })(),
      stage: normalizeLegacyStage(record?.stage) || stages[0] || '0',
      nextaction: record?.nextaction || '',
      project_code: record?.project_code || '',
      sign: record?.amount ? (parseFloat(record.amount) >= 0 ? 'in' : 'out') : undefined,
    },
  })

  const selectedStage = watch('stage')
  const selectedSign = watch('sign')

  // Track which field (vat or total) was last manually edited
  const [lastEdited, setLastEdited] = useState<'vat' | 'total'>('total')

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

  // Recalculate vat from amount + total
  const calcVatFromTotal = (amount: string, total: string) => {
    const a = parseFloat(amount) || 0
    const t = parseFloat(total) || 0
    if (a <= 0) { setValue('vat', '0'); return }
    setValue('vat', (((t - a) / a) * 100).toFixed(1))
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setValue('amount', val)
    if (lastEdited === 'vat') {
      calcTotalFromVat(val, watch('vat'))
    } else {
      calcVatFromTotal(val, watch('total'))
    }
  }

  const handleVatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setValue('vat', val)
    setLastEdited('vat')
    calcTotalFromVat(watch('amount'), val)
  }

  const handleTotalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setValue('total', val)
    setLastEdited('total')
    calcVatFromTotal(watch('amount'), val)
  }

  const handleFormSubmit = (data: FormData) => {
    const amountNum = parseFloat(data.amount) || 0
    const totalNum = parseFloat(data.total) || 0
    const vat = data.vat || (amountNum > 0 ? (((totalNum - amountNum) / amountNum) * 100).toFixed(1) : '0')

    // Apply sign: out = negative
    const signMultiplier = data.sign === 'out' ? -1 : 1
    const signedAmount = (amountNum * signMultiplier).toString()
    const signedTotal = (totalNum * signMultiplier).toString()

    // Remove sign and vat from data (UI-only fields)
    const { sign, vat: _vat, ...submitData } = data

    if (record) {
      onSubmit({ ...submitData, amount: signedAmount, total: signedTotal, vat } as RecordUpdate)
    } else {
      // Add default type for new records
      onSubmit({ ...submitData, area, amount: signedAmount, total: signedTotal, vat, type: 'standard' } as RecordCreate)
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-3">
      {/* Row 1: Conto, Riferimento, ID Transazione */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label htmlFor="account">Conto</Label>
          <Input id="account" {...register('account')} />
          {errors.account && <p className="text-sm text-destructive">{errors.account.message}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="reference">Riferimento</Label>
          <Input id="reference" {...register('reference')} />
          {errors.reference && <p className="text-sm text-destructive">{errors.reference.message}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="transaction_id">ID Transazione</Label>
          <Input id="transaction_id" {...register('transaction_id')} />
          {errors.transaction_id && <p className="text-sm text-destructive">{errors.transaction_id.message}</p>}
        </div>
      </div>

      {/* Row 2: Date + Responsabile + Prossima Azione + Progetto */}
      <div className="grid grid-cols-5 gap-4">
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

        <div className="space-y-1">
          <Label htmlFor="owner">Responsabile</Label>
          <Input id="owner" {...register('owner')} placeholder="Nome" />
        </div>

        <div className="space-y-1">
          <Label htmlFor="nextaction">Prossima Azione</Label>
          <Input id="nextaction" {...register('nextaction')} placeholder="Azione" />
        </div>

        <div className="space-y-1">
          <Label htmlFor="project_code">Codice Progetto</Label>
          <Input id="project_code" {...register('project_code')} placeholder="es. PROJ-001" />
        </div>
      </div>

      {/* Row 3: Importi + Stato */}
      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-1">
          <Label htmlFor="amount">Imponibile</Label>
          <Input id="amount" type="number" step="0.01" value={watch('amount')} onChange={handleAmountChange} />
          {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="vat">IVA %</Label>
          <Input id="vat" type="number" step="0.1" value={watch('vat')} onChange={handleVatChange} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="total">Totale</Label>
          <Input id="total" type="number" step="0.01" value={watch('total')} onChange={handleTotalChange} />
          {errors.total && <p className="text-sm text-destructive">{errors.total.message}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="stage">Stato</Label>
          <Select value={selectedStage} onValueChange={(v) => setValue('stage', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {STAGE_LABELS_BY_AREA[area]?.[stage] || stage}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.stage && <p className="text-sm text-destructive">{errors.stage.message}</p>}
        </div>
      </div>

      {/* Row 4: Note */}
      <div className="space-y-1">
        <Label htmlFor="note">Note</Label>
        <Textarea id="note" {...register('note')} rows={2} />
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Tipo:</Label>
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
                  className="min-w-[100px]"
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

        <div className="flex items-center gap-2">
          {selectedSign && !canPerformAction && (
            <div className="flex items-center gap-1 text-sm text-amber-600">
              <AlertCircle className="h-4 w-4" />
              <span>{noPermissionMessage}</span>
            </div>
          )}
          <Button type="button" variant="outline" onClick={onCancel}>
            Annulla
          </Button>
          <Button type="submit" disabled={isLoading || !canPerformAction}>
            {isLoading ? 'Salvataggio...' : record ? 'Aggiorna' : 'Crea'}
          </Button>
        </div>
      </div>
    </form>
  )
}
