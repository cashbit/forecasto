import { useState } from 'react'
import { X, ChevronLeft } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { AmountDisplay } from '@/components/common/AmountDisplay'
import { RecordDetail } from '@/components/records/RecordDetail'
import { RecordForm } from '@/components/records/RecordForm'
import { recordsApi } from '@/api/records'
import type { Record, RecordUpdate } from '@/types/record'

interface RecordListDialogProps {
  open: boolean
  title: string
  records: Record[]
  onClose: () => void
}

export function RecordListDialog({ open, title, records, onClose }: RecordListDialogProps) {
  const queryClient = useQueryClient()
  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null)
  const [editingRecord, setEditingRecord] = useState<Record | null>(null)

  const updateMutation = useMutation({
    mutationFn: ({ workspaceId, recordId, data }: { workspaceId: string; recordId: string; data: RecordUpdate }) =>
      recordsApi.update(workspaceId, recordId, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['records'] })
      setEditingRecord(null)
      setSelectedRecord(updated)
    },
  })

  if (!open) return null

  const sorted = [...records].sort((a, b) => a.date_cashflow.localeCompare(b.date_cashflow))
  const grandTotal = sorted.reduce((sum, r) => sum + parseFloat(r.total || '0'), 0)

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
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
              <div>
                <p className="text-xs text-muted-foreground">Analisi</p>
                <h2 className="text-sm font-semibold truncate max-w-[320px]">{title}</h2>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Record list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {sorted.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">Nessun record trovato</p>
              ) : (
                sorted.map((record) => (
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
                      <AmountDisplay amount={parseFloat(record.total || '0')} className="text-xs font-medium shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(record.date_cashflow), 'dd/MM/yyyy')}
                      </span>
                      {record.owner && (
                        <span className="text-xs text-muted-foreground">· {record.owner}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Footer totale */}
            {sorted.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 flex-shrink-0 text-sm">
                <span className="text-muted-foreground">{sorted.length} record</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Totale:</span>
                  <AmountDisplay amount={grandTotal} className="font-semibold" />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
