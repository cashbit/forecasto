import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFilterStore } from '@/stores/filterStore'

export function RecordFilters() {
  const { sign, textFilter, setSign, setTextFilter, resetFilters } = useFilterStore()

  return (
    <div className="flex items-center gap-4 p-4 border-b">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cerca per riferimento, conto..."
          value={textFilter}
          onChange={(e) => setTextFilter(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select value={sign} onValueChange={(v) => setSign(v as 'in' | 'out' | 'all')}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Segno" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tutti</SelectItem>
          <SelectItem value="in">
            <span className="text-income">Entrate (+)</span>
          </SelectItem>
          <SelectItem value="out">
            <span className="text-expense">Uscite (-)</span>
          </SelectItem>
        </SelectContent>
      </Select>

      {(textFilter || sign !== 'all') && (
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          <X className="h-4 w-4 mr-1" />
          Reset
        </Button>
      )}
    </div>
  )
}
