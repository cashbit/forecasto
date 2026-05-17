import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGlobalFilters } from '@/hooks/useGlobalFilters'

export function GlobalFilterChips() {
  const { chips, clearAll } = useGlobalFilters()

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-2 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-2">
      <span className="text-xs text-muted-foreground">Filtri attivi:</span>
      {chips.map(chip => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full border bg-secondary text-secondary-foreground pl-2.5 pr-1 py-0.5 text-xs font-medium"
        >
          <span className="text-muted-foreground">{chip.label}:</span>
          <span className="truncate max-w-[200px]">{chip.value}</span>
          <button
            type="button"
            onClick={chip.onRemove}
            className="ml-0.5 inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-muted-foreground/20"
            title="Rimuovi filtro"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {chips.length >= 2 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="h-6 px-2 text-xs"
        >
          Cancella tutto
        </Button>
      )}
    </div>
  )
}
