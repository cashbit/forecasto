import { useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { formatCurrency } from '@/lib/formatters'
import type { CashflowEntry, AccountBalance } from '@/types/cashflow'

// Colors for per-account lines (distinct from the total line blue #2563EB)
const ACCOUNT_COLORS = [
  '#E91E63', // pink
  '#FF9800', // orange
  '#9C27B0', // purple
  '#009688', // teal
  '#795548', // brown
  '#607D8B', // blue-grey
  '#F44336', // red
  '#4CAF50', // green
]

interface AccountInfo {
  id: string
  name: string
  color: string
}

interface CashflowChartProps {
  data: CashflowEntry[]
  height?: number
  bankAccounts?: Record<string, AccountBalance>
}

export function CashflowChart({ data, height = 400, bankAccounts }: CashflowChartProps) {
  // Discover which accounts are present in the data
  const accountInfos = useMemo<AccountInfo[]>(() => {
    if (!bankAccounts) return []

    const accountIds = new Set<string>()
    for (const entry of data) {
      if (entry.by_account) {
        for (const id of Object.keys(entry.by_account)) {
          accountIds.add(id)
        }
      }
    }

    return Array.from(accountIds).map((id, index) => ({
      id,
      name: bankAccounts[id]?.name || `Conto ${index + 1}`,
      color: ACCOUNT_COLORS[index % ACCOUNT_COLORS.length],
    }))
  }, [data, bankAccounts])

  // Track which lines are hidden via legend clicks
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set())

  const toggleLine = (dataKey: string) => {
    setHiddenLines(prev => {
      const next = new Set(prev)
      if (next.has(dataKey)) {
        next.delete(dataKey)
      } else {
        next.add(dataKey)
      }
      return next
    })
  }

  // Flatten by_account data into top-level keys for Recharts
  const chartData = useMemo(() => {
    return data.map((entry) => {
      const flat: Record<string, unknown> = {
        ...entry,
        date: entry.date,
        dateLabel: format(parseISO(entry.date), 'dd/MM', { locale: it }),
      }

      // Add per-account running_balance as flat keys
      if (entry.by_account) {
        for (const account of accountInfos) {
          const accountData = entry.by_account[account.id]
          if (accountData) {
            flat[`balance_${account.id}`] = accountData.running_balance
          }
        }
      }

      return flat
    })
  }, [data, accountInfos])

  // Build label mapping for tooltip/legend
  const labelMap = useMemo(() => {
    const map: Record<string, string> = {
      inflows: 'Entrate',
      outflows: 'Uscite',
      running_balance: 'Saldo Totale',
    }
    for (const account of accountInfos) {
      map[`balance_${account.id}`] = account.name
    }
    return map
  }, [accountInfos])

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <ReferenceLine y={0} stroke="#888" strokeDasharray="3 3" />
        <XAxis
          dataKey="dateLabel"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(value, name) => [
            formatCurrency(value as number),
            labelMap[name as string] || String(name),
          ]}
          labelFormatter={(label) => `Data: ${label}`}
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
        />
        <Legend
          formatter={(value) => labelMap[value] || value}
          onClick={(e) => {
            if (e && e.dataKey) {
              toggleLine(e.dataKey as string)
            }
          }}
          wrapperStyle={{ cursor: 'pointer' }}
        />
        <Bar
          dataKey="inflows"
          fill="#16A34A"
          name="inflows"
          radius={[4, 4, 0, 0]}
          hide={hiddenLines.has('inflows')}
        />
        <Bar
          dataKey="outflows"
          fill="#DC2626"
          name="outflows"
          radius={[4, 4, 0, 0]}
          hide={hiddenLines.has('outflows')}
        />
        <Line
          type="monotone"
          dataKey="running_balance"
          stroke="#2563EB"
          strokeWidth={2}
          dot={(props: { cx: number; cy: number; payload: { balance_snapshot?: number | null } }) => {
            if (props.payload?.balance_snapshot != null) {
              return (
                <circle
                  key={`dot-${props.cx}-${props.cy}`}
                  cx={props.cx}
                  cy={props.cy}
                  r={5}
                  fill="#2563EB"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )
            }
            return <g key={`dot-${props.cx}-${props.cy}`} />
          }}
          name="running_balance"
          hide={hiddenLines.has('running_balance')}
        />
        {/* Per-account balance lines */}
        {accountInfos.map((account) => (
          <Line
            key={account.id}
            type="monotone"
            dataKey={`balance_${account.id}`}
            stroke={account.color}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            name={`balance_${account.id}`}
            hide={hiddenLines.has(`balance_${account.id}`)}
            connectNulls
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
