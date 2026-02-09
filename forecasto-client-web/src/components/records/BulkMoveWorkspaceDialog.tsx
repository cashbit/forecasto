import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Record } from '@/types/record'
import { useWorkspaceStore } from '@/stores/workspaceStore'

interface BulkMoveWorkspaceDialogProps {
  records: Record[] | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (targetWorkspaceId: string) => void
}

export function BulkMoveWorkspaceDialog({
  records,
  open,
  onOpenChange,
  onConfirm,
}: BulkMoveWorkspaceDialogProps) {
  const [targetWorkspaceId, setTargetWorkspaceId] = useState('')
  const { workspaces, selectedWorkspaceIds } = useWorkspaceStore()

  // Exclude workspaces that are currently selected (source of the records)
  const availableWorkspaces = workspaces.filter(w => !selectedWorkspaceIds.includes(w.id))

  const handleConfirm = () => {
    if (targetWorkspaceId) {
      onConfirm(targetWorkspaceId)
      setTargetWorkspaceId('')
    }
  }

  if (!records) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sposta in altro Workspace</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Sposta {records.length} record in un altro workspace.
          </p>
          <div className="space-y-2">
            <Label>Workspace di destinazione</Label>
            <Select value={targetWorkspaceId} onValueChange={setTargetWorkspaceId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona workspace" />
              </SelectTrigger>
              <SelectContent>
                {availableWorkspaces.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>
                    {ws.name}{ws.fiscal_year ? ` (${ws.fiscal_year})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleConfirm} disabled={!targetWorkspaceId}>
            Sposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
