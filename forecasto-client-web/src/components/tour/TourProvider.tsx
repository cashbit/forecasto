import { createContext, useContext, useRef, useCallback, useEffect } from 'react'
import { driver, type DriveStep, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tourStyles.css'
import { useTourStore } from '@/stores/tourStore'
import { useFilterStore } from '@/stores/filterStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useRecords } from '@/hooks/useRecords'
import { toast } from '@/hooks/useToast'
import { createTourSteps, type TourContext, type TourStepDef } from './tourSteps'

interface DashboardActions {
  openSplitForRecord?: (record: unknown) => void
  selectRecord?: (record: unknown) => void
  editRecord?: (record: unknown) => void
  selectAndEditRecord?: (record: unknown) => void
  getRecords?: () => unknown[]
}

interface TourContextType {
  registerDashboardActions: (actions: DashboardActions) => void
  startTour: () => void
}

const TourCtx = createContext<TourContextType>({
  registerDashboardActions: () => {},
  startTour: () => {},
})

export function useTourContext() {
  return useContext(TourCtx)
}

async function waitForElement(selector: string, timeout = 3000): Promise<Element | null> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector)
    if (el) return el
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return null
}

function scrollToElement(el: Element) {
  // Find the closest scrollable ancestor and scroll within it
  let parent = el.parentElement
  while (parent) {
    const style = window.getComputedStyle(parent)
    const overflowY = style.overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    parent = parent.parentElement
  }
  // Fallback: scroll in viewport
  (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function flashElement(selector: string) {
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) return
  el.classList.remove('tour-flash')
  // Force reflow
  void el.offsetWidth
  el.classList.add('tour-flash')
  setTimeout(() => el.classList.remove('tour-flash'), 1200)
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const driverRef = useRef<Driver | null>(null)
  const dashboardActionsRef = useRef<DashboardActions>({})
  const stepsRef = useRef<TourStepDef[]>([])
  const currentStepRef = useRef(0)
  const isRunningRef = useRef(false)

  const tourStore = useTourStore()
  const filterStore = useFilterStore()
  const uiStore = useUiStore()
  const { selectedWorkspaceIds } = useWorkspaceStore()
  const { updateRecord, transferRecord, records, primaryWorkspaceId } = useRecords()

  const handleTourEnd = useCallback(async (completed: boolean) => {
    isRunningRef.current = false
    driverRef.current?.destroy()
    driverRef.current = null

    useTourStore.getState().stopTour()
    useUiStore.getState().setCreateRecordDialogOpen(false)

    if (completed) {
      useTourStore.getState().markTourSeen()
      toast({ title: 'Tour completato!', description: 'I record demo restano nel workspace. Puoi eliminarli quando vuoi.', variant: 'success' })
    } else {
      toast({ title: 'Tour interrotto', description: 'I record demo restano nel workspace. Puoi eliminarli quando vuoi.', variant: 'default' })
    }
  }, [])

  const goToStep = useCallback(async (index: number) => {
    if (!isRunningRef.current) return
    const steps = stepsRef.current
    if (index < 0 || index >= steps.length) {
      // Tour complete
      await handleTourEnd(index >= steps.length)
      return
    }

    currentStepRef.current = index
    useTourStore.getState().setTourStep(index)
    const stepDef = steps[index]

    try {
      // Before running beforeStep, move driver highlight off the current element
      // to prevent driver.js from auto-closing when the element disappears (e.g. form panel closing)
      if (stepDef.beforeStep && driverRef.current) {
        try {
          driverRef.current.highlight({
            element: 'body',
            popover: { title: '⏳', description: 'Caricamento...', showButtons: [] },
          })
        } catch { /* ignore */ }
      }

      // Execute beforeStep action
      if (stepDef.beforeStep) {
        await stepDef.beforeStep()
      }

      // Wait for target element
      if (stepDef.waitForSelector) {
        const waitEl = await waitForElement(stepDef.waitForSelector, stepDef.waitTimeout || 3000)
        if (waitEl) {
          scrollToElement(waitEl)
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }

      // Wait for main element and scroll it into view
      const mainEl = await waitForElement(stepDef.elementSelector, 2000)
      if (mainEl) {
        scrollToElement(mainEl)
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      // Flash highlight
      if (stepDef.flashSelector) {
        flashElement(stepDef.flashSelector)
      }

      // Show driver highlight
      if (driverRef.current) {
        const isLast = index === steps.length - 1
        const isFirst = index === 0

        driverRef.current.highlight({
          element: stepDef.elementSelector,
          popover: {
            title: stepDef.popover.title,
            description: stepDef.popover.description,
            side: stepDef.popover.side || 'bottom',
            onNextClick: () => {
              goToStep(index + 1)
            },
            onPrevClick: () => {
              if (!isFirst) goToStep(index - 1)
            },
            onCloseClick: () => {
              handleTourEnd(false)
            },
            ...(isLast
              ? { nextBtnText: 'Fine', showButtons: ['next', 'close'] }
              : isFirst
                ? { showButtons: ['next', 'close'] }
                : { showButtons: ['previous', 'next', 'close'] }),
          },
        })
      }
    } catch (error) {
      console.error(`Tour step ${stepDef.id} failed:`, error)
      toast({ title: 'Errore nel tour', description: 'Si è verificato un errore. Il tour verrà interrotto.', variant: 'destructive' })
      await handleTourEnd(false)
    }
  }, [handleTourEnd])

  const startTour = useCallback(() => {
    if (selectedWorkspaceIds.length === 0) {
      toast({ title: 'Seleziona un workspace', description: 'Seleziona almeno un workspace prima di iniziare la guida.', variant: 'destructive' })
      return
    }

    // Build tour context — use getter for dashboardActions so it always reads from the ref
    const ctx: TourContext = {
      setArea: filterStore.selectSingleArea,
      setCreateRecordDialogOpen: uiStore.setCreateRecordDialogOpen,
      primaryWorkspaceId: primaryWorkspaceId || selectedWorkspaceIds[0],
      updateRecord,
      transferRecord,
      setTourRecordId: useTourStore.getState().setTourRecordId,
      setTourSplitRecordIds: useTourStore.getState().setTourSplitRecordIds,
      getTourRecordId: () => useTourStore.getState().tourRecordId,
      getTourSplitRecordIds: () => useTourStore.getState().tourSplitRecordIds,
      get dashboardActions() { return dashboardActionsRef.current },
    }

    stepsRef.current = createTourSteps(ctx)
    currentStepRef.current = 0
    isRunningRef.current = true

    useTourStore.getState().startTour()

    // Create driver instance
    driverRef.current = driver({
      showProgress: true,
      allowClose: true,
      overlayColor: 'rgba(0,0,0,0.5)',
      stagePadding: 8,
      stageRadius: 8,
      popoverClass: 'forecasto-tour-popover',
      progressText: '{{current}} di {{total}}',
      nextBtnText: 'Avanti',
      prevBtnText: 'Indietro',
      doneBtnText: 'Fine',
    })

    // Start from step 0
    goToStep(0)
  }, [selectedWorkspaceIds, filterStore, uiStore, primaryWorkspaceId, updateRecord, transferRecord, goToStep])

  const registerDashboardActions = useCallback((actions: DashboardActions) => {
    Object.assign(dashboardActionsRef.current, actions)
  }, [])

  // Expose getRecords from current records
  useEffect(() => {
    if (dashboardActionsRef.current) {
      dashboardActionsRef.current.getRecords = () => records
    }
  }, [records])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (driverRef.current) {
        driverRef.current.destroy()
      }
    }
  }, [])

  return (
    <TourCtx.Provider value={{ registerDashboardActions, startTour }}>
      {children}
    </TourCtx.Provider>
  )
}
