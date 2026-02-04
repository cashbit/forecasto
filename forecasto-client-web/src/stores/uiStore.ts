import { create } from 'zustand'

interface UiState {
  sidebarOpen: boolean
  rightPanelOpen: boolean
  rightPanelContent: 'details' | 'operations' | 'chat' | null
  selectedRecordId: string | null
  createSessionDialogOpen: boolean
  createWorkspaceDialogOpen: boolean
  commitDialogOpen: boolean
  discardDialogOpen: boolean
  conflictDialogOpen: boolean

  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleRightPanel: () => void
  setRightPanelOpen: (open: boolean) => void
  setRightPanelContent: (content: 'details' | 'operations' | 'chat' | null) => void
  setSelectedRecordId: (id: string | null) => void
  setCreateSessionDialogOpen: (open: boolean) => void
  setCreateWorkspaceDialogOpen: (open: boolean) => void
  setCommitDialogOpen: (open: boolean) => void
  setDiscardDialogOpen: (open: boolean) => void
  setConflictDialogOpen: (open: boolean) => void
  closeAllDialogs: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  sidebarOpen: true,
  rightPanelOpen: false,
  rightPanelContent: null,
  selectedRecordId: null,
  createSessionDialogOpen: false,
  createWorkspaceDialogOpen: false,
  commitDialogOpen: false,
  discardDialogOpen: false,
  conflictDialogOpen: false,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),

  setRightPanelContent: (content) => set({ rightPanelContent: content, rightPanelOpen: content !== null }),

  setSelectedRecordId: (id) =>
    set({
      selectedRecordId: id,
      rightPanelContent: id ? 'details' : null,
      rightPanelOpen: id !== null,
    }),

  setCreateSessionDialogOpen: (open) => set({ createSessionDialogOpen: open }),
  setCreateWorkspaceDialogOpen: (open) => set({ createWorkspaceDialogOpen: open }),
  setCommitDialogOpen: (open) => set({ commitDialogOpen: open }),
  setDiscardDialogOpen: (open) => set({ discardDialogOpen: open }),
  setConflictDialogOpen: (open) => set({ conflictDialogOpen: open }),

  closeAllDialogs: () =>
    set({
      createSessionDialogOpen: false,
      createWorkspaceDialogOpen: false,
      commitDialogOpen: false,
      discardDialogOpen: false,
      conflictDialogOpen: false,
    }),
}))
