import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AmountDisplay } from '@/components/common/AmountDisplay'
import { DateDisplay } from '@/components/common/DateDisplay'
import type { CashflowEntry } from '@/types/cashflow'

interface CashflowTableProps {
  data: CashflowEntry[]
}

export function CashflowTable({ data }: CashflowTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Entrate</TableHead>
            <TableHead className="text-right">Uscite</TableHead>
            <TableHead className="text-right">Netto</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((entry) => (
            <TableRow key={entry.date}>
              <TableCell>
                <DateDisplay date={entry.date} />
              </TableCell>
              <TableCell className="text-right">
                <AmountDisplay amount={entry.inflows} showSign={false} className="text-income" />
              </TableCell>
              <TableCell className="text-right">
                <AmountDisplay amount={entry.outflows} showSign={false} className="text-expense" />
              </TableCell>
              <TableCell className="text-right">
                <AmountDisplay amount={entry.net} />
              </TableCell>
              <TableCell className="text-right font-medium">
                <AmountDisplay amount={entry.running_balance} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
