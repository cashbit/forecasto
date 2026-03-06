import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TourState {
  tourActive: boolean
  tourStep: number
  tourRecordId: string | null
  tourSplitRecordIds: string[]
  hasSeenTour: boolean

  startTour: () => void
  stopTour: () => void
  setTourStep: (step: number) => void
  setTourRecordId: (id: string | null) => void
  setTourSplitRecordIds: (ids: string[]) => void
  markTourSeen: () => void
  resetTourSeen: () => void
}

export const useTourStore = create<TourState>()(
  persist(
    (set) => ({
      tourActive: false,
      tourStep: 0,
      tourRecordId: null,
      tourSplitRecordIds: [],
      hasSeenTour: false,

      startTour: () => set({ tourActive: true, tourStep: 0, tourRecordId: null, tourSplitRecordIds: [] }),
      stopTour: () => set({ tourActive: false, tourStep: 0, tourRecordId: null, tourSplitRecordIds: [] }),
      setTourStep: (step) => set({ tourStep: step }),
      setTourRecordId: (id) => set({ tourRecordId: id }),
      setTourSplitRecordIds: (ids) => set({ tourSplitRecordIds: ids }),
      markTourSeen: () => set({ hasSeenTour: true }),
      resetTourSeen: () => set({ hasSeenTour: false }),
    }),
    {
      name: 'forecasto-tour',
      partialize: (state) => ({ hasSeenTour: state.hasSeenTour }),
    }
  )
)
