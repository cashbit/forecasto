import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { COST_PRESETS, CADENCE_LABELS, type OnboardingPreset } from '@/lib/onboarding-presets'
import { buildTransactionId, rowInstallmentCount, type OnboardingRow } from '@/lib/onboarding-expand'

interface OnboardingReviewProps {
  costRows: Record<string, OnboardingRow[]>
  totalRecords: number
  totalAmount: number
  isSubmitting: boolean
  onBack: () => void
  onConfirm: () => void
}

function formatCurrency(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function CategorySummary({
  preset,
  rows,
}: {
  preset: OnboardingPreset
  rows: OnboardingRow[]
}) {
  const activeRows = rows.filter((r) => r.amount > 0)
  if (activeRows.length === 0) return null

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <span className="text-sm font-medium">{preset.label}</span>
        <span className="text-xs text-muted-foreground">
          {activeRows.length} {activeRows.length === 1 ? 'voce' : 'voci'}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Conto</TableHead>
            <TableHead>Riferimento</TableHead>
            <TableHead>ID Transazione (1ª rata)</TableHead>
            <TableHead className="text-right">Importo/rata</TableHead>
            <TableHead>Cadenza</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Totale</TableHead>
            <TableHead>Inizio</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activeRows.map((row, i) => {
            const count = rowInstallmentCount(row)
            const totalPerRow = row.amount * count
            const txExample = buildTransactionId(
              row.transactionPrefix,
              1,
              count,
              `${row.reference || preset.label} #${i + 1}`,
            )
            return (
              <TableRow key={i}>
                <TableCell className="font-medium uppercase">
                  {row.account || preset.accountSuggestion}
                </TableCell>
                <TableCell>{row.reference || preset.label}</TableCell>
                <TableCell className="font-mono text-xs">{txExample}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                <TableCell>{CADENCE_LABELS[row.cadence]}</TableCell>
                <TableCell className="text-right">{count}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(totalPerRow)}
                </TableCell>
                <TableCell>{row.startDate}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export function OnboardingReview({
  costRows,
  totalRecords,
  totalAmount,
  isSubmitting,
  onBack,
  onConfirm,
}: OnboardingReviewProps) {
  const costsActive = COST_PRESETS.filter((p) => (costRows[p.id] ?? []).some((r) => r.amount > 0))

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Riepilogo finale</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Controlla le voci che stai per inserire. Verranno creati <strong>{totalRecords}</strong> record nel workspace.
          Puoi tornare indietro per modificare.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase text-muted-foreground">Record totali</p>
          <p className="mt-1 text-2xl font-semibold">{totalRecords}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase text-muted-foreground">Totale costi previsti</p>
          <p className="mt-1 text-2xl font-semibold text-destructive">
            -{formatCurrency(totalAmount)}
          </p>
        </div>
      </div>

      {costsActive.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Costi</h3>
          <div className="space-y-3">
            {costsActive.map((p) => (
              <CategorySummary key={p.id} preset={p} rows={costRows[p.id] ?? []} />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nessuna voce attiva. Torna indietro per inserire almeno una categoria con importo &gt; 0.
        </div>
      )}

      <div className="flex justify-between border-t pt-4">
        <Button variant="ghost" onClick={onBack} disabled={isSubmitting}>
          &larr; Indietro
        </Button>
        <Button onClick={onConfirm} disabled={isSubmitting || totalRecords === 0}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Creazione in corso…' : `Crea ${totalRecords} record`}
        </Button>
      </div>
    </div>
  )
}
