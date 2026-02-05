import { cn } from '@/lib/utils'

interface AmountDisplayProps {
  amount: string | number
  className?: string
}

function formatCurrency(value: number): string {
  const absValue = Math.abs(value)
  // Format with 2 decimal places
  const parts = absValue.toFixed(2).split('.')
  // Add thousands separator (dot) to integer part
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  // Join with comma as decimal separator
  const formatted = parts.join(',')
  // Add minus sign for negative values
  return value < 0 ? '-' + formatted : formatted
}

export function AmountDisplay({ amount, className }: AmountDisplayProps) {
  const numericAmount = typeof amount === 'number' ? amount : parseFloat(amount || '0') || 0
  const isPositive = numericAmount >= 0

  const formatted = formatCurrency(numericAmount)

  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        isPositive ? 'text-income' : 'text-expense',
        className
      )}
    >
      {formatted}
    </span>
  )
}
