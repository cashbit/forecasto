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
import { Textarea } from '@/components/ui/textarea'
import type { Record, Area } from '@/types/record'
import { AREAS, AREA_LABELS } from '@/lib/constants'

interface BulkTransferDialogProps {
  records: Record[] | null
  currentArea: Area
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (toArea: Area, note?: string) => void
}

export function BulkTransferDialog({
  records,
  currentArea,
  open,
  onOpenChange,
  onConfirm,
}: BulkTransferDialogProps) {
  const [toArea, setToArea] = useState<Area | ''>('')
  const [note, setNote] = useState('')

  const availableAreas = AREAS.filter(a => a !== currentArea)

  const handleConfirm = () => {
    if (toArea) {
      onConfirm(toArea, note || undefined)
      setToArea('')
      setNote('')
    }
  }

  if (!records) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trasferisci Record</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Trasferisci {records.length} record da {AREA_LABELS[currentArea]} a un'altra area.
          </p>
          <div className="space-y-2">
            <Label>Area di destinazione</Label>
            <Select value={toArea} onValueChange={(v) => setToArea(v as Area)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona area" />
              </SelectTrigger>
              <SelectContent>
                {availableAreas.map((area) => (
                  <SelectItem key={area} value={area}>
                    {AREA_LABELS[area]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Nota (opzionale)</Label>
            <Textarea
              id="note"
              placeholder="Motivo del trasferimento..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleConfirm} disabled={!toArea}>
            Trasferisci
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
