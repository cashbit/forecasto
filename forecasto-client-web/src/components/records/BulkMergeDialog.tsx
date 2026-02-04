import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AmountDisplay } from '@/components/common/AmountDisplay'
import type { Record } from '@/types/record'

interface BulkMergeDialogProps {
  records: Record[] | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function BulkMergeDialog({
  records,
  open,
  onOpenChange,
  onConfirm,
}: BulkMergeDialogProps) {
  if (!records || records.length < 2) return null

  const totalAmount = records.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0)
  const totalTotal = records.reduce((sum, r) => sum + parseFloat(r.total || '0'), 0)
  const firstRecord = records[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unisci Record</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Unisci {records.length} record in un unico record.
          </p>
          <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
            <p>
              <strong>Data:</strong> {firstRecord.date_cashflow} (dal primo record)
            </p>
            <p>
              <strong>Conto:</strong> {firstRecord.account}
            </p>
            <p>
              <strong>Riferimento:</strong> {firstRecord.reference} (unione di {records.length} record)
            </p>
            <div className="border-t pt-2 mt-2">
              <p>
                <strong>Imponibile totale:</strong> <AmountDisplay amount={totalAmount} />
              </p>
              <p>
                <strong>Totale:</strong> <AmountDisplay amount={totalTotal} />
              </p>
            </div>
          </div>
          <p className="text-sm text-destructive">
            I record originali verranno eliminati.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={onConfirm}>
            Unisci
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
