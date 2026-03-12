import { useState } from 'react'
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { parseISO, format, endOfMonth, addDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { X, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { AmountDisplay } from '@/components/common/AmountDisplay'
import { RecordDetail } from '@/components/records/RecordDetail'
import { RecordForm } from '@/components/records/RecordForm'
import { recordsApi } from '@/api/records'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { AREA_LABELS, getStageLabel } from '@/lib/constants'
import type { CashflowEntry, CashflowParams } from '@/types/cashflow'
import type { Area, Record, RecordUpdate } from '@/types/record'

function getDateRange(date: string, groupBy: string) {
  const d = parseISO(date)
  if (groupBy === 'month') return { from: date, to: format(endOfMonth(d), 'yyyy-MM-dd') }
  if (groupBy === 'week') return { from: date, to: format(addDays(d, 6), 'yyyy-MM-dd') }
  return { from: date, to: date }
}

function getPeriodLabel(date: string, groupBy: string): string {
  const d = parseISO(date)
  if (groupBy === 'month') return format(d, 'MMMM yyyy', { locale: it })
  if (groupBy === 'week') return `Settimana del ${format(d, 'dd/MM/yyyy', { locale: it })}`
  return format(d, 'dd MMMM yyyy', { locale: it })
}

const DISPLAY_ORDER: Area[] = ['actual', 'orders', 'prospect', 'budget']

interface Props {
  entry: CashflowEntry | null
  params: CashflowParams
  onClose: () => void
}

export function CashflowDrilldownPanel({ entry, params, onClose }: Props) {
  const selectedWorkspaceIds = useWorkspaceStore(state => state.selectedWorkspaceIds)
  const queryClient = useQueryClient()
  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null)
  const [editingRecord, setEditingRecord] = useState<Record | null>(null)

  const activeAreaStages = params.area_stage ?? []
  const areaStageMap = new Map<Area, string[]>()
  for (const pair of activeAreaStages) {
    const [area, stage] = pair.split(':') as [Area, string]
    if (!areaStageMap.has(area)) areaStageMap.set(area, [])
    areaStageMap.get(area)!.push(stage)
  }

  const dateRange = entry ? getDateRange(entry.date, params.group_by) : null
  const activeAreas = Array.from(areaStageMap.keys())

  const queries = useQueries({
    queries: entry && dateRange
      ? selectedWorkspaceIds.flatMap(workspaceId =>
          activeAreas.map(area => ({
            queryKey: ['drilldown', workspaceId, area, dateRange.from, dateRange.to],
            queryFn: () => recordsApi.list(workspaceId, {
              area,
              date_start: dateRange.from,
              date_end: dateRange.to,
              page_size: 500,
            }),
            staleTime: 60000,
          }))
        )
      : [],
  })

  const isLoading = queries.some(q => q.isLoading)

  const recordsByArea = new Map<Area, Record[]>()
  for (const query of queries) {
    if (!query.data) continue
    for (const record of query.data.items) {
      const area = record.area as Area
      const allowedStages = areaStageMap.get(area)
      if (allowedStages && !allowedStages.includes(record.stage)) continue
      if (!recordsByArea.has(area)) recordsByArea.set(area, [])
      recordsByArea.get(area)!.push(record)
    }
  }

  for (const records of recordsByArea.values()) {
    records.sort((a, b) => a.date_cashflow.localeCompare(b.date_cashflow))
  }

  const updateMutation = useMutation({
    mutationFn: ({ workspaceId, recordId, data }: { workspaceId: string; recordId: string; data: RecordUpdate }) =>
      recordsApi.update(workspaceId, recordId, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['drilldown'] })
      queryClient.invalidateQueries({ queryKey: ['cashflow'] })
      setEditingRecord(null)
      setSelectedRecord(updated)
    },
  })

  if (!entry) return null

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      <div className="fixed inset-0 bg-black/20" onClick={onClose} />
      <div className="relative ml-auto w-[420px] bg-background border-l shadow-xl flex flex-col h-full">

        {editingRecord ? (
          <RecordForm
            record={editingRecord}
            area={editingRecord.area}
            onSubmit={async (data) => {
              await updateMutation.mutateAsync({
                workspaceId: editingRecord.workspace_id,
                recordId: editingRecord.id,
                data: data as RecordUpdate,
              })
            }}
            onCancel={() => setEditingRecord(null)}
            onClose={() => setEditingRecord(null)}
          />
        ) : selectedRecord ? (
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0">
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedRecord(null)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Indietro
              </Button>
              <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <RecordDetail
                record={selectedRecord}
                onClose={() => setSelectedRecord(null)}
                onEdit={() => setEditingRecord(selectedRecord)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
              <div>
                <p className="text-xs text-muted-foreground">Dettaglio periodo</p>
                <h2 className="text-sm font-semibold">{getPeriodLabel(entry.date, params.group_by)}</h2>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner size="lg" />
                </div>
              ) : recordsByArea.size === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  Nessuna voce per questo periodo
                </p>
              ) : (
                DISPLAY_ORDER.filter(area => recordsByArea.has(area)).map(area => {
                  const records = recordsByArea.get(area)!
                  const total = records.reduce((sum, r) => sum + parseFloat(r.total || '0'), 0)
                  return (
                    <div key={area}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {AREA_LABELS[area]}
                        </span>
                        <AmountDisplay amount={total} className="text-xs font-semibold" />
                      </div>
                      <div className="space-y-1">
                        {records.map(record => (
                          <button
                            key={record.id}
                            type="button"
                            onClick={() => setSelectedRecord(record)}
                            className="w-full text-left rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{record.account}</p>
                                <p className="text-xs text-muted-foreground truncate">{record.reference}</p>
                              </div>
                              <AmountDisplay
                                amount={parseFloat(record.total || '0')}
                                className="text-xs font-medium shrink-0"
                              />
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">
                                {format(parseISO(record.date_cashflow), 'dd/MM')}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                · {getStageLabel(record.stage, area)}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
