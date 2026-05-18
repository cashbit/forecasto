import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Loader2, Bell, Target, Plus, Sparkles, X } from 'lucide-react'
import { RemindersKanban } from '@/components/dashboard/RemindersKanban'
import { FocusKanban } from '@/components/dashboard/FocusKanban'
import { RecordDetail } from '@/components/records/RecordDetail'
import { RecordForm } from '@/components/records/RecordForm'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { recordsApi } from '@/api/records'
import { useRecords } from '@/hooks/useRecords'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useFilterStore } from '@/stores/filterStore'
import { useUiStore } from '@/stores/uiStore'
import { toast } from '@/hooks/useToast'
import { AREA_LABELS } from '@/lib/constants'
import type { Record, RecordUpdate, Area } from '@/types/record'

function onboardingBannerStorageKey(workspaceId: string | undefined): string {
  return `forecasto-onboarding-banner-dismissed:${workspaceId ?? 'none'}`
}

export function DashboardPage() {
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const selectedWorkspaceIds = useWorkspaceStore((state) => state.selectedWorkspaceIds)
  const currentWorkspace = workspaces.find((w) => w.id === selectedWorkspaceIds[0])
  const workspaceId = currentWorkspace?.id

  const bannerKey = onboardingBannerStorageKey(workspaceId)
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(
    () => typeof window !== 'undefined' && window.localStorage.getItem(bannerKey) === '1',
  )
  const dismissBanner = () => {
    setBannerDismissed(true)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(bannerKey, '1')
    }
  }
  const leadDays = currentWorkspace?.settings?.reminder_lead_days ?? 7
  const signature = currentWorkspace?.settings?.reminder_email_signature
  const provider = currentWorkspace?.settings?.reminder_email_provider ?? 'native'

  const { sendReminders, undoReminder, updateRecord, deleteRecord, transferRecord, isSendingReminder, isUndoingReminder } = useRecords()
  const setCreateRecordDialogOpen = useUiStore(s => s.setCreateRecordDialogOpen)
  const reviewMode = useUiStore(s => s.reviewMode)
  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null)
  const [editingRecord, setEditingRecord] = useState<Record | null>(null)
  const [recordToDelete, setRecordToDelete] = useState<Record | null>(null)
  const [section, setSection] = useState<'focus' | 'solleciti'>('focus')

  const textFilter = useFilterStore(s => s.textFilter)
  const textFilterField = useFilterStore(s => s.textFilterField)
  const projectCodeFilter = useFilterStore(s => s.projectCodeFilter)
  const ownerFilter = useFilterStore(s => s.ownerFilter)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reminders', workspaceId, textFilter, textFilterField, projectCodeFilter],
    queryFn: async () => {
      if (!workspaceId) return { items: [] as Record[] }
      return recordsApi.list(workspaceId, {
        area: 'actual',
        stage: '0',
        sign: 'in',
        include_deleted: false,
        text_filter: textFilter || undefined,
        text_filter_field: textFilter && textFilterField ? textFilterField : undefined,
        project_code: projectCodeFilter || undefined,
      })
    },
    enabled: !!workspaceId && section === 'solleciti',
    staleTime: 30000,
  })

  const records = useMemo(() => {
    const all = data?.items ?? []
    if (ownerFilter.length === 0) return all
    return all.filter(r => {
      const owner = r.owner || ''
      if (ownerFilter.includes('_noowner_') && !owner) return true
      return ownerFilter.includes(owner)
    })
  }, [data, ownerFilter])

  const handleSend = async (recordIds: string[]) => {
    if (!workspaceId) return
    try {
      await sendReminders({ recordIds, workspaceId })
      toast({ title: 'Promemoria inviato', description: `Aggiornati ${recordIds.length} record.` })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore durante l’invio'
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
      const message = err instanceof Error ? err.message : 'Errore durante l’aggiornamento'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleReviewRecord = async (days: number, formData: RecordUpdate) => {
    if (!editingRecord) return
    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + days)
    try {
      await updateRecord({
        recordId: editingRecord.id,
        data: { ...formData, review_date: nextDate.toISOString().split('T')[0] },
        workspaceId: editingRecord.workspace_id,
      })
      setSelectedRecord(editingRecord)
      setEditingRecord(null)
      toast({ title: `Revisione posticipata di ${days} giorni`, variant: 'success' })
    } catch {
      toast({ title: 'Errore durante la revisione', variant: 'destructive' })
    }
  }

  const handlePromoteRecord = async (recordId: string, toArea: Area, formData: RecordUpdate) => {
    try {
      await updateRecord({ recordId, data: { ...formData, stage: '0' } })
      await transferRecord({ recordId, toArea })
      setSelectedRecord(editingRecord)
      setEditingRecord(null)
      toast({ title: `Record spostato in ${AREA_LABELS[toArea]}`, variant: 'success' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore durante lo spostamento'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const confirmDeleteRecord = async () => {
    if (!recordToDelete) return
    try {
      await deleteRecord(recordToDelete.id, recordToDelete.workspace_id)
      setSelectedRecord(null)
      toast({ title: 'Record eliminato', variant: 'success' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore durante l’eliminazione'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    } finally {
      setRecordToDelete(null)
    }
  }

  const handleUndo = async (recordIds: string[]) => {
    if (!workspaceId) return
    try {
      await undoReminder({ recordIds, workspaceId })
      toast({ title: 'Annullato', description: 'Ultimo promemoria annullato.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore durante l’annullamento'
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
    <div className="flex h-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4">
        {!bannerDismissed && (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Compilazione guidata voci ricorrenti</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Inserisci in pochi minuti affitti, utenze, leasing, consulenze e altre voci ricorrenti
                  con default sensati. Riempi il cashflow senza dover creare i record uno a uno.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild size="sm">
                <Link to="/onboarding">Inizia</Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={dismissBanner}
                className="h-8 w-8 p-0"
                aria-label="Nascondi"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        <Tabs
          value={section}
          onValueChange={(v) => setSection(v as 'focus' | 'solleciti')}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex items-center justify-between gap-2">
            <TabsList className="self-start">
              <TabsTrigger value="focus" className="gap-2">
                <Target className="h-4 w-4" />
                Focus
              </TabsTrigger>
              <TabsTrigger value="solleciti" className="gap-2">
                <Bell className="h-4 w-4" />
                Solleciti
              </TabsTrigger>
            </TabsList>
            <Button
              size="sm"
              onClick={() => setCreateRecordDialogOpen(true)}
              disabled={!workspaceId}
            >
              <Plus className="h-4 w-4 mr-1" />
              Nuovo
            </Button>
          </div>

          <TabsContent value="focus" className="mt-3 min-h-0 flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden">
            <div className="mb-3 flex-shrink-0">
              <p className="text-xs text-muted-foreground">
                Entrate aperte (stage 0) per area. Per ogni colonna le voci che compongono l'80% del totale.
              </p>
            </div>
            <FocusKanban workspaceId={workspaceId} onSelectRecord={setSelectedRecord} />
          </TabsContent>

          <TabsContent value="solleciti" className="mt-3 min-h-0 flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden">
            <div className="mb-3 flex-shrink-0">
              <p className="text-xs text-muted-foreground">
                Solo righe in area <strong>Actual</strong> con stato <strong>Da pagare</strong>.
                Promemoria mostrati entro {leadDays} giorni dalla scadenza.
              </p>
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
          </TabsContent>
        </Tabs>
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
              reviewMode={reviewMode}
              onReview={handleReviewRecord}
              onPromote={handlePromoteRecord}
            />
          ) : selectedRecord ? (
            <RecordDetail
              record={selectedRecord}
              onClose={() => setSelectedRecord(null)}
              onEdit={() => setEditingRecord(selectedRecord)}
              onDelete={() => setRecordToDelete(selectedRecord)}
            />
          ) : null}
        </div>
      )}

      <AlertDialog open={!!recordToDelete} onOpenChange={(open) => !open && setRecordToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo record?
              {recordToDelete && (
                <span className="block mt-2 font-medium text-foreground">
                  {recordToDelete.reference || recordToDelete.account}
                </span>
              )}
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRecord} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
