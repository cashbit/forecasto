import { Anchor } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AmountDisplay } from '@/components/common/AmountDisplay'
import { DateDisplay } from '@/components/common/DateDisplay'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { CashflowEntry } from '@/types/cashflow'

interface CashflowTableProps {
  data: CashflowEntry[]
}

export function CashflowTable({ data }: CashflowTableProps) {
  return (
    <TooltipProvider>
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
            {data.map((entry) => {
              const hasSnapshot = entry.balance_snapshot != null
              return (
                <TableRow
                  key={entry.date}
                  className={hasSnapshot ? 'bg-blue-50/60 dark:bg-blue-950/20' : undefined}
                >
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <DateDisplay date={entry.date} />
                      {hasSnapshot && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <Anchor className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p className="text-xs">
                              Saldo dichiarato:{' '}
                              <AmountDisplay
                                amount={entry.balance_snapshot!}
                                showSign={false}
                                className="inline font-semibold"
                              />
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
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
              )
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  )
}
