import { useState } from 'react'
import { Plus, BarChart3, FolderKanban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RecordGrid } from '@/components/records/RecordGrid'
import { RecordFilters } from '@/components/records/RecordFilters'
import { RecordDetail } from '@/components/records/RecordDetail'
import { RecordForm } from '@/components/records/RecordForm'
import { TransferDialog } from '@/components/records/TransferDialog'
import { ProjectList } from '@/components/projects/ProjectList'
import { OperationList } from '@/components/operations/OperationList'
import { useRecords } from '@/hooks/useRecords'
import { useProjects } from '@/hooks/useProjects'
import { useFilterStore } from '@/stores/filterStore'
import { useSessionStore } from '@/stores/sessionStore'
import { AREA_LABELS, AREAS } from '@/lib/constants'
import type { Record, Area, RecordCreate, RecordUpdate } from '@/types/record'

export function DashboardPage() {
  const { currentArea, setArea } = useFilterStore()
  const { activeSession } = useSessionStore()
  const { records, isLoading, createRecord, updateRecord, deleteRecord, transferRecord } = useRecords()
  const { projects, isLoading: projectsLoading } = useProjects()

  const [viewMode, setViewMode] = useState<'area' | 'project'>('area')
  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null)
  const [editingRecord, setEditingRecord] = useState<Record | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [transferRecord_, setTransferRecord] = useState<Record | null>(null)
  const [showOperations, setShowOperations] = useState(false)

  const handleCreateRecord = async (data: RecordCreate) => {
    await createRecord(data)
    setShowCreateForm(false)
  }

  const handleUpdateRecord = async (data: RecordUpdate) => {
    if (!editingRecord) return
    await updateRecord({ recordId: editingRecord.id, data })
    setEditingRecord(null)
    setSelectedRecord(null)
  }

  const handleDeleteRecord = async (record: Record) => {
    if (confirm('Sei sicuro di voler eliminare questo record?')) {
      await deleteRecord(record.id)
      setSelectedRecord(null)
    }
  }

  const handleTransfer = async (recordId: string, toArea: Area, note?: string) => {
    await transferRecord({ recordId, toArea, note })
    setTransferRecord(null)
  }

  return (
    <div className="flex h-[calc(100vh-7rem)]">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'area' | 'project')}>
              <TabsList>
                <TabsTrigger value="area">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Per Area
                </TabsTrigger>
                <TabsTrigger value="project">
                  <FolderKanban className="mr-2 h-4 w-4" />
                  Per Progetto
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOperations(!showOperations)}
              >
                Operazioni
              </Button>
              <Button
                size="sm"
                onClick={() => setShowCreateForm(true)}
                disabled={!activeSession}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nuovo Record
              </Button>
            </div>
          </div>
        </div>

        {/* Area View */}
        {viewMode === 'area' && (
          <>
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

            <RecordFilters />

            <div className="flex-1 overflow-auto p-4">
              <RecordGrid
                records={records}
                isLoading={isLoading}
                onSelectRecord={setSelectedRecord}
                onEditRecord={setEditingRecord}
                onDeleteRecord={handleDeleteRecord}
                onTransferRecord={setTransferRecord}
              />
            </div>
          </>
        )}

        {/* Project View */}
        {viewMode === 'project' && (
          <div className="flex-1 overflow-auto">
            <ProjectList projects={projects} isLoading={projectsLoading} />
          </div>
        )}
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
      {showOperations && (
        <div className="w-80 border-l">
          <OperationList />
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateForm || !!editingRecord} onOpenChange={(open) => {
        if (!open) {
          setShowCreateForm(false)
          setEditingRecord(null)
        }
      }}>
        <DialogContent className="max-w-lg">
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
              setShowCreateForm(false)
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
    </div>
  )
}
