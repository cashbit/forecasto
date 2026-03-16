import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface ChipPickerProps {
  label: string
  chips: string[]
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  isLoading?: boolean
  error?: string
  id?: string
}

export function ChipPicker({
  label,
  chips,
  value,
  onChange,
  onBlur,
  placeholder,
  isLoading,
  error,
  id,
}: ChipPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChipClick = (chip: string) => {
    onChange(chip)
    // Sposta il focus all'input successivo via blur
    inputRef.current?.blur()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>

      {/* Chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map(chip => (
            <button
              key={chip}
              type="button"
              onClick={() => handleChipClick(chip)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                value === chip
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-muted'
              )}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {isLoading && chips.length === 0 && (
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 w-20 rounded-full bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Separatore solo se ci sono chips */}
      {chips.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex-1 h-px bg-border" />
          <span>o digita</span>
          <div className="flex-1 h-px bg-border" />
        </div>
      )}

      {/* Input testo libero */}
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={handleInputChange}
        onBlur={onBlur}
        placeholder={placeholder}
        className="h-11 text-base"
        autoComplete="off"
      />

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
