import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { Record, Area } from '@/types/record'
import { STAGE_LABELS_BY_AREA } from '@/lib/constants'

interface BulkStageDialogProps {
  records: Record[] | null
  currentArea: Area
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (stage: string) => void
}

export function BulkStageDialog({
  records,
  currentArea,
  open,
  onOpenChange,
  onConfirm,
}: BulkStageDialogProps) {
  const [stage, setStage] = useState<string>('')

  const stageLabels = STAGE_LABELS_BY_AREA[currentArea] || { '0': 'Stage 0', '1': 'Stage 1' }

  const handleConfirm = () => {
    if (stage) {
      onConfirm(stage)
      setStage('')
    }
  }

  if (!records) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambia Stage</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Cambia lo stage di {records.length} record selezionati.
          </p>
          <div className="space-y-2">
            <Label>Nuovo Stage</Label>
            <RadioGroup value={stage} onValueChange={setStage}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="0" id="stage-0" />
                <Label htmlFor="stage-0" className="cursor-pointer">
                  {stageLabels['0']} (0)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="1" id="stage-1" />
                <Label htmlFor="stage-1" className="cursor-pointer">
                  {stageLabels['1']} (1)
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleConfirm} disabled={!stage}>
            Applica
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
