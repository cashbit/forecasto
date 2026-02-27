import { useState, useEffect, useMemo } from 'react'
import { Split, Copy, Plus, Minus, AlertCircle } from 'lucide-react'
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
  splitPercent: number  // % dell'imponibile originale (es: 50 per 50%)
  amount: number        // imponibile assoluto (con segno)
  vatPercent: number    // aliquota IVA % (es: 22)
  total: number         // totale calcolato
}

interface SplitDialogProps {
  record: Record | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSplit: (records: RecordCreate[]) => Promise<void>
  mode?: 'split' | 'clone'
}

type IntervalUnit = 'days' | 'weeks' | 'months'

export function SplitDialog({ record, open, onOpenChange, onSplit, mode = 'split' }: SplitDialogProps) {
  const isClone = mode === 'clone'
  const [numInstallments, setNumInstallments] = useState(2)
  const [intervalValue, setIntervalValue] = useState(1)
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('months')
  const [installments, setInstallments] = useState<Installment[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Calculate initial installments when settings change
  useEffect(() => {
    if (!record) return

    const absOriginalAmount = Math.abs(Number(record.amount))
    const absOriginalTotal  = Math.abs(Number(record.total))
    const recordVatPercent = absOriginalAmount > 0
      ? Math.round(((absOriginalTotal - absOriginalAmount) / absOriginalAmount) * 10000) / 100
      : 0

    const baseDate = new Date(record.date_cashflow)
    const baseAmount = isClone ? Number(record.amount) : Number(record.amount) / numInstallments
    const baseTotal  = isClone ? Number(record.total)  : Number(record.total)  / numInstallments
    const baseSplitPercent = isClone ? 100 : 100 / numInstallments

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
        splitPercent: Math.round(baseSplitPercent * 100) / 100,
        amount: Math.round(baseAmount * 100) / 100,
        total:  Math.round(baseTotal  * 100) / 100,
        vatPercent: recordVatPercent,
      })
    }

    setInstallments(newInstallments)
  }, [record, numInstallments, intervalValue, intervalUnit, isClone])

  // Calculate totals and delta
  const { totalAmount, totalTotal, totalSplitPercent, deltaAmount, deltaTotal } = useMemo(() => {
    const totalAmount = installments.reduce((sum, inst) => sum + inst.amount, 0)
    const totalTotal  = installments.reduce((sum, inst) => sum + inst.total,  0)
    const totalSplitPercent = installments.reduce((sum, inst) => sum + inst.splitPercent, 0)
    const originalAmount = record ? Number(record.amount) : 0
    const originalTotal  = record ? Number(record.total)  : 0

    return {
      totalAmount,
      totalTotal,
      totalSplitPercent,
      deltaAmount: totalAmount - originalAmount,
      deltaTotal:  totalTotal  - originalTotal,
    }
  }, [installments, record])

  const updateInstallment = (index: number, field: 'date' | 'splitPercent' | 'amount' | 'vatPercent' | 'total', value: string | number) => {
    const origAbs = Math.abs(Number(record!.amount))
    setInstallments(prev => prev.map((inst, i) => {
      if (i !== index) return inst
      if (field === 'date') return { ...inst, date: value as string }
      if (field === 'splitPercent') {
        const sp = Number(value)
        const sign = Number(record!.amount) < 0 ? -1 : 1
        const a = Math.round(origAbs * sp / 100 * 100) / 100 * sign
        const t = Math.round(a * (1 + inst.vatPercent / 100) * 100) / 100
        return { ...inst, splitPercent: sp, amount: a, total: t }
      }
      if (field === 'amount') {
        const a = Number(value)
        const sp = origAbs > 0 ? Math.round((Math.abs(a) / origAbs) * 10000) / 100 : 0
        const t = Math.round(a * (1 + inst.vatPercent / 100) * 100) / 100
        return { ...inst, amount: a, splitPercent: sp, total: t }
      }
      if (field === 'vatPercent') {
        const vp = Number(value)
        const t = Math.round(inst.amount * (1 + vp / 100) * 100) / 100
        return { ...inst, vatPercent: vp, total: t }
      }
      if (field === 'total') {
        const t = Number(value)
        const vp = inst.amount !== 0
          ? Math.round(((t - inst.amount) / inst.amount) * 10000) / 100
          : 0
        return { ...inst, total: t, vatPercent: vp }
      }
      return inst
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
        vat: Math.abs(inst.total - inst.amount).toFixed(2),
        total: inst.total.toString(),
        stage: record.stage,
        transaction_id: record.transaction_id ? `${record.transaction_id}-${index + 1}` : `${isClone ? 'CLONE' : 'SPLIT'}-${Date.now()}-${index + 1}`,
        bank_account_id: record.bank_account_id,
        project_code: record.project_code,
      }))

      await onSplit(records)
      onOpenChange(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!record) return null

  const absOriginalAmount = Math.abs(Number(record.amount))
  const absOriginalTotal  = Math.abs(Number(record.total))
  const recordVatPercent = absOriginalAmount > 0
    ? Math.round(((absOriginalTotal - absOriginalAmount) / absOriginalAmount) * 10000) / 100
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isClone ? <Copy className="h-5 w-5" /> : <Split className="h-5 w-5" />}
            {isClone ? 'Clona Record' : 'Dividi Record in Rate'}
          </DialogTitle>
          <DialogDescription>
            {isClone
              ? `Clona "${record.reference}" in più copie con lo stesso importo e date personalizzabili.`
              : `Dividi "${record.reference}" in più rate con date e importi personalizzabili.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Configuration */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>{isClone ? 'Numero Copie' : 'Numero Rate'}</Label>
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
                <span className="text-sm text-muted-foreground">IVA: </span>
                <span className="font-medium">{recordVatPercent.toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Totale: </span>
                <AmountDisplay amount={record.total} className="font-medium" />
              </div>
            </div>
          </div>

          {/* Installments table */}
          <div className="border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left text-sm font-medium p-3 whitespace-nowrap">Rata</th>
                  <th className="text-left text-sm font-medium p-3 whitespace-nowrap">Data Cashflow</th>
                  <th className="text-right text-sm font-medium p-3 whitespace-nowrap">%</th>
                  <th className="text-right text-sm font-medium p-3 whitespace-nowrap">Imponibile</th>
                  <th className="text-right text-sm font-medium p-3 whitespace-nowrap">% IVA</th>
                  <th className="text-right text-sm font-medium p-3 whitespace-nowrap">Totale</th>
                </tr>
              </thead>
              <tbody>
                {installments.map((inst, index) => (
                  <tr key={index} className="border-t">
                    <td className="p-3 text-sm font-medium whitespace-nowrap">
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
                        value={inst.splitPercent}
                        onChange={(e) => updateInstallment(index, 'splitPercent', e.target.value)}
                        className="w-20 text-right"
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
                        value={inst.vatPercent}
                        onChange={(e) => updateInstallment(index, 'vatPercent', e.target.value)}
                        className="w-16 text-right"
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
                  <td className="p-3 text-sm font-medium" colSpan={2}>{isClone ? 'Totale Copie' : 'Totale Rate'}</td>
                  <td className="p-3 text-right">
                    <span className={cn('text-sm font-medium', Math.abs(totalSplitPercent - 100) > 0.05 ? 'text-amber-600' : '')}>
                      {totalSplitPercent.toFixed(1)}%
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <AmountDisplay amount={totalAmount} className="font-medium" />
                  </td>
                  <td className="p-3" />
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
                    <td className="p-3" />
                    <td className="p-3 text-right">
                      <span className={cn(
                        'font-medium',
                        deltaAmount > 0 ? 'text-income' : deltaAmount < 0 ? 'text-expense' : ''
                      )}>
                        {deltaAmount > 0 ? '+' : ''}{deltaAmount.toFixed(2)} €
                      </span>
                    </td>
                    <td className="p-3" />
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
            {isSubmitting
              ? (isClone ? 'Clonazione in corso...' : 'Divisione in corso...')
              : (isClone ? `Crea ${installments.length} Copie` : `Crea ${installments.length} Rate`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
