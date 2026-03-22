import { Separator } from '@/components/ui/separator'
import { AREA_LABELS } from '@/lib/constants'
import type { CashflowVatSeries, CashflowVatEntry } from '@/types/cashflow'

function formatAmount(value: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value)
}

interface CashflowVatDetailProps {
  series: CashflowVatSeries[]
}

export function CashflowVatDetail({ series }: CashflowVatDetailProps) {
  return (
    <div className="space-y-6">
      {series.map((s) => (
        <div key={s.vat_registry_id}>
          {/* Series header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold">{s.name}</h3>
              <p className="text-xs text-muted-foreground">{s.vat_number}</p>
            </div>
            <div className="flex gap-4 text-sm">
              <span className="text-red-600">Debito: {formatAmount(s.total_debito)}</span>
              <span className="text-green-600">Credito: {formatAmount(s.total_credito)}</span>
              <span className={`font-medium ${s.total_net > 0 ? 'text-red-600' : s.total_net < 0 ? 'text-green-600' : ''}`}>
                Netto: {formatAmount(s.total_net)}
              </span>
            </div>
          </div>

          {/* Group entries by area */}
          <AreaBreakdown entries={s.entries} />
        </div>
      ))}
    </div>
  )
}

function AreaBreakdown({ entries }: { entries: CashflowVatEntry[] }) {
  const areas = ['actual', 'orders', 'prospect', 'budget'] as const
  const areaGroups = areas
    .map(area => ({
      area,
      label: AREA_LABELS[area as keyof typeof AREA_LABELS] || area,
      entries: entries.filter(e => e.area === area),
    }))
    .filter(g => g.entries.length > 0)

  return (
    <div className="space-y-3">
      {areaGroups.map(({ area, label, entries: areaEntries }) => {
        const areaNet = areaEntries.reduce((s, e) => s + e.net, 0)

        return (
          <div key={area}>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-medium capitalize">{label}</h4>
              <span className={`text-xs font-medium ${areaNet > 0 ? 'text-red-600' : areaNet < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                Netto: {formatAmount(areaNet)}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b text-xs">
                  <th className="py-1 pr-2">Periodo</th>
                  <th className="py-1 pr-2 text-right">Debito</th>
                  <th className="py-1 pr-2 text-right">Credito</th>
                  <th className="py-1 pr-2 text-right">Riporto</th>
                  <th className="py-1 pr-2 text-right">Netto</th>
                  <th className="py-1 text-right">Scadenza</th>
                </tr>
              </thead>
              <tbody>
                {areaEntries.map((e, i) => (
                  <tr key={`${e.period}-${i}`} className="border-b last:border-0">
                    <td className="py-1 pr-2 font-mono text-xs">{e.period}</td>
                    <td className="py-1 pr-2 text-right text-red-600">{formatAmount(e.iva_debito)}</td>
                    <td className="py-1 pr-2 text-right text-green-600">{formatAmount(e.iva_credito)}</td>
                    <td className="py-1 pr-2 text-right text-muted-foreground">
                      {e.credit_carried > 0 ? formatAmount(e.credit_carried) : '-'}
                    </td>
                    <td className={`py-1 pr-2 text-right font-medium ${e.net > 0 ? 'text-red-600' : e.net < 0 ? 'text-green-600' : ''}`}>
                      {formatAmount(e.net)}
                    </td>
                    <td className="py-1 text-right font-mono text-xs">{e.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Separator className="mt-2" />
          </div>
        )
      })}
    </div>
  )
}
