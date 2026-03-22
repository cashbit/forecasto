import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AREA_LABELS } from '@/lib/constants'
import type { CashflowParams } from '@/types/cashflow'
import type { Area } from '@/types/record'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { XCircle, CheckCircle2, Anchor, Calculator } from 'lucide-react'

const DISPLAY_ORDER: Area[] = ['actual', 'orders', 'prospect', 'budget']

export interface VatFilterState {
  enabled: boolean
  periodType: 'monthly' | 'quarterly'
  useSummerExtension: boolean
}

interface CashflowFiltersProps {
  params: CashflowParams
  onChange: (params: CashflowParams) => void
  onSnapshotsOpen: () => void
  vatFilter: VatFilterState
  onVatFilterChange: (vatFilter: VatFilterState) => void
}

export function CashflowFilters({ params, onChange, onSnapshotsOpen, vatFilter, onVatFilterChange }: CashflowFiltersProps) {
  const isStageActive = (area: Area, stage: '0' | '1') => {
    const pairs = params.area_stage ?? []
    return pairs.includes(`${area}:${stage}`)
  }

  const handleStageToggle = (area: Area, stage: '0' | '1') => {
    const pair = `${area}:${stage}`
    const current = params.area_stage ?? []
    const active = current.includes(pair)

    const newAreaStage = active
      ? current.filter((p) => p !== pair)
      : [...current, pair]

    // Ensure at least one pair remains
    if (newAreaStage.length === 0) return

    const newAreas = [...new Set(newAreaStage.map((p) => p.split(':')[0]))] as Area[]
    onChange({ ...params, area_stage: newAreaStage, areas: newAreas })
  }

  return (
    <div className="flex flex-wrap items-end gap-4 p-4 border rounded-lg bg-muted/30">
      <div className="space-y-2">
        <Label>Data Inizio</Label>
        <Input
          type="date"
          value={params.from_date}
          onChange={(e) => { if (e.target.value) onChange({ ...params, from_date: e.target.value }) }}
          className="w-40"
        />
      </div>

      <div className="space-y-2">
        <Label>Data Fine</Label>
        <Input
          type="date"
          value={params.to_date}
          onChange={(e) => { if (e.target.value) onChange({ ...params, to_date: e.target.value }) }}
          className="w-40"
        />
      </div>

      <div className="space-y-2">
        <Label>Raggruppa per</Label>
        <Select
          value={params.group_by}
          onValueChange={(v) => onChange({ ...params, group_by: v as 'day' | 'week' | 'month' })}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Giorno</SelectItem>
            <SelectItem value="week">Settimana</SelectItem>
            <SelectItem value="month">Mese</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {DISPLAY_ORDER.map((area) => (
        <div key={area} className="space-y-2">
          <Label className="font-semibold">{AREA_LABELS[area]}</Label>
          <div className="flex gap-0.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleStageToggle(area, '1')}
              className={cn(
                'h-9 w-9 p-0 transition-colors',
                isStageActive(area, '1')
                  ? 'bg-foreground text-background border-foreground hover:bg-foreground/90'
                  : 'text-muted-foreground'
              )}
              title={`${AREA_LABELS[area]} - Pagato/approvato`}
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleStageToggle(area, '0')}
              className={cn(
                'h-9 w-9 p-0 transition-colors',
                isStageActive(area, '0')
                  ? 'bg-foreground text-background border-foreground hover:bg-foreground/90'
                  : 'text-muted-foreground'
              )}
              title={`${AREA_LABELS[area]} - Non pagato/approvato`}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      <div className="space-y-2">
        <Label>&nbsp;</Label>
        <Button
          type="button"
          variant="outline"
          className="h-9"
          onClick={onSnapshotsOpen}
        >
          <Anchor className="h-4 w-4 mr-1.5" />
          Saldi a Data
        </Button>
      </div>

      {/* IVA Toggle */}
      <div className="space-y-2">
        <Label className="font-semibold">IVA</Label>
        <div className="flex gap-0.5">
          <Button
            type="button"
            variant="outline"
            onClick={() => onVatFilterChange({ ...vatFilter, enabled: !vatFilter.enabled })}
            className={cn(
              'h-9 px-3 transition-colors',
              vatFilter.enabled
                ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600'
                : 'text-muted-foreground'
            )}
          >
            <Calculator className="h-4 w-4 mr-1.5" />
            IVA
          </Button>
        </div>
      </div>

      {vatFilter.enabled && (
        <>
          <div className="space-y-2">
            <Label>Periodo IVA</Label>
            <Select
              value={vatFilter.periodType}
              onValueChange={(v) => onVatFilterChange({ ...vatFilter, periodType: v as 'monthly' | 'quarterly' })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensile</SelectItem>
                <SelectItem value="quarterly">Trimestrale</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {vatFilter.periodType === 'quarterly' && (
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <label className="flex items-center gap-2 text-sm cursor-pointer h-9">
                <Checkbox
                  checked={vatFilter.useSummerExtension}
                  onCheckedChange={(v) => onVatFilterChange({ ...vatFilter, useSummerExtension: !!v })}
                />
                Proroga estiva
              </label>
            </div>
          )}
        </>
      )}
    </div>
  )
}
