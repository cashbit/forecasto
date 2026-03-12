import { Search, X, ChevronLeft, ChevronRight, Trash2, RefreshCw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useFilterStore } from '@/stores/filterStore'
import { STAGE_LABELS_BY_AREA } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface ToggleButtonGroupProps {
  value: string
  options: { value: string; label: string; className?: string }[]
  onChange: (value: string) => void
}

function ToggleButtonGroup({ value, options, onChange }: ToggleButtonGroupProps) {
  return (
    <div className="inline-flex rounded-md border bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 px-3 py-0 text-sm font-medium rounded transition-colors",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            option.className
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

const MONTH_NAMES = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

function DateFilter() {
  const {
    yearFilter, monthFilter, dayFilter,
    setYearFilter, setMonthFilter, setDayFilter
  } = useFilterStore()

  const now = new Date()

  const handleYearClick = () => {
    if (yearFilter === null) {
      setYearFilter(now.getFullYear())
    }
  }

  const handleMonthClick = () => {
    if (monthFilter === null) {
      setMonthFilter(now.getMonth() + 1)
    }
  }

  const handleDayClick = () => {
    if (dayFilter === null) {
      setDayFilter(now.getDate())
    }
  }

  const navigateYear = (delta: number) => {
    const current = yearFilter ?? now.getFullYear()
    setYearFilter(current + delta)
  }

  const navigateMonth = (delta: number) => {
    const year = yearFilter ?? now.getFullYear()
    const month = monthFilter ?? (now.getMonth() + 1)
    let newMonth = month + delta
    let newYear = year

    if (newMonth > 12) {
      newMonth = 1
      newYear++
    } else if (newMonth < 1) {
      newMonth = 12
      newYear--
    }

    setYearFilter(newYear)
    setMonthFilter(newMonth)
  }

  const navigateDay = (delta: number) => {
    const year = yearFilter ?? now.getFullYear()
    const month = monthFilter ?? (now.getMonth() + 1)
    const day = dayFilter ?? now.getDate()

    const date = new Date(year, month - 1, day + delta)
    setYearFilter(date.getFullYear())
    setMonthFilter(date.getMonth() + 1)
    setDayFilter(date.getDate())
  }

  const clearYear = () => setYearFilter(null)
  const clearMonth = () => setMonthFilter(null)
  const clearDay = () => setDayFilter(null)

  const hasAnyFilter = yearFilter !== null

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => {
          if (dayFilter !== null) navigateDay(-1)
          else if (monthFilter !== null) navigateMonth(-1)
          else if (yearFilter !== null) navigateYear(-1)
        }}
        disabled={!hasAnyFilter}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <button
        onClick={handleYearClick}
        onDoubleClick={clearYear}
        className={cn(
          "h-8 w-14 text-sm border rounded px-2 transition-colors",
          yearFilter !== null
            ? "bg-primary text-primary-foreground"
            : "bg-background hover:bg-muted"
        )}
        title="Click per impostare, doppio click per cancellare"
      >
        {yearFilter ?? ''}
      </button>

      <button
        onClick={handleMonthClick}
        onDoubleClick={clearMonth}
        className={cn(
          "h-8 w-12 text-sm border rounded px-2 transition-colors",
          monthFilter !== null
            ? "bg-primary text-primary-foreground"
            : "bg-background hover:bg-muted"
        )}
        title="Click per impostare, doppio click per cancellare"
      >
        {monthFilter !== null ? MONTH_NAMES[monthFilter - 1] : ''}
      </button>

      <button
        onClick={handleDayClick}
        onDoubleClick={clearDay}
        className={cn(
          "h-8 w-10 text-sm border rounded px-2 transition-colors",
          dayFilter !== null
            ? "bg-primary text-primary-foreground"
            : "bg-background hover:bg-muted"
        )}
        title="Click per impostare, doppio click per cancellare"
      >
        {dayFilter !== null ? String(dayFilter).padStart(2, '0') : ''}
      </button>

      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => {
          if (dayFilter !== null) navigateDay(1)
          else if (monthFilter !== null) navigateMonth(1)
          else if (yearFilter !== null) navigateYear(1)
        }}
        disabled={!hasAnyFilter}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

interface RecordFiltersProps {
  availableOwners?: string[]
  onRefresh?: () => void
}

const TEXT_FILTER_FIELDS = [
  { value: '', label: 'Tutto' },
  { value: 'account', label: 'Conto' },
  { value: 'reference', label: 'Riferimento' },
  { value: 'note', label: 'Note' },
  { value: 'owner', label: 'Responsabile' },
  { value: 'transaction_id', label: 'ID Trans.' },
] as const

export function RecordFilters({ availableOwners = [], onRefresh }: RecordFiltersProps) {
  const {
    selectedAreas, sign, stageFilter, textFilter, textFilterField,
    yearFilter, ownerFilter, nextactionFilter, expiredFilter, projectCodeFilter,
    includeDeleted,
    setSign, setStageFilter, setTextFilter, setTextFilterField, resetFilters,
    toggleOwnerFilter, clearOwnerFilter, setNextactionFilter, setExpiredFilter, setProjectCodeFilter,
    setIncludeDeleted
  } = useFilterStore()

  const stageLabels = STAGE_LABELS_BY_AREA[selectedAreas[0]] || { '0': 'Stato 0', '1': 'Stato 1' }

  const hasDateFilter = yearFilter !== null
  const hasOwnerFilter = ownerFilter.length > 0
  const hasNextactionFilter = nextactionFilter !== 'all'
  const hasExpiredFilter = expiredFilter !== 'all'
  const hasProjectCodeFilter = !!projectCodeFilter
  const hasAnyFilter = textFilter || sign !== 'all' || stageFilter !== 'all' || hasDateFilter || hasOwnerFilter || hasNextactionFilter || hasExpiredFilter || hasProjectCodeFilter || includeDeleted

  // Get unique owners from available owners
  const uniqueOwners = [...new Set(availableOwners.filter(Boolean))].sort()

  return (
    <div className="flex flex-col border-b">
      {/* Single responsive row — wraps automatically when the window narrows */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <DateFilter />

        {/* Text search: select + input */}
        <div className="flex">
          <select
            value={textFilterField || ''}
            onChange={(e) => setTextFilterField(e.target.value as any || null)}
            className="h-8 rounded-l-md border border-r-0 bg-muted text-xs px-2 cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {TEXT_FILTER_FIELDS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={textFilterField ? `Cerca in ${TEXT_FILTER_FIELDS.find(f => f.value === textFilterField)?.label}...` : 'Cerca...'}
              title="Inserisci una o più parole: la ricerca trova righe che contengono tutte le parole indicate"
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              className="h-8 w-44 pl-9 rounded-l-none"
            />
          </div>
        </div>

        {/* Project code */}
        <div className="relative">
          <Input
            placeholder="Progetto"
            value={projectCodeFilter || ''}
            onChange={(e) => setProjectCodeFilter(e.target.value || null)}
            className="h-8 w-36 pl-3"
          />
          {hasProjectCodeFilter && (
            <button
              onClick={() => setProjectCodeFilter(null)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Toggle groups */}
        <ToggleButtonGroup
          value={sign}
          onChange={(v) => setSign(v as 'in' | 'out' | 'all')}
          options={[
            { value: 'all', label: 'Tutti' },
            { value: 'in', label: 'Entrate' },
            { value: 'out', label: 'Uscite' },
          ]}
        />

        <ToggleButtonGroup
          value={stageFilter}
          onChange={(v) => setStageFilter(v as '0' | '1' | 'all')}
          options={[
            { value: 'all', label: 'Tutti' },
            { value: '0', label: stageLabels['0'] },
            { value: '1', label: stageLabels['1'] },
          ]}
        />

        <ToggleButtonGroup
          value={nextactionFilter}
          onChange={(v) => setNextactionFilter(v as 'all' | 'with' | 'without')}
          options={[
            { value: 'all', label: 'Tutti' },
            { value: 'with', label: 'Con Prossima Azione' },
            { value: 'without', label: 'Senza Prossima Azione' },
          ]}
        />

        <ToggleButtonGroup
          value={expiredFilter}
          onChange={(v) => setExpiredFilter(v as 'all' | 'yes' | 'no')}
          options={[
            { value: 'all', label: 'Tutti' },
            { value: 'yes', label: 'Scaduti' },
            { value: 'no', label: 'Non scaduti' },
          ]}
        />

        <Button
          variant={includeDeleted ? 'destructive' : 'outline'}
          size="sm"
          className="h-8 gap-1"
          onClick={() => setIncludeDeleted(!includeDeleted)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {includeDeleted ? 'Nascondi eliminati' : 'Mostra eliminati'}
        </Button>

        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={onRefresh}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Aggiorna
          </Button>
        )}

        {hasAnyFilter && (
          <Button variant="ghost" size="sm" className="h-8" onClick={resetFilters}>
            <X className="h-4 w-4 mr-1" />
            Reset
          </Button>
        )}
      </div>

      {/* Owner filter row — separate, wraps on its own */}
      {(uniqueOwners.length > 0 || hasOwnerFilter) && (
        <div className="flex items-center gap-2 flex-wrap px-4 pb-2">
          <span className="text-sm text-muted-foreground">Responsabile:</span>
          <button
            onClick={() => toggleOwnerFilter('_noowner_')}
            className={cn(
              "px-2 py-1 text-xs font-medium rounded border transition-colors",
              ownerFilter.includes('_noowner_')
                ? "bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                : "bg-background hover:bg-muted"
            )}
          >
            Senza Respons.
          </button>
          {uniqueOwners.map((owner) => (
            <button
              key={owner}
              onClick={() => toggleOwnerFilter(owner)}
              className={cn(
                "px-2 py-1 text-xs font-medium rounded border transition-colors",
                ownerFilter.includes(owner)
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              )}
            >
              {owner}
            </button>
          ))}
          {hasOwnerFilter && (
            <button
              onClick={clearOwnerFilter}
              className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
