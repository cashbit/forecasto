import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '@/api/projects'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { Project, ProjectCreate, ProjectUpdate } from '@/types/project'

export function useProjects() {
  const selectedWorkspaceIds = useWorkspaceStore(state => state.selectedWorkspaceIds)
  const queryClient = useQueryClient()

  // Fetch projects from all selected workspaces using combine
  const { projects, isLoading, isError } = useQueries({
    queries: selectedWorkspaceIds.map(workspaceId => ({
      queryKey: ['projects', workspaceId],
      queryFn: () => projectsApi.list(workspaceId),
      staleTime: 30000,
    })),
    combine: (results) => {
      const isLoading = results.some(r => r.isLoading)
      const isError = results.some(r => r.isError)

      // Merge all projects from all workspaces
      let allProjects: Project[] = []
      for (const result of results) {
        if (result.data) {
          allProjects = allProjects.concat(result.data)
        }
      }

      return {
        projects: allProjects,
        isLoading,
        isError,
      }
    },
  })

  const invalidateAllWorkspaces = () => {
    selectedWorkspaceIds.forEach(workspaceId => {
      queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] })
    })
  }

  // For mutations, use the first selected workspace
  const primaryWorkspaceId = selectedWorkspaceIds[0]

  const createMutation = useMutation({
    mutationFn: (data: ProjectCreate) => projectsApi.create(primaryWorkspaceId!, data),
    onSuccess: () => {
      invalidateAllWorkspaces()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ projectId, data, workspaceId }: { projectId: string; data: ProjectUpdate; workspaceId?: string }) =>
      projectsApi.update(workspaceId || primaryWorkspaceId!, projectId, data),
    onSuccess: () => {
      invalidateAllWorkspaces()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({ projectId, workspaceId }: { projectId: string; workspaceId?: string }) =>
      projectsApi.delete(workspaceId || primaryWorkspaceId!, projectId),
    onSuccess: () => {
      invalidateAllWorkspaces()
    },
  })

  return {
    projects,
    isLoading,
    isError,
    createProject: createMutation.mutateAsync,
    updateProject: (params: { projectId: string; data: ProjectUpdate; workspaceId?: string }) => updateMutation.mutateAsync(params),
    deleteProject: (projectId: string, workspaceId?: string) => deleteMutation.mutateAsync({ projectId, workspaceId }),
  }
}
