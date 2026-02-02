import { useState } from 'react'
import { Wallet, TrendingUp, TrendingDown, PiggyBank } from 'lucide-react'
import { startOfMonth, endOfMonth, addMonths, format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CashflowChart } from '@/components/cashflow/CashflowChart'
import { CashflowTable } from '@/components/cashflow/CashflowTable'
import { CashflowFilters } from '@/components/cashflow/CashflowFilters'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { AmountDisplay } from '@/components/common/AmountDisplay'
import { useCashflow } from '@/hooks/useCashflow'
import type { CashflowParams } from '@/types/cashflow'

interface SummaryCardProps {
  title: string
  value?: number
  icon: React.ReactNode
  className?: string
}

function SummaryCard({ title, value, icon, className }: SummaryCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {value !== undefined ? (
          <AmountDisplay amount={value} className={`text-2xl font-bold ${className}`} showSign={false} />
        ) : (
          <span className="text-2xl font-bold text-muted-foreground">-</span>
        )}
      </CardContent>
    </Card>
  )
}

export function CashflowPage() {
  const [params, setParams] = useState<CashflowParams>({
    from_date: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    to_date: format(endOfMonth(addMonths(new Date(), 2)), 'yyyy-MM-dd'),
    areas: ['actual', 'orders'],
    group_by: 'day',
  })

  const { cashflow, summary, initialBalance, isLoading } = useCashflow(params)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cashflow Forecast</h1>
      </div>

      <CashflowFilters params={params} onChange={setParams} />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Saldo Iniziale"
          value={initialBalance?.total}
          icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
        />
        <SummaryCard
          title="Entrate Previste"
          value={summary?.total_inflows}
          icon={<TrendingUp className="h-4 w-4 text-income" />}
          className="text-income"
        />
        <SummaryCard
          title="Uscite Previste"
          value={summary?.total_outflows}
          icon={<TrendingDown className="h-4 w-4 text-expense" />}
          className="text-expense"
        />
        <SummaryCard
          title="Saldo Finale"
          value={summary?.final_balance}
          icon={<PiggyBank className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Andamento Cashflow</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-[400px]">
              <LoadingSpinner size="lg" />
            </div>
          ) : cashflow.length > 0 ? (
            <CashflowChart data={cashflow} />
          ) : (
            <div className="flex items-center justify-center h-[400px] text-muted-foreground">
              Nessun dato disponibile per il periodo selezionato
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Table */}
      {!isLoading && cashflow.length > 0 && <CashflowTable data={cashflow} />}
    </div>
  )
}
