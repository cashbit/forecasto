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
import { cn } from '@/lib/utils'
import { XCircle, CheckCircle2, Anchor } from 'lucide-react'

const DISPLAY_ORDER: Area[] = ['actual', 'orders', 'prospect', 'budget']

interface CashflowFiltersProps {
  params: CashflowParams
  onChange: (params: CashflowParams) => void
  onSnapshotsOpen: () => void
}

export function CashflowFilters({ params, onChange, onSnapshotsOpen }: CashflowFiltersProps) {
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

      <div className="space-y-2">
        <Label>Aree</Label>
        <div className="flex gap-2">
          {DISPLAY_ORDER.map((area) => (
            <div key={area} className="flex flex-col items-center gap-1">
              <span className="text-xs text-muted-foreground font-medium">
                {AREA_LABELS[area]}
              </span>
              <div className="flex gap-0.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleStageToggle(area, '1')}
                  className={cn(
                    'h-7 w-7 p-0 transition-colors',
                    isStageActive(area, '1')
                      ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                      : 'text-muted-foreground'
                  )}
                  title={`${AREA_LABELS[area]} - Pagato/approvato`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleStageToggle(area, '0')}
                  className={cn(
                    'h-7 w-7 p-0 transition-colors',
                    isStageActive(area, '0')
                      ? 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                      : 'text-muted-foreground'
                  )}
                  title={`${AREA_LABELS[area]} - Non pagato/approvato`}
                >
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>&nbsp;</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          onClick={onSnapshotsOpen}
        >
          <Anchor className="h-3.5 w-3.5 mr-1.5" />
          Saldi a Data
        </Button>
      </div>
    </div>
  )
}
