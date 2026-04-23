import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'

interface KanbanColumnProps {
  title: string
  subtitle?: string
  rowCount: number
  total: number
  tone?: 'default' | 'warning' | 'danger'
  children: ReactNode
}

const toneClasses: Record<NonNullable<KanbanColumnProps['tone']>, string> = {
  default: 'border-slate-200 bg-slate-50/50',
  warning: 'border-amber-200 bg-amber-50/50',
  danger: 'border-red-200 bg-red-50/50',
}

const badgeToneClasses: Record<NonNullable<KanbanColumnProps['tone']>, string> = {
  default: 'bg-slate-200 text-slate-900',
  warning: 'bg-amber-200 text-amber-900',
  danger: 'bg-red-200 text-red-900',
}

export function KanbanColumn({
  title,
  subtitle,
  rowCount,
  total,
  tone = 'default',
  children,
}: KanbanColumnProps) {
  return (
    <div className={cn('flex min-w-[300px] max-w-[360px] flex-1 flex-col rounded-lg border', toneClasses[tone])}>
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Badge variant="secondary" className={cn('text-xs', badgeToneClasses[tone])}>
            {rowCount} {rowCount === 1 ? 'riga' : 'righe'}
          </Badge>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          {subtitle ? <span>{subtitle}</span> : <span />}
          <span className="font-medium tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {rowCount === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Nessuna riga</div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
