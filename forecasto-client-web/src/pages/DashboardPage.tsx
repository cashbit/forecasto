import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Bell } from 'lucide-react'
import { RemindersKanban } from '@/components/dashboard/RemindersKanban'
import { RecordDetail } from '@/components/records/RecordDetail'
import { RecordForm } from '@/components/records/RecordForm'
import { recordsApi } from '@/api/records'
import { useRecords } from '@/hooks/useRecords'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { toast } from '@/hooks/useToast'
import type { Record, RecordUpdate } from '@/types/record'

export function DashboardPage() {
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const selectedWorkspaceIds = useWorkspaceStore((state) => state.selectedWorkspaceIds)
  const currentWorkspace = workspaces.find((w) => w.id === selectedWorkspaceIds[0])
  const workspaceId = currentWorkspace?.id
  const leadDays = currentWorkspace?.settings?.reminder_lead_days ?? 7
  const signature = currentWorkspace?.settings?.reminder_email_signature
  const provider = currentWorkspace?.settings?.reminder_email_provider ?? 'native'

  const { sendReminders, undoReminder, updateRecord, isSendingReminder, isUndoingReminder } = useRecords()
  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null)
  const [editingRecord, setEditingRecord] = useState<Record | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reminders', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return { items: [] as Record[] }
      return recordsApi.list(workspaceId, {
        area: 'actual',
        stage: '0',
        sign: 'in',
        include_deleted: false,
      })
    },
    enabled: !!workspaceId,
    staleTime: 30000,
  })

  const records = useMemo(() => data?.items ?? [], [data])

  const handleSend = async (recordIds: string[]) => {
    if (!workspaceId) return
    try {
      await sendReminders({ recordIds, workspaceId })
      toast({ title: 'Promemoria inviato', description: `Aggiornati ${recordIds.length} record.` })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore durante l\u2019invio'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleUpdateRecord = async (data: RecordUpdate) => {
    if (!editingRecord) return
    try {
      await updateRecord({ recordId: editingRecord.id, data, workspaceId: editingRecord.workspace_id })
      setSelectedRecord(editingRecord)
      setEditingRecord(null)
      toast({ title: 'Record aggiornato', variant: 'success' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore durante l\u2019aggiornamento'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleUndo = async (recordIds: string[]) => {
    if (!workspaceId) return
    try {
      await undoReminder({ recordIds, workspaceId })
      toast({ title: 'Annullato', description: 'Ultimo promemoria annullato.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore durante l\u2019annullamento'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  if (!workspaceId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Seleziona un workspace per visualizzare la dashboard.
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Bell className="h-5 w-5" />
              Dashboard promemoria e solleciti
            </h2>
            <p className="text-xs text-muted-foreground">
              Solo righe in area <strong>Actual</strong> con stato <strong>Da pagare</strong>.
              Promemoria mostrati entro {leadDays} giorni dalla scadenza.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex flex-1 items-center justify-center text-destructive">
            Errore durante il caricamento dei record.
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden">
            <RemindersKanban
              records={records}
              leadDays={leadDays}
              signature={signature}
              provider={provider}
              onSend={handleSend}
              onUndo={handleUndo}
              onRecordClick={setSelectedRecord}
              busy={isSendingReminder || isUndoingReminder}
            />
          </div>
        )}
      </div>

      {(selectedRecord || editingRecord) && (
        <div className="w-120 border-l relative">
          {editingRecord ? (
            <RecordForm
              record={editingRecord}
              area={editingRecord.area}
              onSubmit={(data) => handleUpdateRecord(data as RecordUpdate)}
              onCancel={() => setEditingRecord(null)}
              onClose={() => setEditingRecord(null)}
            />
          ) : selectedRecord ? (
            <RecordDetail
              record={selectedRecord}
              onClose={() => setSelectedRecord(null)}
              onEdit={() => setEditingRecord(selectedRecord)}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
