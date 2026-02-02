import { create } from 'zustand'
import type { Area } from '@/types/record'

interface FilterState {
  currentArea: Area
  dateRange: { start: string; end: string } | null
  sign: 'in' | 'out' | 'all'
  textFilter: string
  accountFilter: string[]
  projectFilter: string | null
  bankAccountFilter: string | null

  setArea: (area: Area) => void
  setDateRange: (range: { start: string; end: string } | null) => void
  setSign: (sign: 'in' | 'out' | 'all') => void
  setTextFilter: (text: string) => void
  setAccountFilter: (accounts: string[]) => void
  setProjectFilter: (projectId: string | null) => void
  setBankAccountFilter: (accountId: string | null) => void
  resetFilters: () => void
}

const initialState = {
  currentArea: 'actual' as Area,
  dateRange: null,
  sign: 'all' as const,
  textFilter: '',
  accountFilter: [],
  projectFilter: null,
  bankAccountFilter: null,
}

export const useFilterStore = create<FilterState>()((set) => ({
  ...initialState,

  setArea: (area) => set({ currentArea: area }),

  setDateRange: (range) => set({ dateRange: range }),

  setSign: (sign) => set({ sign }),

  setTextFilter: (text) => set({ textFilter: text }),

  setAccountFilter: (accounts) => set({ accountFilter: accounts }),

  setProjectFilter: (projectId) => set({ projectFilter: projectId }),

  setBankAccountFilter: (accountId) => set({ bankAccountFilter: accountId }),

  resetFilters: () => set(initialState),
}))
