import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { AreaFocusItem } from './AreaFocusItem'
import { formatCurrency } from '@/lib/formatters'
import type { Record } from '@/types/record'

interface AreaFocusColumnProps {
  title: string
  subtitle?: string
  totale: number
  paretoItems: Record[]
  extraItems: Record[]
  onSelectRecord: (record: Record) => void
}

export function AreaFocusColumn({
  title,
  subtitle,
  totale,
  paretoItems,
  extraItems,
  onSelectRecord,
}: AreaFocusColumnProps) {
  const [showAll, setShowAll] = useState(false)
  const totalCount = paretoItems.length + extraItems.length
  const items = showAll ? [...paretoItems, ...extraItems] : paretoItems

  return (
    <div className="flex min-w-[300px] max-w-[360px] flex-1 flex-col rounded-lg border border-slate-200 bg-slate-50/50">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Badge variant="secondary" className="bg-slate-200 text-xs text-slate-900">
            {totalCount} {totalCount === 1 ? 'voce' : 'voci'}
          </Badge>
        </div>
        {subtitle && <div className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</div>}
        <div className="mt-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Totale entrate stage 0
          </div>
          <div className="text-xl font-bold tabular-nums">{formatCurrency(totale)}</div>
          {totalCount > 0 && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {paretoItems.length} {paretoItems.length === 1 ? 'voce copre' : 'voci coprono'} l'80% (su {totalCount})
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Nessuna voce</div>
        ) : (
          items.map((record) => (
            <AreaFocusItem key={record.id} record={record} onClick={() => onSelectRecord(record)} />
          ))
        )}
      </div>

      {extraItems.length > 0 && (
        <div className="border-t bg-background/50 p-2">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showAll ? "Mostra solo l'80%" : `Mostra tutte (${totalCount})`}
          </button>
        </div>
      )}
    </div>
  )
}
