import { formatDate, formatDateTime, formatDateLong } from '@/lib/formatters'
import { cn } from '@/lib/utils'

interface DateDisplayProps {
  date: string | Date | null | undefined
  format?: 'short' | 'long' | 'datetime'
  className?: string
}

export function DateDisplay({ date, format = 'short', className }: DateDisplayProps) {
  const formatter = {
    short: formatDate,
    long: formatDateLong,
    datetime: formatDateTime,
  }[format]

  return <span className={cn('text-sm', className)}>{formatter(date)}</span>
}
