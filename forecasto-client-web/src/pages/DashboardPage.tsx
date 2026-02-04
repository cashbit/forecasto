import { useState, useEffect } from 'react'
import { AxiosError } from 'axios'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { OperationList } from '@/components/operations/OperationList'
import { useRecords } from '@/hooks/useRecords'
import { useFilterStore } from '@/stores/filterStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useUiStore } from '@/stores/uiStore'
import { toast } from '@/hooks/useToast'
import { AREA_LABELS, AREAS } from '@/lib/constants'
import type { Record, Area, RecordCreate, RecordUpdate } from '@/types/record'

export function DashboardPage() {
  const { currentArea, setArea } = useFilterStore()
  const { activeSession, activeSessionId, fetchOperations } = useSessionStore()
  const { currentWorkspaceId } = useWorkspaceStore()
  const { rightPanelContent, createRecordDialogOpen, setCreateRecordDialogOpen } = useUiStore()
  const { records, isLoading, createRecord, updateRecord, deleteRecord, transferRecord } = useRecords()

  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null)
  const [editingRecord, setEditingRecord] = useState<Record | null>(null)
  const [transferRecord_, setTransferRecord] = useState<Record | null>(null)
  const [splitRecord_, setSplitRecord] = useState<Record | null>(null)

  // Bulk operations state
  const [bulkRecords, setBulkRecords] = useState<Record[] | null>(null)
  const [showBulkMoveDates, setShowBulkMoveDates] = useState(false)
  const [showBulkSetDay, setShowBulkSetDay] = useState(false)
  const [showBulkTransfer, setShowBulkTransfer] = useState(false)
  const [showBulkStage, setShowBulkStage] = useState(false)
  const [showBulkMerge, setShowBulkMerge] = useState(false)

  // Fetch operations when session changes
  useEffect(() => {
    if (currentWorkspaceId && activeSessionId) {
      fetchOperations(currentWorkspaceId, activeSessionId)
    }
  }, [currentWorkspaceId, activeSessionId, fetchOperations])

  const handleCreateRecord = async (data: RecordCreate) => {
    if (!activeSession) {
      toast({
        title: 'Sessione richiesta',
        description: 'Devi avere una sessione attiva per creare record.',
        variant: 'destructive',
      })
      return
    }
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
    if (!activeSession) {
      toast({
        title: 'Sessione richiesta',
        description: 'Devi avere una sessione attiva per modificare i record.',
        variant: 'destructive',
      })
      return
    }
    try {
      await updateRecord({ recordId: editingRecord.id, data })
      setEditingRecord(null)
      setSelectedRecord(null)
      toast({ title: 'Record aggiornato', variant: 'success' })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante l\'aggiornamento.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  const handleDeleteRecord = async (record: Record) => {
    if (!activeSession) {
      toast({
        title: 'Sessione richiesta',
        description: 'Devi avere una sessione attiva per eliminare i record.',
        variant: 'destructive',
      })
      return
    }
    if (confirm('Sei sicuro di voler eliminare questo record?')) {
      try {
        await deleteRecord(record.id)
        setSelectedRecord(null)
        toast({ title: 'Record eliminato', variant: 'success' })
      } catch (error) {
        const axiosError = error as AxiosError<{ error?: string; message?: string }>
        const message = axiosError.response?.data?.error || 'Errore durante l\'eliminazione.'
        toast({ title: 'Errore', description: message, variant: 'destructive' })
      }
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

  const handleSplit = async (records: RecordCreate[]) => {
    if (!activeSession) {
      toast({
        title: 'Sessione richiesta',
        description: 'Devi avere una sessione attiva per dividere i record.',
        variant: 'destructive',
      })
      return
    }

    try {
      // First delete the original record
      if (splitRecord_) {
        await deleteRecord(splitRecord_.id)
      }

      // Then create all the new installment records
      for (const recordData of records) {
        await createRecord(recordData)
      }

      setSplitRecord(null)
      toast({
        title: 'Record diviso',
        description: `Creati ${records.length} record`,
        variant: 'success'
      })
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>
      const message = axiosError.response?.data?.error || 'Errore durante la divisione.'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  // Bulk operations handlers
  const handleBulkDelete = async (selectedRecords: Record[]) => {
    if (!activeSession) {
      toast({
        title: 'Sessione richiesta',
        description: 'Devi avere una sessione attiva per eliminare i record.',
        variant: 'destructive',
      })
      return
    }
    if (confirm(`Sei sicuro di voler eliminare ${selectedRecords.length} record?`)) {
      try {
        for (const record of selectedRecords) {
          await deleteRecord(record.id)
        }
        toast({ title: 'Record eliminati', description: `${selectedRecords.length} record eliminati`, variant: 'success' })
      } catch (error) {
        const axiosError = error as AxiosError<{ error?: string; message?: string }>
        const message = axiosError.response?.data?.error || 'Errore durante l\'eliminazione.'
        toast({ title: 'Errore', description: message, variant: 'destructive' })
      }
    }
  }

  const handleBulkMerge = async () => {
    if (!activeSession || !bulkRecords || bulkRecords.length < 2) return

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
    if (!activeSession || !bulkRecords) return

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
    if (!activeSession || !bulkRecords) return

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
    if (!activeSession || !bulkRecords) return

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

  const handleBulkExport = (selectedRecords: Record[]) => {
    const headers = ['Data', 'Conto', 'Riferimento', 'ID Transazione', 'Responsabile', 'Imponibile', 'Totale', 'Stage', 'Area']
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
    <div className="flex h-[calc(100vh-7rem)]">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Area Tabs */}
        <div className="border-b">
          <Tabs value={currentArea} onValueChange={(v) => setArea(v as Area)}>
            <TabsList className="w-full justify-start rounded-none border-none bg-transparent p-0">
              {AREAS.map((area) => (
                <TabsTrigger
                  key={area}
                  value={area}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  {AREA_LABELS[area]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <RecordFilters availableOwners={records.map(r => r.owner).filter(Boolean) as string[]} />

        <div className="flex-1 overflow-auto p-4">
          <RecordGrid
            records={records}
            isLoading={isLoading}
            onSelectRecord={setSelectedRecord}
            onEditRecord={setEditingRecord}
            onDeleteRecord={handleDeleteRecord}
            onTransferRecord={setTransferRecord}
            onSplitRecord={setSplitRecord}
            onBulkDelete={handleBulkDelete}
            onBulkMerge={(recs) => { setBulkRecords(recs); setShowBulkMerge(true) }}
            onBulkMoveDates={(recs) => { setBulkRecords(recs); setShowBulkMoveDates(true) }}
            onBulkSetDay={(recs) => { setBulkRecords(recs); setShowBulkSetDay(true) }}
            onBulkExport={handleBulkExport}
            onBulkTransfer={(recs) => { setBulkRecords(recs); setShowBulkTransfer(true) }}
            onBulkSetStage={(recs) => { setBulkRecords(recs); setShowBulkStage(true) }}
          />
        </div>
      </div>

      {/* Right Panel */}
      {selectedRecord && !editingRecord && (
        <div className="w-80 border-l">
          <RecordDetail
            record={selectedRecord}
            onClose={() => setSelectedRecord(null)}
            onEdit={() => setEditingRecord(selectedRecord)}
          />
        </div>
      )}

      {/* Operations Panel */}
      {rightPanelContent === 'operations' && (
        <div className="w-80 border-l">
          <OperationList />
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={createRecordDialogOpen || !!editingRecord} onOpenChange={(open) => {
        if (!open) {
          setCreateRecordDialogOpen(false)
          setEditingRecord(null)
        }
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingRecord ? 'Modifica Record' : 'Nuovo Record'}
            </DialogTitle>
          </DialogHeader>
          <RecordForm
            record={editingRecord || undefined}
            area={currentArea}
            onSubmit={(data) => {
              if (editingRecord) {
                handleUpdateRecord(data as RecordUpdate)
              } else {
                handleCreateRecord(data as RecordCreate)
              }
            }}
            onCancel={() => {
              setCreateRecordDialogOpen(false)
              setEditingRecord(null)
            }}
          />
        </DialogContent>
      </Dialog>

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
    </div>
  )
}
