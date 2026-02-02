import { cn } from '@/lib/utils'

interface AmountDisplayProps {
  amount: string | number
  showSign?: boolean
  className?: string
}

export function AmountDisplay({ amount, showSign = true, className }: AmountDisplayProps) {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount
  const isPositive = numericAmount >= 0

  const formatted = new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    signDisplay: showSign ? 'always' : 'auto',
  }).format(numericAmount)

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
