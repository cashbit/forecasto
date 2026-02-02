import { Badge } from '@/components/ui/badge'
import { STAGE_LABELS } from '@/lib/constants'

interface StatusBadgeProps {
  status: string
  className?: string
}

const statusVariants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive' | 'income' | 'expense'> = {
  draft: 'outline',
  approved: 'default',
  lead: 'secondary',
  qualified: 'secondary',
  proposal: 'default',
  negotiation: 'default',
  confirmed: 'income',
  scheduled: 'default',
  in_progress: 'default',
  pending: 'outline',
  reconciled: 'income',
  active: 'income',
  completed: 'default',
  archived: 'secondary',
  discarded: 'destructive',
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = statusVariants[status] || 'outline'
  const label = STAGE_LABELS[status] || status

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  )
}
