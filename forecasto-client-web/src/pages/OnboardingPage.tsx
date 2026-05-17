import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useRecords } from '@/hooks/useRecords'
import { toast } from '@/hooks/useToast'
import { OnboardingIntro } from '@/components/onboarding/OnboardingIntro'
import { OnboardingCategoryStep } from '@/components/onboarding/OnboardingCategoryStep'
import { OnboardingReview } from '@/components/onboarding/OnboardingReview'
import { COST_PRESETS, type OnboardingPreset } from '@/lib/onboarding-presets'
import {
  countAllRecords,
  expandAll,
  firstOfNextMonth,
  newRow,
  rowInstallmentCount,
  type OnboardingRow,
} from '@/lib/onboarding-expand'
import type { Area } from '@/types/record'

type StepKind = 'intro' | 'cost' | 'review'

interface CurrentStep {
  kind: StepKind
  presetIdx?: number
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const selectedWorkspaceIds = useWorkspaceStore((s) => s.selectedWorkspaceIds)
  const workspaceId = workspaces.find((w) => w.id === selectedWorkspaceIds[0])?.id
  const { bulkCreateRecords, isBulkCreating } = useRecords()

  const [step, setStep] = useState<CurrentStep>({ kind: 'intro' })
  const [startDate, setStartDate] = useState<string>(firstOfNextMonth())
  const [horizonMonths, setHorizonMonths] = useState<number>(24)
  const [area, setArea] = useState<Area>('budget')

  const buildInitialRows = (presets: OnboardingPreset[]): Record<string, OnboardingRow[]> => {
    const out: Record<string, OnboardingRow[]> = {}
    for (const p of presets) {
      out[p.id] = p.defaultEnabled ? [newRow(p, startDate, horizonMonths)] : []
    }
    return out
  }

  const [costRows, setCostRows] = useState<Record<string, OnboardingRow[]>>(() =>
    buildInitialRows(COST_PRESETS),
  )

  const totalAllSteps = 1 + COST_PRESETS.length + 1
  const currentStepIndex =
    step.kind === 'intro'
      ? 1
      : step.kind === 'cost'
        ? 1 + (step.presetIdx ?? 0) + 1
        : totalAllSteps

  const totalRecords = useMemo(
    () => countAllRecords(COST_PRESETS, costRows),
    [costRows],
  )

  const totalAmount = useMemo(() => {
    let sum = 0
    for (const p of COST_PRESETS) {
      for (const r of costRows[p.id] ?? []) {
        if (r.amount <= 0) continue
        sum += r.amount * rowInstallmentCount(r)
      }
    }
    return sum
  }, [costRows])

  const goNextFromIntro = () => setStep({ kind: 'cost', presetIdx: 0 })

  const goNextFromCategory = () => {
    if (step.kind !== 'cost') return
    const idx = step.presetIdx ?? 0
    if (idx + 1 < COST_PRESETS.length) {
      setStep({ kind: 'cost', presetIdx: idx + 1 })
    } else {
      setStep({ kind: 'review' })
    }
  }

  const goBackFromCategory = () => {
    if (step.kind === 'cost') {
      const idx = step.presetIdx ?? 0
      if (idx === 0) {
        setStep({ kind: 'intro' })
      } else {
        setStep({ kind: 'cost', presetIdx: idx - 1 })
      }
    } else if (step.kind === 'review') {
      setStep({ kind: 'cost', presetIdx: COST_PRESETS.length - 1 })
    }
  }

  const handleConfirm = async () => {
    if (!workspaceId) {
      toast({ title: 'Workspace non selezionato', variant: 'destructive' })
      return
    }
    const records = expandAll(COST_PRESETS, costRows, area)
    if (records.length === 0) {
      toast({ title: 'Nessun record da creare', variant: 'destructive' })
      return
    }
    try {
      await bulkCreateRecords(records)
      await queryClient.invalidateQueries()
      toast({
        title: 'Onboarding completato',
        description: `Creati ${records.length} record nel workspace.`,
        variant: 'success',
      })
      navigate('/cashflow')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore durante la creazione dei record'
      toast({ title: 'Errore', description: message, variant: 'destructive' })
    }
  }

  if (!workspaceId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Seleziona un workspace per iniziare la compilazione guidata.
      </div>
    )
  }

  const currentCostPreset =
    step.kind === 'cost' ? COST_PRESETS[step.presetIdx ?? 0] : null

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b bg-background px-6 py-3">
        <div className="mx-auto max-w-5xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/dashboard')}
                className="h-8 px-2"
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Esci
              </Button>
              <h1 className="text-sm font-semibold">Compilazione guidata · voci ricorrenti</h1>
            </div>
            <span className="text-xs text-muted-foreground">
              Passo {currentStepIndex} / {totalAllSteps}
            </span>
          </div>
          <Progress value={currentStepIndex} max={totalAllSteps} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        {step.kind === 'intro' && (
          <OnboardingIntro
            startDate={startDate}
            defaultHorizonMonths={horizonMonths}
            area={area}
            onChangeStartDate={setStartDate}
            onChangeHorizon={setHorizonMonths}
            onChangeArea={setArea}
            onNext={goNextFromIntro}
            onCancel={() => navigate('/dashboard')}
          />
        )}

        {currentCostPreset && (
          <OnboardingCategoryStep
            key={currentCostPreset.id}
            preset={currentCostPreset}
            rows={costRows[currentCostPreset.id] ?? []}
            stepNumber={(step.presetIdx ?? 0) + 1}
            totalSteps={COST_PRESETS.length}
            defaultStartDate={startDate}
            defaultHorizonMonths={horizonMonths}
            onChange={(rows) =>
              setCostRows((prev) => ({ ...prev, [currentCostPreset.id]: rows }))
            }
            onBack={goBackFromCategory}
            onSkip={goNextFromCategory}
            onNext={goNextFromCategory}
          />
        )}

        {step.kind === 'review' && (
          <OnboardingReview
            costRows={costRows}
            totalRecords={totalRecords}
            totalAmount={totalAmount}
            isSubmitting={isBulkCreating}
            onBack={goBackFromCategory}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  )
}
