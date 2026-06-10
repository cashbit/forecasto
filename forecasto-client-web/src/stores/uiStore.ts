import { create } from 'zustand'

export type RecentFilter = 'all' | 'today' | 'week' | 'month'
export type VatMode = 'gross' | 'net'

const VAT_MODE_STORAGE_KEY = 'forecasto-dashboard-vat-mode'

function readVatMode(): VatMode {
  if (typeof window === 'undefined') return 'gross'
  return window.localStorage.getItem(VAT_MODE_STORAGE_KEY) === 'net' ? 'net' : 'gross'
}

interface UiState {
  sidebarOpen: boolean
  rightPanelOpen: boolean
  rightPanelContent: 'details' | 'chat' | null
  selectedRecordId: string | null
  createWorkspaceDialogOpen: boolean
  createRecordDialogOpen: boolean
  reviewMode: boolean
  recentFilter: RecentFilter
  vatMode: VatMode

  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleRightPanel: () => void
  setRightPanelOpen: (open: boolean) => void
  setRightPanelContent: (content: 'details' | 'chat' | null) => void
  setSelectedRecordId: (id: string | null) => void
  setCreateWorkspaceDialogOpen: (open: boolean) => void
  setCreateRecordDialogOpen: (open: boolean) => void
  closeAllDialogs: () => void
  toggleReviewMode: () => void
  setReviewMode: (enabled: boolean) => void
  setRecentFilter: (value: RecentFilter) => void
  setVatMode: (value: VatMode) => void
  toggleVatMode: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  sidebarOpen: false,
  rightPanelOpen: false,
  rightPanelContent: null,
  selectedRecordId: null,
  createWorkspaceDialogOpen: false,
  createRecordDialogOpen: false,
  reviewMode: false,
  recentFilter: 'all',
  vatMode: readVatMode(),

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

  toggleReviewMode: () => set((state) => ({ reviewMode: !state.reviewMode })),
  setReviewMode: (enabled) => set({ reviewMode: enabled }),

  setRecentFilter: (value) => set({ recentFilter: value }),

  setVatMode: (value) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VAT_MODE_STORAGE_KEY, value)
    }
    set({ vatMode: value })
  },

  toggleVatMode: () =>
    set((state) => {
      const next: VatMode = state.vatMode === 'gross' ? 'net' : 'gross'
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(VAT_MODE_STORAGE_KEY, next)
      }
      return { vatMode: next }
    }),
}))
