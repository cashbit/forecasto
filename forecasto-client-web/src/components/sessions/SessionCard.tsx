import { Clock, FileEdit } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DateDisplay } from '@/components/common/DateDisplay'
import type { Session } from '@/types/session'
import { cn } from '@/lib/utils'

interface SessionCardProps {
  session: Session
  isActive: boolean
  onClick: () => void
}

export function SessionCard({ session, isActive, onClick }: SessionCardProps) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors hover:bg-muted/50',
        isActive && 'border-primary bg-primary/5'
      )}
      onClick={onClick}
    >
      <CardHeader className="p-3 pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium truncate">{session.title}</CardTitle>
          {isActive && (
            <Badge variant="income" className="text-xs">
              Attiva
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <FileEdit className="h-3 w-3" />
            <span>{session.operations_count} op.</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <DateDisplay date={session.created_at} format="datetime" className="text-xs" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
