import { useState, useEffect, useCallback } from 'react'
import { Wallet, TrendingUp, TrendingDown, PiggyBank, ChevronDown, ChevronUp, Download } from 'lucide-react'
import { startOfMonth, endOfMonth, addMonths, format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CashflowChart } from '@/components/cashflow/CashflowChart'
import { CashflowTable } from '@/components/cashflow/CashflowTable'
import { CashflowFilters } from '@/components/cashflow/CashflowFilters'
import { BalanceSnapshotsDialog } from '@/components/cashflow/BalanceSnapshotsDialog'
import { CashflowDrilldownPanel } from '@/components/cashflow/CashflowDrilldownPanel'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { AmountDisplay } from '@/components/common/AmountDisplay'
import { useCashflow } from '@/hooks/useCashflow'
import type { CashflowParams, CashflowEntry } from '@/types/cashflow'

interface SummaryCardProps {
  title: string
  value?: number
  icon: React.ReactNode
  className?: string
}

function SummaryCard({ title, value, icon, className }: SummaryCardProps) {
  return (
    <Card className="py-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
        <CardTitle className="text-xs font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="pb-0 px-4">
        {value !== undefined ? (
          <AmountDisplay amount={value} className={`text-xl font-bold ${className}`} showSign={false} />
        ) : (
          <span className="text-xl font-bold text-muted-foreground">-</span>
        )}
      </CardContent>
    </Card>
  )
}

function exportCsv(data: CashflowEntry[]) {
  const header = ['Data', 'Entrate', 'Uscite', 'Netto', 'Saldo']
  const rows = data.map((e) => [
    e.date,
    e.inflows.toFixed(2),
    e.outflows.toFixed(2),
    e.net.toFixed(2),
    e.running_balance.toFixed(2),
  ])
  const csv = [header, ...rows].map((r) => r.join(';')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'cashflow.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function CashflowPage() {
  const [params, setParams] = useState<CashflowParams>({
    from_date: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    to_date: format(endOfMonth(addMonths(new Date(), 5)), 'yyyy-MM-dd'),
    areas: ['actual'],
    area_stage: ['actual:0', 'actual:1'],
    group_by: 'day',
  })
  const [snapshotsOpen, setSnapshotsOpen] = useState(false)
  const [tableOpen, setTableOpen] = useState(false)
  const [drilldownEntry, setDrilldownEntry] = useState<CashflowEntry | null>(null)
  const [chartHeight, setChartHeight] = useState(() => Math.max(300, window.innerHeight - 440))

  const updateHeight = useCallback(() => {
    setChartHeight(Math.max(300, window.innerHeight - 440))
  }, [])

  useEffect(() => {
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [updateHeight])

  const { cashflow, summary, initialBalance, isLoading } = useCashflow(params)

  return (
    <div className="p-6 space-y-4">
      <CashflowFilters params={params} onChange={setParams} onSnapshotsOpen={() => setSnapshotsOpen(true)} />

      <BalanceSnapshotsDialog
        open={snapshotsOpen}
        onOpenChange={setSnapshotsOpen}
        cashflowParams={params}
      />

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
            <div className="flex items-center justify-center" style={{ height: chartHeight }}>
              <LoadingSpinner size="lg" />
            </div>
          ) : cashflow.length > 0 ? (
            <CashflowChart
              data={cashflow}
              height={chartHeight}
              bankAccounts={initialBalance?.by_account}
              onBarClick={setDrilldownEntry}
            />
          ) : (
            <div className="flex items-center justify-center text-muted-foreground" style={{ height: chartHeight }}>
              Nessun dato disponibile per il periodo selezionato
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Table */}
      {!isLoading && cashflow.length > 0 && (
        <Card>
          <CardHeader
            className="flex flex-row items-center justify-between py-3 px-4 cursor-pointer select-none"
            onClick={() => setTableOpen((o) => !o)}
          >
            <CardTitle className="text-sm font-medium">Dettaglio per Data</CardTitle>
            <div className="flex items-center gap-2">
              {tableOpen && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => { e.stopPropagation(); exportCsv(cashflow) }}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  CSV
                </Button>
              )}
              {tableOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </CardHeader>
          {tableOpen && (
            <CardContent className="p-0">
              <CashflowTable data={cashflow} />
            </CardContent>
          )}
        </Card>
      )}
      {drilldownEntry && (
        <CashflowDrilldownPanel
          entry={drilldownEntry}
          params={params}
          onClose={() => setDrilldownEntry(null)}
        />
      )}
    </div>
  )
}
