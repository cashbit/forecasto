import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AREAS, AREA_LABELS } from '@/lib/constants'
import type { Record, Area } from '@/types/record'

interface TransferDialogProps {
  record: Record | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onTransfer: (recordId: string, toArea: Area, note?: string) => void
}

export function TransferDialog({ record, open, onOpenChange, onTransfer }: TransferDialogProps) {
  const [toArea, setToArea] = useState<Area | ''>('')
  const [note, setNote] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const availableAreas = AREAS.filter((a) => a !== record?.area)

  const handleTransfer = async () => {
    if (!record || !toArea) return

    setIsLoading(true)
    try {
      onTransfer(record.id, toArea, note || undefined)
      setToArea('')
      setNote('')
      onOpenChange(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setToArea('')
    setNote('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" />
            Trasferisci Record
          </DialogTitle>
          <DialogDescription>
            Trasferisci il record "{record?.reference}" da {record && AREA_LABELS[record.area]} a
            un'altra area.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
            <Label>Note (opzionale)</Label>
            <Textarea
              placeholder="Motivo del trasferimento..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Annulla
          </Button>
          <Button onClick={handleTransfer} disabled={!toArea || isLoading}>
            {isLoading ? 'Trasferimento...' : 'Trasferisci'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
