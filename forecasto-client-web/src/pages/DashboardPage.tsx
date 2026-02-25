import { useState, useEffect } from 'react'
import { AxiosError } from 'axios'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { RecordGrid } from '@/components/records/RecordGrid'
import { RecordFilters } from '@/components/records/RecordFilters'
import { RecordDetail } from '@/components/records/RecordDetail'
import { RecordForm } from '@/components/records/RecordForm'
import { TransferDialog } from '@/components/records/TransferDialog'
import { SplitDialog } from '@/components/records/SplitDialog'
import { BulkMoveDatesDialog } from '@/components/records/BulkMoveDatesDialog'
import { BulkSetDayDialog } from '@/components/records/BulkSetDayDialog'
import { BulkTransferDialog } from '@/components/records/BulkTransferDialog'
import { BulkStageDialog } from '@/components/records/BulkStageDialog'
import { BulkMergeDialog } from '@/components/records/BulkMergeDialog'
import { BulkMoveWorkspaceDialog } from '@/components/records/BulkMoveWorkspaceDialog'
import { BulkEditDialog } from '@/components/records/BulkEditDialog'
import { useRecords } from '@/hooks/useRecords'
import { useFilterStore } from '@/stores/filterStore'
import { useUiStore } from '@/stores/uiStore'
import { toast } from '@/hooks/useToast'
import { AREA_LABELS, AREAS } from '@/lib/constants'
import { recordsApi } from '@/api/records'
import { useQueryClient } from '@tanstack/react-query'
import type { Record, Area, RecordCreate, RecordUpdate } from '@/types/record'

export function DashboardPage() {
  const { currentArea, setArea } = useFilterStore()
  const { createRecordDialogOpen, setCreateRecordDialogOpen, reviewMode } = useUiStore()
  const { records, isLoading, createRecord, updateRecord, deleteRecord, transferRecord, primaryWorkspaceId } = useRecords()
  const queryClient = useQueryClient()

  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null)
  const [editingRecord, setEditingRecord] = useState<Record | null>(null)
  const [visitedRecordIds, setVisitedRecordIds] = useState<Set<string>>(new Set())

  const markEdited = (id: string) => {
    setVisitedRecordIds(prev => new Set(prev).add(id))
  }

  // Refresh detail panel data: use fresh record from list, or fetch from API if not in filtered list
  useEffect(() => {
    if (!selectedRecord || editingRecord) return
    const fresh = records.find(r => r.id === selectedRecord.id)
    if (fresh) {
      if (fresh !== selectedRecord) setSelectedRecord(fresh)
    } else if (primaryWorkspaceId) {
      recordsApi.get(primaryWorkspaceId, selectedRecord.id)
        .then(r => setSelectedRecord(r))
        .catch(() => setSelectedRecord(null))
    }
  }, [records, selectedRecord?.id, editingRecord, primaryWorkspaceId])

  const [transferRecord_, setTransferRecord] = useState<Record | null>(null)
  const [splitRecord_, setSplitRecord] = useState<Record | null>(null)
  const [cloneRecord_, setCloneRecord] = useState<Record | null>(null)

  // Bulk operations state
  const [bulkRecords, setBulkRecords] = useState<Record[] | null>(null)
  const [showBulkMoveDates, setShowBulkMoveDates] = useState(false)
  const [showBulkSetDay, setShowBulkSetDay] = useState(false)
  const [showBulkTransfer, setShowBulkTransfer] = useState(false)
  const [showBulkStage, setShowBulkStage] = useState(false)
  const [showBulkMerge, setShowBulkMerge] = useState(false)
  const [showBulkMoveWorkspace, setShowBulkMoveWorkspace] = useState(false)
  const [showBulkEdit, setShowBulkEdit] = useState(false)

  // Delete confirmation state
  const [recordToDelete, setRecordToDelete] = useState<Record | null>(null)
  const [recordsToDelete, setRecordsToDelete] = useState<Record[] | null>(null)

  const handleReviewRecord = async (days: number, formData: RecordUpdate) => {
    if (!editingRecord) return
    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + days)
    try {
      await updateRecord({
        recordId: editingRecord.id,
        data: { ...formData, review_date: nextDate.toISOString().split('T')[0] }
      })
      markEdited(editingRecord.id)
      setSelectedRecord(editingRecord)
      setEditingRecord(null)
      toast({ title: `Revisione posticipata di ${days} giorni`, variant: 'success' })
    } catch {
      toast({ title: 'Errore durante la revisione', variant: 'destructive' })
    }
  }

  const handleCreateRecord = async (data: RecordCreate) => {
    try {
      await createRecord(data)
      setCreateRecordDialogOpen(false)
      toast({ title: 'Record creato', variant: 'success' })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string; detail?: Array<{ msg: string; loc: string[] }> | string }>
      let message = 'Errore durante la creazione del record.'
      if (axiosError.response?.data?.error) {
        message = axiosError.response.data.error
      } else if (axiosError.response?.data?.message) {
        message = axiosError.response.data.message
      } else if (axiosError.response?.data?.detail) {
        const detail = axiosError.response.data.detail
        if (Array.isArray(detail)) {
          message = detail.map(d => `${d.loc?.join('.')}: ${d.msg}`).join(', ')
        } else {
          message = detail
        }
      }
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleUpdateRecord = async (data: RecordUpdate) => {
    if (!editingRecord) return
    try {
      await updateRecord({ recordId: editingRecord.id, data })
      markEdited(editingRecord.id)
      setSelectedRecord(editingRecord)
      setEditingRecord(null)
      toast({ title: 'Record aggiornato', variant: 'success' })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante l\'aggiornamento.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleDeleteRecord = (record: Record) => {
    setRecordToDelete(record)
  }

  const confirmDeleteRecord = async () => {
    if (!recordToDelete) return
    try {
      await deleteRecord(recordToDelete.id)
      setSelectedRecord(null)
      toast({ title: 'Record eliminato', variant: 'success' })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante l\'eliminazione.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    } finally {
      setRecordToDelete(null)
    }
  }

  const handlePromoteRecord = async (recordId: string, toArea: Area, formData: RecordUpdate) => {
    try {
      // Save form changes with stage reset to 0, then transfer
      await updateRecord({ recordId, data: { ...formData, stage: '0' } })
      await transferRecord({ recordId, toArea })
      markEdited(recordId)
      setSelectedRecord(editingRecord)
      setEditingRecord(null)
      toast({ title: `Record spostato in ${AREA_LABELS[toArea]}`, variant: 'success' })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante lo spostamento.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleTransfer = async (recordId: string, toArea: Area, note?: string) => {
    try {
      await transferRecord({ recordId, toArea, note })
      setTransferRecord(null)
      toast({ title: 'Record trasferito', variant: 'success' })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante il trasferimento.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleSplit = async (newRecords: RecordCreate[]) => {
    try {
      // First delete the original record
      if (splitRecord_) {
        await deleteRecord(splitRecord_.id)
      }

      // Then create all the new installment records
      for (const recordData of newRecords) {
        await createRecord(recordData)
      }

      setSplitRecord(null)
      toast({
        title: 'Record diviso',
        description: `Creati ${newRecords.length} record`,
        variant: 'success'
      })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante la divisione.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleClone = async (newRecords: RecordCreate[]) => {
    try {
      if (cloneRecord_) {
        await deleteRecord(cloneRecord_.id)
      }
      for (const recordData of newRecords) {
        await createRecord(recordData)
      }
      setCloneRecord(null)
      toast({
        title: 'Record clonato',
        description: `Creati ${newRecords.length} record`,
        variant: 'success'
      })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante la clonazione.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  // Bulk operations handlers
  const handleBulkDelete = (selectedRecords: Record[]) => {
    setRecordsToDelete(selectedRecords)
  }

  const confirmBulkDelete = async () => {
    if (!recordsToDelete) return
    try {
      for (const record of recordsToDelete) {
        await deleteRecord(record.id)
      }
      toast({ title: 'Record eliminati', description: `${recordsToDelete.length} record eliminati`, variant: 'success' })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante l\'eliminazione.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    } finally {
      setRecordsToDelete(null)
    }
  }

  const handleBulkMerge = async () => {
    if (!bulkRecords || bulkRecords.length < 2) return

    try {
      const totalAmount = bulkRecords.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0)
      const totalTotal = bulkRecords.reduce((sum, r) => sum + parseFloat(r.total || '0'), 0)
      const firstRecord = bulkRecords[0]

      // Create merged record
      await createRecord({
        area: firstRecord.area,
        type: firstRecord.type,
        date_cashflow: firstRecord.date_cashflow,
        date_offer: firstRecord.date_offer,
        account: firstRecord.account,
        reference: `${firstRecord.reference} (unione di ${bulkRecords.length} record)`,
        amount: totalAmount.toString(),
        total: totalTotal.toString(),
        stage: firstRecord.stage,
        owner: firstRecord.owner,
        nextaction: firstRecord.nextaction,
        transaction_id: firstRecord.transaction_id || '',
      })

      // Delete original records
      for (const record of bulkRecords) {
        await deleteRecord(record.id)
      }

      setShowBulkMerge(false)
      setBulkRecords(null)
      toast({ title: 'Record uniti', description: `${bulkRecords.length} record uniti in uno`, variant: 'success' })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante l\'unione.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleBulkMoveDates = async (days: number, months: number) => {
    if (!bulkRecords) return

    try {
      for (const record of bulkRecords) {
        const date = new Date(record.date_cashflow)
        date.setDate(date.getDate() + days)
        date.setMonth(date.getMonth() + months)
        await updateRecord({
          recordId: record.id,
          data: { date_cashflow: date.toISOString().split('T')[0] }
        })
      }

      setShowBulkMoveDates(false)
      setBulkRecords(null)
      toast({ title: 'Date spostate', description: `${bulkRecords.length} record aggiornati`, variant: 'success' })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante lo spostamento.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleBulkSetDay = async (day: number) => {
    if (!bulkRecords) return

    try {
      for (const record of bulkRecords) {
        const date = new Date(record.date_cashflow)
        // Handle months with fewer days
        const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
        date.setDate(Math.min(day, lastDayOfMonth))
        await updateRecord({
          recordId: record.id,
          data: { date_cashflow: date.toISOString().split('T')[0] }
        })
      }

      setShowBulkSetDay(false)
      setBulkRecords(null)
      toast({ title: 'Giorni impostati', description: `${bulkRecords.length} record aggiornati`, variant: 'success' })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante l\'aggiornamento.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleBulkTransfer = async (toArea: Area, note?: string) => {
    if (!bulkRecords) return

    try {
      for (const record of bulkRecords) {
        await transferRecord({ recordId: record.id, toArea, note })
      }

      setShowBulkTransfer(false)
      setBulkRecords(null)
      toast({ title: 'Record trasferiti', description: `${bulkRecords.length} record trasferiti`, variant: 'success' })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante il trasferimento.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleBulkSetStage = async (stage: string) => {
    if (!bulkRecords) return

    try {
      for (const record of bulkRecords) {
        await updateRecord({
          recordId: record.id,
          data: { stage }
        })
      }

      setShowBulkStage(false)
      setBulkRecords(null)
      toast({ title: 'Stage aggiornato', description: `${bulkRecords.length} record aggiornati`, variant: 'success' })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante l\'aggiornamento.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleBulkMoveWorkspace = async (targetWorkspaceId: string) => {
    if (!bulkRecords) return

    try {
      for (const record of bulkRecords) {
        const recordData: RecordCreate = {
          area: record.area,
          type: record.type,
          account: record.account,
          reference: record.reference,
          note: record.note,
          date_cashflow: record.date_cashflow,
          date_offer: record.date_offer,
          owner: record.owner,
          amount: record.amount,
          vat: record.vat,
          total: record.total,
          stage: record.stage,
          nextaction: record.nextaction,
          transaction_id: record.transaction_id || '',
          bank_account_id: record.bank_account_id,
          project_code: record.project_code,
          classification: record.classification,
        }
        await recordsApi.create(targetWorkspaceId, recordData)
        await deleteRecord(record.id, record.workspace_id)
      }

      setShowBulkMoveWorkspace(false)
      setBulkRecords(null)
      // Invalidate target workspace queries too
      queryClient.invalidateQueries({ queryKey: ['records', targetWorkspaceId] })
      toast({ title: 'Record spostati', description: `${bulkRecords.length} record spostati nel nuovo workspace`, variant: 'success' })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante lo spostamento.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleBulkEdit = async (data: RecordUpdate) => {
    if (!bulkRecords) return

    try {
      for (const record of bulkRecords) {
        await updateRecord({
          recordId: record.id,
          data,
        })
      }

      setShowBulkEdit(false)
      setBulkRecords(null)
      toast({ title: 'Record aggiornati', description: `${bulkRecords.length} record modificati`, variant: 'success' })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante la modifica massiva.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleBulkExport = (selectedRecords: Record[]) => {
    const headers = ['Data', 'Conto', 'Riferimento', 'ID Transazione', 'Responsabile', 'Imponibile', 'Totale', 'Stage', 'Area', 'Revisione']
    const rows = selectedRecords.map(r => [
      r.date_cashflow,
      r.account,
      r.reference,
      r.transaction_id || '',
      r.owner || '',
      r.amount,
      r.total,
      r.stage,
      r.area,
      r.review_date || '',
    ])

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `export-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)

    toast({ title: 'Export completato', description: `${selectedRecords.length} record esportati`, variant: 'success' })
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Area Tabs */}
        <div>
          <Tabs value={currentArea} onValueChange={(v) => setArea(v as Area)}>
            <TabsList className="w-full justify-start rounded-none border-none bg-transparent p-0 h-auto">
              {AREAS.map((area) => (
                <TabsTrigger
                  key={area}
                  value={area}
                  className="flex-1 rounded-none border-b-2 border-border py-2.5 data-[state=active]:border-primary data-[state=active]:border-b-[3px] data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:shadow-none"
                >
                  {AREA_LABELS[area]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <RecordFilters availableOwners={records.map(r => r.owner).filter(Boolean) as string[]} />

        <div className="flex-1 min-h-0 p-4">
          <RecordGrid
            records={records}
            isLoading={isLoading}
            onSelectRecord={setSelectedRecord}
            onSplitRecord={setSplitRecord}
            onCloneRecord={setCloneRecord}
            onBulkDelete={handleBulkDelete}
            onBulkMerge={(recs) => { setBulkRecords(recs); setShowBulkMerge(true) }}
            onBulkMoveDates={(recs) => { setBulkRecords(recs); setShowBulkMoveDates(true) }}
            onBulkSetDay={(recs) => { setBulkRecords(recs); setShowBulkSetDay(true) }}
            onBulkExport={handleBulkExport}
            onBulkTransfer={(recs) => { setBulkRecords(recs); setShowBulkTransfer(true) }}
            onBulkSetStage={(recs) => { setBulkRecords(recs); setShowBulkStage(true) }}
            onBulkMoveWorkspace={(recs) => { setBulkRecords(recs); setShowBulkMoveWorkspace(true) }}
            onBulkEdit={(recs) => { setBulkRecords(recs); setShowBulkEdit(true) }}
            visitedRecordIds={visitedRecordIds}
            activeRecordId={editingRecord?.id || selectedRecord?.id}
          />
        </div>
      </div>

      {/* Right Panel — 3 states: editing, creating, detail */}
      {(selectedRecord || editingRecord || createRecordDialogOpen) && (
        <div className="w-120 border-l relative">
          {editingRecord ? (
            <RecordForm
              record={editingRecord}
              area={currentArea}
              onSubmit={(data) => handleUpdateRecord(data as RecordUpdate)}
              onCancel={() => setEditingRecord(null)}
              onClose={() => setEditingRecord(null)}
              reviewMode={reviewMode}
              onReview={handleReviewRecord}
              onPromote={handlePromoteRecord}
            />
          ) : createRecordDialogOpen ? (
            <RecordForm
              area={currentArea}
              onSubmit={(data) => handleCreateRecord(data as RecordCreate)}
              onCancel={() => setCreateRecordDialogOpen(false)}
              onClose={() => setCreateRecordDialogOpen(false)}
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

      {/* Transfer Dialog */}
      <TransferDialog
        record={transferRecord_}
        open={!!transferRecord_}
        onOpenChange={(open) => !open && setTransferRecord(null)}
        onTransfer={handleTransfer}
      />

      {/* Split Dialog */}
      <SplitDialog
        record={splitRecord_}
        open={!!splitRecord_}
        onOpenChange={(open) => !open && setSplitRecord(null)}
        onSplit={handleSplit}
      />

      {/* Clone Dialog */}
      <SplitDialog
        record={cloneRecord_}
        open={!!cloneRecord_}
        onOpenChange={(open) => !open && setCloneRecord(null)}
        onSplit={handleClone}
        mode="clone"
      />

      {/* Bulk Operation Dialogs */}
      <BulkMoveDatesDialog
        records={bulkRecords}
        open={showBulkMoveDates}
        onOpenChange={(open) => { if (!open) { setShowBulkMoveDates(false); setBulkRecords(null) } }}
        onConfirm={handleBulkMoveDates}
      />

      <BulkSetDayDialog
        records={bulkRecords}
        open={showBulkSetDay}
        onOpenChange={(open) => { if (!open) { setShowBulkSetDay(false); setBulkRecords(null) } }}
        onConfirm={handleBulkSetDay}
      />

      <BulkTransferDialog
        records={bulkRecords}
        currentArea={currentArea}
        open={showBulkTransfer}
        onOpenChange={(open) => { if (!open) { setShowBulkTransfer(false); setBulkRecords(null) } }}
        onConfirm={handleBulkTransfer}
      />

      <BulkStageDialog
        records={bulkRecords}
        currentArea={currentArea}
        open={showBulkStage}
        onOpenChange={(open) => { if (!open) { setShowBulkStage(false); setBulkRecords(null) } }}
        onConfirm={handleBulkSetStage}
      />

      <BulkMergeDialog
        records={bulkRecords}
        open={showBulkMerge}
        onOpenChange={(open) => { if (!open) { setShowBulkMerge(false); setBulkRecords(null) } }}
        onConfirm={handleBulkMerge}
      />

      <BulkMoveWorkspaceDialog
        records={bulkRecords}
        open={showBulkMoveWorkspace}
        onOpenChange={(open) => { if (!open) { setShowBulkMoveWorkspace(false); setBulkRecords(null) } }}
        onConfirm={handleBulkMoveWorkspace}
      />

      <BulkEditDialog
        records={bulkRecords}
        currentArea={currentArea}
        open={showBulkEdit}
        onOpenChange={(open) => { if (!open) { setShowBulkEdit(false); setBulkRecords(null) } }}
        onConfirm={handleBulkEdit}
      />

      {/* Delete Confirmation Dialog - Single Record */}
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

      {/* Delete Confirmation Dialog - Bulk */}
      <AlertDialog open={!!recordsToDelete} onOpenChange={(open) => !open && setRecordsToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare {recordsToDelete?.length || 0} record?
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina {recordsToDelete?.length || 0} record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
