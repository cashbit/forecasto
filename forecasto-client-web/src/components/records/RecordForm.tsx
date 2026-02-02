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
import { STAGES, STAGE_LABELS } from '@/lib/constants'
import type { Record, RecordCreate, RecordUpdate, Area } from '@/types/record'

const schema = z.object({
  type: z.string().min(1, 'Tipo obbligatorio'),
  account: z.string().min(1, 'Conto obbligatorio'),
  reference: z.string().min(1, 'Riferimento obbligatorio'),
  note: z.string().optional(),
  date_cashflow: z.string().min(1, 'Data cashflow obbligatoria'),
  date_offer: z.string().min(1, 'Data offerta obbligatoria'),
  amount: z.string().min(1, 'Importo obbligatorio'),
  vat: z.string().optional(),
  stage: z.string().min(1, 'Stato obbligatorio'),
})

type FormData = z.infer<typeof schema>

interface RecordFormProps {
  record?: Record
  area: Area
  onSubmit: (data: RecordCreate | RecordUpdate) => void
  onCancel: () => void
  isLoading?: boolean
}

export function RecordForm({ record, area, onSubmit, onCancel, isLoading }: RecordFormProps) {
  const stages = STAGES[area] || []

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: record?.type || 'standard',
      account: record?.account || '',
      reference: record?.reference || '',
      note: record?.note || '',
      date_cashflow: record?.date_cashflow?.split('T')[0] || '',
      date_offer: record?.date_offer?.split('T')[0] || '',
      amount: record?.amount || '',
      vat: record?.vat || '22',
      stage: record?.stage || stages[0] || '',
    },
  })

  const selectedStage = watch('stage')

  const handleFormSubmit = (data: FormData) => {
    if (record) {
      onSubmit(data as RecordUpdate)
    } else {
      onSubmit({ ...data, area } as RecordCreate)
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="account">Conto</Label>
          <Input id="account" {...register('account')} />
          {errors.account && <p className="text-sm text-destructive">{errors.account.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">Tipo</Label>
          <Input id="type" {...register('type')} />
          {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reference">Riferimento</Label>
        <Input id="reference" {...register('reference')} />
        {errors.reference && <p className="text-sm text-destructive">{errors.reference.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Note</Label>
        <Textarea id="note" {...register('note')} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="date_cashflow">Data Cashflow</Label>
          <Input id="date_cashflow" type="date" {...register('date_cashflow')} />
          {errors.date_cashflow && (
            <p className="text-sm text-destructive">{errors.date_cashflow.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="date_offer">Data Offerta</Label>
          <Input id="date_offer" type="date" {...register('date_offer')} />
          {errors.date_offer && (
            <p className="text-sm text-destructive">{errors.date_offer.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Imponibile</Label>
          <Input id="amount" type="number" step="0.01" {...register('amount')} />
          {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="vat">IVA %</Label>
          <Input id="vat" type="number" step="1" {...register('vat')} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="stage">Stato</Label>
        <Select value={selectedStage} onValueChange={(v) => setValue('stage', v)}>
          <SelectTrigger>
            <SelectValue placeholder="Seleziona stato" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {STAGE_LABELS[stage] || stage}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.stage && <p className="text-sm text-destructive">{errors.stage.message}</p>}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annulla
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Salvataggio...' : record ? 'Aggiorna' : 'Crea'}
        </Button>
      </div>
    </form>
  )
}
