import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  CADENCE_OPTIONS,
  type OnboardingPreset,
} from '@/lib/onboarding-presets'
import { newRow, rowInstallmentCount, type OnboardingRow } from '@/lib/onboarding-expand'

interface OnboardingCategoryStepProps {
  preset: OnboardingPreset
  rows: OnboardingRow[]
  stepNumber: number
  totalSteps: number
  defaultStartDate: string
  defaultHorizonMonths: number
  onChange: (rows: OnboardingRow[]) => void
  onBack: () => void
  onSkip: () => void
  onNext: () => void
}

export function OnboardingCategoryStep({
  preset,
  rows,
  stepNumber,
  totalSteps,
  defaultStartDate,
  defaultHorizonMonths,
  onChange,
  onBack,
  onSkip,
  onNext,
}: OnboardingCategoryStepProps) {
  const enabled = rows.length > 0

  const setEnabled = (v: boolean) => {
    if (v && rows.length === 0) {
      onChange([newRow(preset, defaultStartDate, defaultHorizonMonths)])
    } else if (!v) {
      onChange([])
    }
  }

  const updateRow = (idx: number, patch: Partial<OnboardingRow>) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    onChange(next)
  }

  const addRow = () => {
    onChange([...rows, newRow(preset, defaultStartDate, defaultHorizonMonths)])
  }

  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx))
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Step {stepNumber} / {totalSteps} · {preset.sign === 'out' ? 'Costi' : 'Ricavi'}
        </p>
        <h2 className="mt-1 text-xl font-semibold">{preset.label}</h2>
        {preset.hint && (
          <p className="mt-1 text-sm text-muted-foreground">{preset.hint}</p>
        )}
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Switch
              id={`enable-${preset.id}`}
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor={`enable-${preset.id}`} className="text-sm cursor-pointer">
              {enabled ? 'Inclusa nel cashflow' : 'Salta questa categoria'}
            </Label>
          </div>
          {enabled && (
            <Button size="sm" variant="outline" onClick={addRow}>
              <Plus className="mr-1 h-4 w-4" /> Aggiungi riga
            </Button>
          )}
        </div>

        {enabled && (
          <div className="mt-4 space-y-4">
            {rows.map((row, idx) => {
              const count = rowInstallmentCount(row)
              return (
                <div key={idx} className="rounded-md border bg-muted/30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Riga {idx + 1} · {count} {count === 1 ? 'rata' : 'rate'}
                    </span>
                    {rows.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeRow(idx)}
                        className="h-7 px-2 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Conto</Label>
                      <Input
                        value={row.account}
                        onChange={(e) => updateRow(idx, { account: e.target.value })}
                        placeholder={preset.accountSuggestion}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Riferimento</Label>
                      <Input
                        value={row.reference}
                        onChange={(e) => updateRow(idx, { reference: e.target.value })}
                        placeholder={preset.label}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Importo per rata (€, imponibile)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.amount || ''}
                        onChange={(e) => updateRow(idx, { amount: Number(e.target.value) || 0 })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">IVA %</Label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        value={row.vatRate}
                        onChange={(e) => updateRow(idx, { vatRate: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ritenuta %</Label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        value={row.withholdingRate}
                        onChange={(e) =>
                          updateRow(idx, { withholdingRate: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Deducib. IVA %</Label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        value={row.vatDeduction}
                        onChange={(e) =>
                          updateRow(idx, { vatDeduction: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cadenza</Label>
                      <Select
                        value={row.cadence}
                        onValueChange={(v) =>
                          updateRow(idx, { cadence: v as OnboardingRow['cadence'] })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CADENCE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Data prima rata</Label>
                      <Input
                        type="date"
                        value={row.startDate}
                        onChange={(e) => updateRow(idx, { startDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Orizzonte (mesi)</Label>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        value={row.horizonMonths}
                        onChange={(e) =>
                          updateRow(idx, { horizonMonths: Math.max(1, Number(e.target.value) || 1) })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">ID Transazione (opzionale)</Label>
                    <Input
                      value={row.transactionPrefix}
                      onChange={(e) => updateRow(idx, { transactionPrefix: e.target.value })}
                      placeholder="es. Contratto ABCD"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Verrà preposto il numero rata, es: <code>(1/{count}) {row.transactionPrefix || 'Contratto ABCD'}</code>
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>&larr; Indietro</Button>
        <div className="flex gap-2">
          {!enabled && (
            <Button variant="outline" onClick={onSkip}>Salta</Button>
          )}
          <Button onClick={onNext}>Avanti &rarr;</Button>
        </div>
      </div>
    </div>
  )
}
