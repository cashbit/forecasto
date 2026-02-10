import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { AmountDisplay } from '@/components/common/AmountDisplay'
import { DateDisplay } from '@/components/common/DateDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { AREA_LABELS } from '@/lib/constants'
import type { Record } from '@/types/record'

interface RecordDetailProps {
  record: Record
  onClose: () => void
  onEdit?: () => void
}

export function RecordDetail({ record, onClose, onEdit }: RecordDetailProps) {
  return (
    <Card className="h-full border-0 rounded-none flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 flex-shrink-0">
        <CardTitle className="text-lg">Dettaglio Record</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <Separator className="flex-shrink-0" />
      <CardContent className="pt-4 space-y-4 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between">
          <Badge variant="outline">{AREA_LABELS[record.area]}</Badge>
          <StatusBadge status={record.stage} area={record.area} />
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Conto</p>
          <p className="font-medium">{record.account}</p>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Riferimento</p>
          <p className="font-medium">{record.reference}</p>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">ID Transazione</p>
          <p className="font-mono text-sm">{record.transaction_id || '-'}</p>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Progetto</p>
          <p className="font-mono text-sm">{record.project_code || '-'}</p>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Responsabile</p>
          <p className="font-medium">{record.owner || '-'}</p>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Prossima Azione</p>
          <p className="font-medium text-amber-600 dark:text-amber-400">{record.nextaction || '-'}</p>
        </div>

        {record.note && (
          <div>
            <p className="text-sm text-muted-foreground">Note</p>
            <p className="text-sm whitespace-pre-line">{record.note}</p>
          </div>
        )}

        <Separator />

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Imponibile</p>
            <AmountDisplay amount={record.amount} className="text-lg" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">IVA</p>
            <p className="text-lg font-medium">{parseFloat(record.vat || '0').toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Detraz. IVA</p>
            <p className="text-lg font-medium">{parseFloat(record.vat_deduction || '100').toFixed(0)}%</p>
          </div>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Totale</p>
          <AmountDisplay amount={record.total} className="text-xl font-bold" />
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Data Cashflow</p>
            <DateDisplay date={record.date_cashflow} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Data Offerta</p>
            <DateDisplay date={record.date_offer} />
          </div>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Prossima Revisione</p>
          {record.review_date ? (
            <DateDisplay date={record.review_date} />
          ) : (
            <p className="text-sm">-</p>
          )}
        </div>

        {record.classification?.source_file && (
          <>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground">File sorgente</p>
              <p className="font-mono text-sm">{record.classification.source_file}</p>
            </div>
          </>
        )}

        {record.transfer_history && record.transfer_history.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground mb-2">Cronologia Trasferimenti</p>
              <div className="space-y-2">
                {record.transfer_history.map((transfer, idx) => (
                  <div key={idx} className="text-sm bg-muted p-2 rounded">
                    <p>
                      {AREA_LABELS[transfer.from_area]} → {AREA_LABELS[transfer.to_area]}
                    </p>
                    <p className="text-muted-foreground">
                      <DateDisplay date={transfer.transferred_at} format="datetime" />
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </CardContent>
      <div className="flex-shrink-0 p-4 border-t">
        <Button className="w-full" onClick={onEdit}>
          Modifica Record
        </Button>
      </div>
    </Card>
  )
}
