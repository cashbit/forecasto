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
import { AREAS, AREA_LABELS } from '@/lib/constants'
import type { CashflowParams } from '@/types/cashflow'
import type { Area } from '@/types/record'
import { cn } from '@/lib/utils'

interface CashflowFiltersProps {
  params: CashflowParams
  onChange: (params: CashflowParams) => void
}

export function CashflowFilters({ params, onChange }: CashflowFiltersProps) {
  const handleAreaToggle = (area: Area) => {
    const isSelected = params.areas.includes(area)
    const newAreas = isSelected
      ? params.areas.filter((a) => a !== area)
      : [...params.areas, area]
    // Ensure at least one area is selected
    if (newAreas.length > 0) {
      onChange({ ...params, areas: newAreas as Area[] })
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-4 p-4 border rounded-lg bg-muted/30">
      <div className="space-y-2">
        <Label>Data Inizio</Label>
        <Input
          type="date"
          value={params.from_date}
          onChange={(e) => onChange({ ...params, from_date: e.target.value })}
          className="w-40"
        />
      </div>

      <div className="space-y-2">
        <Label>Data Fine</Label>
        <Input
          type="date"
          value={params.to_date}
          onChange={(e) => onChange({ ...params, to_date: e.target.value })}
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
        <div className="flex gap-1">
          {AREAS.map((area) => {
            const isSelected = params.areas.includes(area)
            return (
              <Button
                key={area}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAreaToggle(area)}
                className={cn(
                  'transition-colors',
                  isSelected && 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {AREA_LABELS[area]}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
