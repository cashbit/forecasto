import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '@/api/projects'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ProjectCreate, ProjectUpdate } from '@/types/project'

export function useProjects() {
  const { currentWorkspaceId } = useWorkspaceStore()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['projects', currentWorkspaceId],
    queryFn: () => projectsApi.list(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  })

  const createMutation = useMutation({
    mutationFn: (data: ProjectCreate) => projectsApi.create(currentWorkspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', currentWorkspaceId] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: ProjectUpdate }) =>
      projectsApi.update(currentWorkspaceId!, projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', currentWorkspaceId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (projectId: string) => projectsApi.delete(currentWorkspaceId!, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', currentWorkspaceId] })
    },
  })

  return {
    projects: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    createProject: createMutation.mutateAsync,
    updateProject: updateMutation.mutateAsync,
    deleteProject: deleteMutation.mutateAsync,
  }
}
