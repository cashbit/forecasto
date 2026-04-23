import { useMemo } from 'react'
import { KanbanColumn } from './KanbanColumn'
import { CustomerReminderCard } from './CustomerReminderCard'
import type { EmailProvider } from '@/lib/reminder-mailto'
import type { Record } from '@/types/record'

interface RemindersKanbanProps {
  records: Record[]
  leadDays: number
  signature?: string
  provider?: EmailProvider
  onSend: (recordIds: string[]) => Promise<void>
  onUndo: (recordIds: string[]) => Promise<void>
  onRecordClick?: (record: Record) => void
  busy?: boolean
}

type ColumnKey = 'promemoria' | 'sollecito_1' | 'sollecito_2' | 'sollecito_3_plus'

function todayYmd(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function classify(r: Record, today: string, leadDays: number): ColumnKey | null {
  const count = r.reminder_count ?? -1
  if (count === -1) {
    const threshold = addDaysYmd(today, leadDays)
    if (r.date_cashflow <= threshold) return 'promemoria'
    return null
  }
  if (r.date_cashflow > today) return null
  if (count === 0) return 'sollecito_1'
  if (count === 1) return 'sollecito_2'
  return 'sollecito_3_plus'
}

function groupByReference(records: Record[]): Map<string, Record[]> {
  const out = new Map<string, Record[]>()
  for (const r of records) {
    const key = (r.reference || '').trim() || '(senza riferimento)'
    const arr = out.get(key) || []
    arr.push(r)
    out.set(key, arr)
  }
  return out
}

function totalOf(records: Record[]): number {
  return records.reduce((sum, r) => sum + Math.abs(parseFloat(r.total || r.amount || '0')), 0)
}

function oldestDate(records: Record[]): string {
  return records.reduce((min, r) => (r.date_cashflow < min ? r.date_cashflow : min), records[0]?.date_cashflow || '')
}

export function RemindersKanban({
  records,
  leadDays,
  signature,
  provider,
  onSend,
  onUndo,
  onRecordClick,
  busy,
}: RemindersKanbanProps) {
  const today = todayYmd()

  const columns = useMemo(() => {
    const buckets: Record<ColumnKey, Record[]> = {
      promemoria: [],
      sollecito_1: [],
      sollecito_2: [],
      sollecito_3_plus: [],
    }
    for (const r of records) {
      const col = classify(r, today, leadDays)
      if (col) buckets[col].push(r)
    }
    return buckets
  }, [records, today, leadDays])

  const renderColumnContent = (key: ColumnKey) => {
    const bucketRecords = columns[key]
    const groups = groupByReference(bucketRecords)
    const sortedGroups = Array.from(groups.entries()).sort(
      (a, b) => oldestDate(a[1]).localeCompare(oldestDate(b[1])),
    )
    return sortedGroups.map(([ref, recs]) => (
      <CustomerReminderCard
        key={ref}
        reference={ref}
        records={recs}
        signature={signature}
        provider={provider}
        showOverdueBadge={key === 'promemoria'}
        showCountBadge={key === 'sollecito_3_plus'}
        onSend={onSend}
        onUndo={onUndo}
        onRecordClick={onRecordClick}
        busy={busy}
      />
    ))
  }

  return (
    <div className="flex h-full min-h-[500px] gap-3 overflow-x-auto p-1">
      <KanbanColumn
        title="Promemoria"
        subtitle={`Entro ${leadDays} giorni`}
        rowCount={columns.promemoria.length}
        total={totalOf(columns.promemoria)}
        tone="default"
      >
        {renderColumnContent('promemoria')}
      </KanbanColumn>

      <KanbanColumn
        title="1° sollecito"
        subtitle="Dopo scadenza"
        rowCount={columns.sollecito_1.length}
        total={totalOf(columns.sollecito_1)}
        tone="warning"
      >
        {renderColumnContent('sollecito_1')}
      </KanbanColumn>

      <KanbanColumn
        title="2° sollecito"
        rowCount={columns.sollecito_2.length}
        total={totalOf(columns.sollecito_2)}
        tone="warning"
      >
        {renderColumnContent('sollecito_2')}
      </KanbanColumn>

      <KanbanColumn
        title="Oltre 3° sollecito"
        subtitle="Ritardo cronico"
        rowCount={columns.sollecito_3_plus.length}
        total={totalOf(columns.sollecito_3_plus)}
        tone="danger"
      >
        {renderColumnContent('sollecito_3_plus')}
      </KanbanColumn>
    </div>
  )
}
