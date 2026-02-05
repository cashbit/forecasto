import { create } from 'zustand'

interface UiState {
  sidebarOpen: boolean
  rightPanelOpen: boolean
  rightPanelContent: 'details' | 'operations' | 'chat' | null
  selectedRecordId: string | null
  createWorkspaceDialogOpen: boolean
  createRecordDialogOpen: boolean

  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleRightPanel: () => void
  setRightPanelOpen: (open: boolean) => void
  setRightPanelContent: (content: 'details' | 'operations' | 'chat' | null) => void
  setSelectedRecordId: (id: string | null) => void
  setCreateWorkspaceDialogOpen: (open: boolean) => void
  setCreateRecordDialogOpen: (open: boolean) => void
  closeAllDialogs: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  sidebarOpen: true,
  rightPanelOpen: false,
  rightPanelContent: null,
  selectedRecordId: null,
  createWorkspaceDialogOpen: false,
  createRecordDialogOpen: false,

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

  setCreateWorkspaceDialogOpen: (open) => set({ createWorkspaceDialogOpen: open }),
  setCreateRecordDialogOpen: (open) => set({ createRecordDialogOpen: open }),

  closeAllDialogs: () =>
    set({
      createWorkspaceDialogOpen: false,
      createRecordDialogOpen: false,
    }),
}))
