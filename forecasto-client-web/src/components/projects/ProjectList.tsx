import { ProjectCard } from './ProjectCard'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import type { Project } from '@/types/project'
import { FolderKanban } from 'lucide-react'

interface ProjectListProps {
  projects: Project[]
  isLoading?: boolean
  onSelectProject?: (project: Project) => void
}

export function ProjectList({ projects, isLoading, onSelectProject }: ProjectListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Nessun progetto"
        description="Crea un nuovo progetto per organizzare i tuoi record"
      />
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 p-4">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} onClick={() => onSelectProject?.(project)} />
      ))}
    </div>
  )
}
