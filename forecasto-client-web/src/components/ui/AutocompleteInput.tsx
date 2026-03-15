import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Command, CommandList, CommandItem } from '@/components/ui/command'
import { recordsApi } from '@/api/records'

type AutocompleteField = 'account' | 'reference' | 'project_code' | 'owner'

interface AutocompleteInputProps {
  workspaceIds: string[]
  field: AutocompleteField
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  id?: string
  disabled?: boolean
  className?: string
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function AutocompleteInput({
  workspaceIds,
  field,
  value,
  onChange,
  onBlur,
  placeholder,
  id,
  disabled,
  className,
}: AutocompleteInputProps) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debouncedQuery = useDebounce(value, 250)

  // Fetch distinct values from all selected workspaces, merge and deduplicate
  const { data: suggestions = [] } = useQuery({
    queryKey: ['field-values', workspaceIds, field, debouncedQuery],
    queryFn: async () => {
      if (!workspaceIds.length) return []
      const results = await Promise.all(
        workspaceIds.map(wsId =>
          recordsApi.getFieldValues(wsId, field, debouncedQuery || undefined)
        )
      )
      const merged = Array.from(new Set(results.flat()))
      return merged.sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }))
    },
    staleTime: 60_000,
    enabled: focused && workspaceIds.length > 0,
  })

  // Filter client-side: exclude exact match (already typed)
  const filtered = suggestions.filter(
    s => s.toLowerCase() !== value.toLowerCase()
  )

  const shouldShow = focused && filtered.length > 0

  const handleSelect = useCallback(
    (val: string) => {
      onChange(val)
      setOpen(false)
      inputRef.current?.focus()
    },
    [onChange]
  )

  useEffect(() => {
    setOpen(shouldShow)
  }, [shouldShow])

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Delay so click on suggestion registers first
          setTimeout(() => {
            setFocused(false)
            setOpen(false)
            onBlur?.()
          }, 150)
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            setOpen(false)
            setFocused(false)
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={className}
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-md">
          <Command>
            <CommandList>
              {filtered.map(item => (
                <CommandItem
                  key={item}
                  value={item}
                  onSelect={() => handleSelect(item)}
                  className="cursor-pointer"
                >
                  {item}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  )
}
