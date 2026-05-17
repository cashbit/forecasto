import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { AreaFocusColumn } from './AreaFocusColumn'
import { recordsApi } from '@/api/records'
import { useUiStore } from '@/stores/uiStore'
import { useFilterStore } from '@/stores/filterStore'
import { AREAS, AREA_LABELS, AREA_DESCRIPTIONS } from '@/lib/constants'
import type { Area, Record } from '@/types/record'

interface FocusKanbanProps {
  workspaceId: string
  onSelectRecord: (record: Record) => void
}

interface AreaBuckets {
  totale: number
  paretoItems: Record[]
  extraItems: Record[]
}

function computeArea(records: Record[]): AreaBuckets {
  const sorted = records
    .slice()
    .sort(
      (a, b) =>
        Math.abs(parseFloat(b.total || b.amount || '0')) -
        Math.abs(parseFloat(a.total || a.amount || '0')),
    )
  const totale = sorted.reduce(
    (sum, r) => sum + Math.abs(parseFloat(r.total || r.amount || '0')),
    0,
  )

  if (totale === 0 || sorted.length === 0) {
    return { totale, paretoItems: [], extraItems: sorted }
  }

  const threshold = totale * 0.8
  let cumulative = 0
  let cutoff = 0
  for (let i = 0; i < sorted.length; i++) {
    cumulative += Math.abs(parseFloat(sorted[i].total || sorted[i].amount || '0'))
    cutoff = i + 1
    if (cumulative >= threshold) break
  }

  return {
    totale,
    paretoItems: sorted.slice(0, cutoff),
    extraItems: sorted.slice(cutoff),
  }
}

export function FocusKanban({ workspaceId, onSelectRecord }: FocusKanbanProps) {
  const reviewMode = useUiStore((state) => state.reviewMode)
  const recentFilter = useUiStore((state) => state.recentFilter)
  const textFilter = useFilterStore((state) => state.textFilter)
  const textFilterField = useFilterStore((state) => state.textFilterField)
  const projectCodeFilter = useFilterStore((state) => state.projectCodeFilter)
  const ownerFilter = useFilterStore((state) => state.ownerFilter)

  const queries = useQueries({
    queries: AREAS.map((area) => ({
      queryKey: ['focus', workspaceId, area, textFilter, textFilterField, projectCodeFilter],
      queryFn: () =>
        recordsApi.list(workspaceId, {
          area: area as Area,
          stage: '0',
          sign: 'in',
          include_deleted: false,
          text_filter: textFilter || undefined,
          text_filter_field: textFilter && textFilterField ? textFilterField : undefined,
          project_code: projectCodeFilter || undefined,
        }),
      enabled: !!workspaceId,
      staleTime: 30000,
    })),
  })

  const isLoading = queries.some((q) => q.isLoading)

  const buckets = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const recentThreshold = (() => {
      if (recentFilter === 'all') return null
      const t = new Date()
      if (recentFilter === 'today') t.setHours(0, 0, 0, 0)
      else if (recentFilter === 'week') t.setDate(t.getDate() - 7)
      else if (recentFilter === 'month') t.setMonth(t.getMonth() - 1)
      return t.toISOString()
    })()

    const applyFilters = (items: Record[]): Record[] => {
      let out = items
      if (reviewMode) {
        out = out.filter((r) => r.review_date && r.review_date <= today)
      }
      if (recentThreshold) {
        out = out.filter((r) => r.updated_at >= recentThreshold)
      }
      if (ownerFilter.length > 0) {
        out = out.filter((r) => {
          const owner = r.owner || ''
          if (ownerFilter.includes('_noowner_') && !owner) return true
          return ownerFilter.includes(owner)
        })
      }
      return out
    }

    return AREAS.map((area, idx) => {
      const items = queries[idx].data?.items ?? []
      return { area, ...computeArea(applyFilters(items)) }
    })
  }, [queries, reviewMode, recentFilter, ownerFilter])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[500px] gap-3 overflow-x-auto p-1">
      {buckets.map(({ area, totale, paretoItems, extraItems }) => (
        <AreaFocusColumn
          key={area}
          title={AREA_LABELS[area]}
          subtitle={AREA_DESCRIPTIONS[area]}
          totale={totale}
          paretoItems={paretoItems}
          extraItems={extraItems}
          onSelectRecord={onSelectRecord}
        />
      ))}
    </div>
  )
}
