import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { workspacesApi } from '@/api/workspaces'
import { recordsApi } from '@/api/records'
import type { Workspace, WorkspaceMember, Area as WsArea, Sign, PermissionType } from '@/types/workspace'
import type { RecordCreate, Area } from '@/types/record'

interface WorkspaceState {
  workspaces: Workspace[]
  selectedWorkspaceIds: string[]
  currentMember: WorkspaceMember | null
  isLoading: boolean
  fetchWorkspaces: () => Promise<void>
  toggleWorkspaceSelection: (workspaceId: string) => void
  setSelectedWorkspaces: (workspaceIds: string[]) => void
  selectAllWorkspaces: () => void
  deselectAllWorkspaces: () => void
  createWorkspace: (name: string, description?: string) => Promise<Workspace | undefined>
  updateWorkspace: (workspaceId: string, data: Partial<Workspace>) => Promise<void>
  deleteWorkspace: (workspaceId: string) => Promise<void>
  duplicateWorkspace: (workspaceId: string, newName: string) => Promise<Workspace | undefined>
  mergeWorkspaces: (workspaceIds: string[], targetName: string) => Promise<void>
  setCurrentMember: (member: WorkspaceMember | null) => void
  checkPermission: (area: WsArea, sign: Sign, permission: PermissionType, recordCreatorId?: string, currentUserId?: string) => boolean
  getPrimaryWorkspace: () => Workspace | undefined
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      selectedWorkspaceIds: [],
      currentMember: null,
      isLoading: false,

      fetchWorkspaces: async () => {
        set({ isLoading: true })
        try {
          const workspaces = await workspacesApi.list()
          const { selectedWorkspaceIds } = get()

          // Keep only valid selections, or select first workspace if none selected
          const validSelectedIds = selectedWorkspaceIds.filter(id =>
            workspaces.some(w => w.id === id)
          )
          const finalSelectedIds = validSelectedIds.length > 0
            ? validSelectedIds
            : workspaces.length > 0 ? [workspaces[0].id] : []

          set({
            workspaces,
            selectedWorkspaceIds: finalSelectedIds,
            isLoading: false,
          })
        } catch {
          set({ isLoading: false })
        }
      },

      toggleWorkspaceSelection: (workspaceId) => {
        set((state) => {
          const isSelected = state.selectedWorkspaceIds.includes(workspaceId)
          if (isSelected) {
            // Don't allow deselecting if it's the only one selected
            if (state.selectedWorkspaceIds.length === 1) return state
            return {
              selectedWorkspaceIds: state.selectedWorkspaceIds.filter(id => id !== workspaceId)
            }
          } else {
            return {
              selectedWorkspaceIds: [...state.selectedWorkspaceIds, workspaceId]
            }
          }
        })
      },

      setSelectedWorkspaces: (workspaceIds) => {
        set({ selectedWorkspaceIds: workspaceIds })
      },

      selectAllWorkspaces: () => {
        set((state) => ({
          selectedWorkspaceIds: state.workspaces.map(w => w.id)
        }))
      },

      deselectAllWorkspaces: () => {
        set((state) => ({
          // Keep at least the first workspace selected
          selectedWorkspaceIds: state.workspaces.length > 0 ? [state.workspaces[0].id] : []
        }))
      },

      createWorkspace: async (name, description) => {
        const workspace = await workspacesApi.create({ name, description })
        set((state) => ({
          workspaces: [...state.workspaces, workspace],
          selectedWorkspaceIds: [workspace.id], // Select only the new workspace
        }))
        return workspace
      },

      updateWorkspace: async (workspaceId, data) => {
        const workspace = await workspacesApi.update(workspaceId, data)
        set((state) => ({
          workspaces: state.workspaces.map((w) => (w.id === workspaceId ? workspace : w)),
        }))
      },

      deleteWorkspace: async (workspaceId) => {
        await workspacesApi.delete(workspaceId)
        set((state) => {
          const workspaces = state.workspaces.filter((w) => w.id !== workspaceId)
          let selectedIds = state.selectedWorkspaceIds.filter(id => id !== workspaceId)
          // Ensure at least one workspace is selected
          if (selectedIds.length === 0 && workspaces.length > 0) {
            selectedIds = [workspaces[0].id]
          }
          return {
            workspaces,
            selectedWorkspaceIds: selectedIds,
          }
        })
      },

      duplicateWorkspace: async (workspaceId, newName) => {
        const sourceWorkspace = get().workspaces.find(w => w.id === workspaceId)
        if (!sourceWorkspace) return undefined

        // Create a new workspace with the new name
        const newWorkspace = await workspacesApi.create({
          name: newName,
          description: sourceWorkspace.description,
        })

        // Copy all records from source workspace to the new workspace
        const areas: Area[] = ['budget', 'prospect', 'orders', 'actual']

        for (const area of areas) {
          try {
            const response = await recordsApi.list(workspaceId, {
              area,
              page: 1,
              page_size: 10000 // Get all records
            })

            // Create copies in the new workspace
            for (const record of response.items) {
              const recordData: RecordCreate = {
                area: record.area,
                type: record.type,
                account: record.account,
                reference: record.reference,
                note: record.note,
                date_cashflow: record.date_cashflow,
                date_offer: record.date_offer,
                owner: record.owner,
                amount: record.amount,
                vat: record.vat,
                total: record.total,
                stage: record.stage,
                nextaction: record.nextaction,
                transaction_id: `dup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                bank_account_id: record.bank_account_id,
                project_code: record.project_code,
                classification: record.classification,
              }
              await recordsApi.create(newWorkspace.id, recordData)
            }
          } catch {
            // Continue with other areas even if one fails
            console.error(`Failed to duplicate records from area ${area}`)
          }
        }

        set((state) => ({
          workspaces: [...state.workspaces, newWorkspace],
          selectedWorkspaceIds: [newWorkspace.id], // Select only the new workspace
        }))

        return newWorkspace
      },

      mergeWorkspaces: async (workspaceIds, targetName) => {
        // Create a new workspace with the target name
        const newWorkspace = await workspacesApi.create({ name: targetName })

        // Move all records from source workspaces to the new workspace
        const areas: Area[] = ['budget', 'prospect', 'orders', 'actual']

        for (const sourceWorkspaceId of workspaceIds) {
          // Fetch all records from each area
          for (const area of areas) {
            try {
              const response = await recordsApi.list(sourceWorkspaceId, {
                area,
                page: 1,
                page_size: 10000 // Get all records
              })

              // Create copies in the new workspace
              for (const record of response.items) {
                const recordData: RecordCreate = {
                  area: record.area,
                  type: record.type,
                  account: record.account,
                  reference: record.reference,
                  note: record.note,
                  date_cashflow: record.date_cashflow,
                  date_offer: record.date_offer,
                  owner: record.owner,
                  amount: record.amount,
                  vat: record.vat,
                  total: record.total,
                  stage: record.stage,
                  nextaction: record.nextaction,
                  transaction_id: record.transaction_id || `merged-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  bank_account_id: record.bank_account_id,
                  project_code: record.project_code,
                  classification: record.classification,
                }
                await recordsApi.create(newWorkspace.id, recordData)
              }
            } catch {
              // Continue with other areas even if one fails
              console.error(`Failed to migrate records from area ${area}`)
            }
          }

          // Delete the source workspace after moving all records
          await workspacesApi.delete(sourceWorkspaceId)
        }

        set((state) => {
          const workspaces = state.workspaces.filter((w) => !workspaceIds.includes(w.id))
          return {
            workspaces: [...workspaces, newWorkspace],
            selectedWorkspaceIds: [newWorkspace.id], // Select only the new merged workspace
          }
        })
      },

      setCurrentMember: (member) => {
        set({ currentMember: member })
      },

      checkPermission: (area, sign, permission, recordCreatorId, currentUserId) => {
        const { currentMember, workspaces, selectedWorkspaceIds } = get()

        // Check if user is owner/admin on any selected workspace
        const selectedWorkspaces = workspaces.filter(w => selectedWorkspaceIds.includes(w.id))
        const isOwnerOrAdmin = selectedWorkspaces.some(w => w.role === 'owner' || w.role === 'admin')

        if (isOwnerOrAdmin) {
          return true
        }

        // Fall back to currentMember if set
        if (currentMember) {
          if (currentMember.role === 'owner' || currentMember.role === 'admin') {
            return true
          }

          // Get granular permissions with fallback to default all-true
          const granular = currentMember.granular_permissions || {}
          const areaPerms = granular[area] || {}
          const signPerms = areaPerms[sign] || {}

          // Default to true for backwards compatibility
          const permValue = signPerms[permission] ?? true

          // Special handling for can_edit_others/can_delete_others: if editing/deleting own record, always allowed
          if (permission === 'can_edit_others' || permission === 'can_delete_others') {
            if (recordCreatorId && currentUserId && recordCreatorId === currentUserId) {
              return true // Can always edit/delete own records
            }
          }

          return permValue
        }

        // No currentMember and not owner/admin - default to true for backwards compatibility
        return true
      },

      getPrimaryWorkspace: () => {
        const { workspaces, selectedWorkspaceIds } = get()
        if (selectedWorkspaceIds.length === 0) return undefined
        return workspaces.find(w => w.id === selectedWorkspaceIds[0])
      },
    }),
    {
      name: 'forecasto-workspace',
      partialize: (state) => ({
        selectedWorkspaceIds: state.selectedWorkspaceIds,
      }),
    }
  )
)
