import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Record } from '@/types/record'

interface BulkMoveDatesDialogProps {
  records: Record[] | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (days: number, months: number) => void
}

export function BulkMoveDatesDialog({
  records,
  open,
  onOpenChange,
  onConfirm,
}: BulkMoveDatesDialogProps) {
  const [days, setDays] = useState(0)
  const [months, setMonths] = useState(0)

  const handleConfirm = () => {
    onConfirm(days, months)
    setDays(0)
    setMonths(0)
  }

  if (!records) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sposta Date</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Sposta le date di {records.length} record selezionati.
            Usa valori negativi per spostare indietro.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="days">Giorni</Label>
              <Input
                id="days"
                type="number"
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="months">Mesi</Label>
              <Input
                id="months"
                type="number"
                value={months}
                onChange={(e) => setMonths(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleConfirm} disabled={days === 0 && months === 0}>
            Sposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
