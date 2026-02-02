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
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { formatCurrency } from '@/lib/formatters'
import type { CashflowEntry } from '@/types/cashflow'

interface CashflowChartProps {
  data: CashflowEntry[]
}

export function CashflowChart({ data }: CashflowChartProps) {
  const chartData = data.map((entry) => ({
    ...entry,
    date: entry.date,
    dateLabel: format(parseISO(entry.date), 'dd/MM', { locale: it }),
  }))

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
            name === 'inflows' ? 'Entrate' : name === 'outflows' ? 'Uscite' : 'Saldo',
          ]}
          labelFormatter={(label) => `Data: ${label}`}
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
        />
        <Legend
          formatter={(value) =>
            value === 'inflows' ? 'Entrate' : value === 'outflows' ? 'Uscite' : 'Saldo'
          }
        />
        <Bar dataKey="inflows" fill="#16A34A" name="inflows" radius={[4, 4, 0, 0]} />
        <Bar dataKey="outflows" fill="#DC2626" name="outflows" radius={[4, 4, 0, 0]} />
        <Line
          type="monotone"
          dataKey="running_balance"
          stroke="#2563EB"
          strokeWidth={2}
          dot={false}
          name="running_balance"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
