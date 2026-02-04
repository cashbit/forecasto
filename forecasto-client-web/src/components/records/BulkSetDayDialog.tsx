import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Record } from '@/types/record'

interface BulkSetDayDialogProps {
  records: Record[] | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (day: number) => void
}

export function BulkSetDayDialog({
  records,
  open,
  onOpenChange,
  onConfirm,
}: BulkSetDayDialogProps) {
  const [day, setDay] = useState(1)

  const handleConfirm = () => {
    onConfirm(day)
    setDay(1)
  }

  if (!records) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Imposta Giorno del Mese</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Imposta il giorno del mese per {records.length} record selezionati.
            L'anno e il mese resteranno invariati.
          </p>
          <div className="space-y-2">
            <Label htmlFor="day">Giorno (1-31)</Label>
            <Input
              id="day"
              type="number"
              min={1}
              max={31}
              value={day}
              onChange={(e) => setDay(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleConfirm}>
            Imposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
