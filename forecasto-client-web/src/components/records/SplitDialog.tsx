import { useState, useEffect, useMemo } from 'react'
import { Split, Plus, Minus, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AmountDisplay } from '@/components/common/AmountDisplay'
import { cn } from '@/lib/utils'
import type { Record, RecordCreate } from '@/types/record'

interface Installment {
  date: string
  amount: number
  total: number
}

interface SplitDialogProps {
  record: Record | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSplit: (records: RecordCreate[]) => Promise<void>
}

type IntervalUnit = 'days' | 'weeks' | 'months'

export function SplitDialog({ record, open, onOpenChange, onSplit }: SplitDialogProps) {
  const [numInstallments, setNumInstallments] = useState(2)
  const [intervalValue, setIntervalValue] = useState(1)
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('months')
  const [installments, setInstallments] = useState<Installment[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Calculate initial installments when settings change
  useEffect(() => {
    if (!record) return

    const baseDate = new Date(record.date_cashflow)
    const baseAmount = Number(record.amount) / numInstallments
    const baseTotal = Number(record.total) / numInstallments

    const newInstallments: Installment[] = []
    for (let i = 0; i < numInstallments; i++) {
      const date = new Date(baseDate)

      if (intervalUnit === 'days') {
        date.setDate(date.getDate() + i * intervalValue)
      } else if (intervalUnit === 'weeks') {
        date.setDate(date.getDate() + i * intervalValue * 7)
      } else {
        date.setMonth(date.getMonth() + i * intervalValue)
      }

      newInstallments.push({
        date: date.toISOString().split('T')[0],
        amount: Math.round(baseAmount * 100) / 100,
        total: Math.round(baseTotal * 100) / 100,
      })
    }

    setInstallments(newInstallments)
  }, [record, numInstallments, intervalValue, intervalUnit])

  // Calculate totals and delta
  const { totalAmount, totalTotal, deltaAmount, deltaTotal } = useMemo(() => {
    const totalAmount = installments.reduce((sum, inst) => sum + inst.amount, 0)
    const totalTotal = installments.reduce((sum, inst) => sum + inst.total, 0)
    const originalAmount = record ? Number(record.amount) : 0
    const originalTotal = record ? Number(record.total) : 0

    return {
      totalAmount,
      totalTotal,
      deltaAmount: totalAmount - originalAmount,
      deltaTotal: totalTotal - originalTotal,
    }
  }, [installments, record])

  const updateInstallment = (index: number, field: keyof Installment, value: string | number) => {
    setInstallments(prev => prev.map((inst, i) => {
      if (i !== index) return inst
      return { ...inst, [field]: field === 'date' ? value : Number(value) }
    }))
  }

  const handleSubmit = async () => {
    if (!record || installments.length < 2) return

    setIsSubmitting(true)
    try {
      const records: RecordCreate[] = installments.map((inst, index) => ({
        area: record.area,
        type: record.type,
        account: record.account,
        reference: `${record.reference} (${index + 1}/${installments.length})`,
        note: record.note,
        date_cashflow: inst.date,
        date_offer: record.date_offer,
        owner: record.owner,
        nextaction: record.nextaction,
        amount: inst.amount.toString(),
        vat: record.vat,
        total: inst.total.toString(),
        stage: record.stage,
        transaction_id: record.transaction_id ? `${record.transaction_id}-${index + 1}` : `SPLIT-${Date.now()}-${index + 1}`,
        bank_account_id: record.bank_account_id,
        project_id: record.project_id,
        phase_id: record.phase_id,
      }))

      await onSplit(records)
      onOpenChange(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!record) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="h-5 w-5" />
            Dividi Record in Rate
          </DialogTitle>
          <DialogDescription>
            Dividi "{record.reference}" in più rate con date e importi personalizzabili.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Configuration */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Numero Rate</Label>
              <div className="flex items-center gap-2 mt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setNumInstallments(Math.max(2, numInstallments - 1))}
                  disabled={numInstallments <= 2}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min={2}
                  max={24}
                  value={numInstallments}
                  onChange={(e) => setNumInstallments(Math.max(2, Math.min(24, parseInt(e.target.value) || 2)))}
                  className="text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setNumInstallments(Math.min(24, numInstallments + 1))}
                  disabled={numInstallments >= 24}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Intervallo</Label>
              <Input
                type="number"
                min={1}
                value={intervalValue}
                onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value) || 1))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Unità</Label>
              <Select value={intervalUnit} onValueChange={(v) => setIntervalUnit(v as IntervalUnit)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">Giorni</SelectItem>
                  <SelectItem value="weeks">Settimane</SelectItem>
                  <SelectItem value="months">Mesi</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Original values */}
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Valori originali</p>
            <div className="flex gap-6">
              <div>
                <span className="text-sm text-muted-foreground">Imponibile: </span>
                <AmountDisplay amount={record.amount} className="font-medium" />
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Totale: </span>
                <AmountDisplay amount={record.total} className="font-medium" />
              </div>
            </div>
          </div>

          {/* Installments table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left text-sm font-medium p-3">Rata</th>
                  <th className="text-left text-sm font-medium p-3">Data Cashflow</th>
                  <th className="text-right text-sm font-medium p-3">Imponibile</th>
                  <th className="text-right text-sm font-medium p-3">Totale</th>
                </tr>
              </thead>
              <tbody>
                {installments.map((inst, index) => (
                  <tr key={index} className="border-t">
                    <td className="p-3 text-sm font-medium">
                      {index + 1}/{installments.length}
                    </td>
                    <td className="p-3">
                      <Input
                        type="date"
                        value={inst.date}
                        onChange={(e) => updateInstallment(index, 'date', e.target.value)}
                        className="w-40"
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        type="number"
                        step="0.01"
                        value={inst.amount}
                        onChange={(e) => updateInstallment(index, 'amount', e.target.value)}
                        className="w-32 text-right"
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        type="number"
                        step="0.01"
                        value={inst.total}
                        onChange={(e) => updateInstallment(index, 'total', e.target.value)}
                        className="w-32 text-right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/50 border-t">
                <tr>
                  <td className="p-3 text-sm font-medium" colSpan={2}>Totale Rate</td>
                  <td className="p-3 text-right">
                    <AmountDisplay amount={totalAmount} className="font-medium" />
                  </td>
                  <td className="p-3 text-right">
                    <AmountDisplay amount={totalTotal} className="font-medium" />
                  </td>
                </tr>
                {(Math.abs(deltaAmount) > 0.01 || Math.abs(deltaTotal) > 0.01) && (
                  <tr>
                    <td className="p-3 text-sm" colSpan={2}>
                      <span className="flex items-center gap-1 text-amber-600">
                        <AlertCircle className="h-4 w-4" />
                        Delta rispetto all'originale
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <span className={cn(
                        'font-medium',
                        deltaAmount > 0 ? 'text-income' : deltaAmount < 0 ? 'text-expense' : ''
                      )}>
                        {deltaAmount > 0 ? '+' : ''}{deltaAmount.toFixed(2)} €
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <span className={cn(
                        'font-medium',
                        deltaTotal > 0 ? 'text-income' : deltaTotal < 0 ? 'text-expense' : ''
                      )}>
                        {deltaTotal > 0 ? '+' : ''}{deltaTotal.toFixed(2)} €
                      </span>
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Divisione in corso...' : `Crea ${installments.length} Rate`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
