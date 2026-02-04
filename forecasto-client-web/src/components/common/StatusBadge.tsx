import { Badge } from '@/components/ui/badge'
import { getStageLabel } from '@/lib/constants'

interface StatusBadgeProps {
  status: string
  area?: string
  className?: string
}

// Map legacy values to 0/1 for variant lookup
const LEGACY_VARIANT_MAP: Record<string, string> = {
  unpaid: '0',
  paid: '1',
  draft: '0',
  approved: '1',
}

const statusVariants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive' | 'income' | 'expense'> = {
  '0': 'outline',
  '1': 'income',
  active: 'income',
  completed: 'default',
  archived: 'secondary',
  discarded: 'destructive',
}

export function StatusBadge({ status, area, className }: StatusBadgeProps) {
  const normalizedStatus = LEGACY_VARIANT_MAP[status] || status
  const variant = statusVariants[normalizedStatus] || 'outline'
  const label = getStageLabel(status, area)

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  )
}
