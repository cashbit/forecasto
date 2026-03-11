import { create } from 'zustand'
import type { Area, TextFilterField } from '@/types/record'

interface FilterState {
  selectedAreas: Area[]
  dateRange: { start: string; end: string } | null
  yearFilter: number | null
  monthFilter: number | null
  dayFilter: number | null
  sign: 'in' | 'out' | 'all'
  stageFilter: '0' | '1' | 'all'
  ownerFilter: string[]
  nextactionFilter: 'all' | 'with' | 'without'
  expiredFilter: 'all' | 'yes' | 'no'
  textFilter: string
  textFilterField: TextFilterField | null
  accountFilter: string[]
  projectCodeFilter: string | null
  bankAccountFilter: string | null
  includeDeleted: boolean

  selectSingleArea: (area: Area) => void
  toggleAreaSelection: (area: Area) => void
  setDateRange: (range: { start: string; end: string } | null) => void
  setYearFilter: (year: number | null) => void
  setMonthFilter: (month: number | null) => void
  setDayFilter: (day: number | null) => void
  setSign: (sign: 'in' | 'out' | 'all') => void
  setStageFilter: (stage: '0' | '1' | 'all') => void
  toggleOwnerFilter: (owner: string) => void
  clearOwnerFilter: () => void
  setNextactionFilter: (filter: 'all' | 'with' | 'without') => void
  setExpiredFilter: (filter: 'all' | 'yes' | 'no') => void
  setTextFilter: (text: string) => void
  setTextFilterField: (field: TextFilterField | null) => void
  setAccountFilter: (accounts: string[]) => void
  setProjectCodeFilter: (code: string | null) => void
  setBankAccountFilter: (accountId: string | null) => void
  setIncludeDeleted: (v: boolean) => void
  resetFilters: () => void
}

const initialState = {
  selectedAreas: ['actual'] as Area[],
  dateRange: null,
  yearFilter: null as number | null,
  monthFilter: null as number | null,
  dayFilter: null as number | null,
  sign: 'all' as const,
  stageFilter: 'all' as const,
  ownerFilter: [] as string[],
  nextactionFilter: 'all' as const,
  expiredFilter: 'all' as const,
  textFilter: '',
  textFilterField: null as TextFilterField | null,
  accountFilter: [],
  projectCodeFilter: null,
  bankAccountFilter: null,
  includeDeleted: false,
}

export const useFilterStore = create<FilterState>()((set) => ({
  ...initialState,

  selectSingleArea: (area) => set({ selectedAreas: [area] }),

  toggleAreaSelection: (area) => set((state) => {
    const isSelected = state.selectedAreas.includes(area)
    // Prevent deselecting the last area
    if (isSelected && state.selectedAreas.length === 1) return state
    return {
      selectedAreas: isSelected
        ? state.selectedAreas.filter(a => a !== area)
        : [...state.selectedAreas, area],
    }
  }),

  setDateRange: (range) => set({ dateRange: range }),

  setYearFilter: (year) => set({ yearFilter: year, monthFilter: null, dayFilter: null }),

  setMonthFilter: (month) => set((state) => ({
    yearFilter: state.yearFilter ?? new Date().getFullYear(),
    monthFilter: month,
    dayFilter: null,
  })),

  setDayFilter: (day) => set((state) => {
    const now = new Date()
    return {
      yearFilter: state.yearFilter ?? now.getFullYear(),
      monthFilter: state.monthFilter ?? (now.getMonth() + 1),
      dayFilter: day,
    }
  }),

  setSign: (sign) => set({ sign }),

  setStageFilter: (stage) => set({ stageFilter: stage }),

  toggleOwnerFilter: (owner) => set((state) => ({
    ownerFilter: state.ownerFilter.includes(owner)
      ? state.ownerFilter.filter(o => o !== owner)
      : [...state.ownerFilter, owner]
  })),

  clearOwnerFilter: () => set({ ownerFilter: [] }),

  setNextactionFilter: (filter) => set({ nextactionFilter: filter }),

  setExpiredFilter: (filter) => set({ expiredFilter: filter }),

  setTextFilter: (text) => set({ textFilter: text }),

  setTextFilterField: (field) => set({ textFilterField: field }),

  setAccountFilter: (accounts) => set({ accountFilter: accounts }),

  setProjectCodeFilter: (code) => set({ projectCodeFilter: code }),

  setBankAccountFilter: (accountId) => set({ bankAccountFilter: accountId }),

  setIncludeDeleted: (v) => set({ includeDeleted: v }),

  resetFilters: () => set((state) => ({ ...initialState, selectedAreas: state.selectedAreas })),
}))
