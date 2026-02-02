import { Calendar, User } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/common/StatusBadge'
import { DateDisplay } from '@/components/common/DateDisplay'
import { AmountDisplay } from '@/components/common/AmountDisplay'
import type { Project } from '@/types/project'

interface ProjectCardProps {
  project: Project
  onClick?: () => void
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  return (
    <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={onClick}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{project.name}</CardTitle>
            <CardDescription>{project.code}</CardDescription>
          </div>
          <StatusBadge status={project.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {project.client && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span>{project.client}</span>
          </div>
        )}

        {(project.start_date || project.end_date) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              {project.start_date && <DateDisplay date={project.start_date} />}
              {project.start_date && project.end_date && ' - '}
              {project.end_date && <DateDisplay date={project.end_date} />}
            </span>
          </div>
        )}

        {project.budget_amount && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Budget:</span>
            <AmountDisplay amount={project.budget_amount} showSign={false} />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Badge variant="outline">{project.phases.length} fasi</Badge>
        </div>
      </CardContent>
    </Card>
  )
}
