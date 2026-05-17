import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useDebounce } from '@/hooks/useDebounce'
import { useGlobalFilters, type SuggestionKind } from '@/hooks/useGlobalFilters'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { recordsApi } from '@/api/records'

const MIN_QUERY_LENGTH = 2
const MAX_PER_GROUP = 5

async function fetchAcrossWorkspaces(
  workspaceIds: string[],
  field: 'account' | 'project_code' | 'owner',
  q: string,
): Promise<string[]> {
  if (!workspaceIds.length) return []
  const results = await Promise.all(
    workspaceIds.map(wsId => recordsApi.getFieldValues(wsId, field, q || undefined)),
  )
  const merged = Array.from(new Set(results.flat()))
  return merged.sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }))
}

export function GlobalSearchBar() {
  const { selectedWorkspaceIds } = useWorkspaceStore()
  const { applySuggestion } = useGlobalFilters()

  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const debouncedQuery = useDebounce(query.trim(), 250)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const enabled = focused && debouncedQuery.length >= MIN_QUERY_LENGTH && selectedWorkspaceIds.length > 0

  const accounts = useQuery({
    queryKey: ['global-search', 'account', selectedWorkspaceIds, debouncedQuery],
    queryFn: () => fetchAcrossWorkspaces(selectedWorkspaceIds, 'account', debouncedQuery),
    enabled,
    staleTime: 60_000,
  })
  const projects = useQuery({
    queryKey: ['global-search', 'project_code', selectedWorkspaceIds, debouncedQuery],
    queryFn: () => fetchAcrossWorkspaces(selectedWorkspaceIds, 'project_code', debouncedQuery),
    enabled,
    staleTime: 60_000,
  })
  const owners = useQuery({
    queryKey: ['global-search', 'owner', selectedWorkspaceIds, debouncedQuery],
    queryFn: () => fetchAcrossWorkspaces(selectedWorkspaceIds, 'owner', debouncedQuery),
    enabled,
    staleTime: 60_000,
  })

  const isOpen = focused && debouncedQuery.length >= MIN_QUERY_LENGTH

  useEffect(() => {
    if (!isOpen) return
    function onPointer(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [isOpen])

  const handlePick = (kind: SuggestionKind, value: string) => {
    applySuggestion(kind, value)
    setQuery('')
    setFocused(false)
    inputRef.current?.blur()
  }

  const accountItems = (accounts.data ?? []).slice(0, MAX_PER_GROUP)
  const projectItems = (projects.data ?? []).slice(0, MAX_PER_GROUP)
  const ownerItems = (owners.data ?? []).slice(0, MAX_PER_GROUP)
  const totalMatches = accountItems.length + projectItems.length + ownerItems.length
  const loading = accounts.isFetching || projects.isFetching || owners.isFetching

  return (
    <div ref={containerRef} className="relative flex-1 max-w-xl min-w-[200px]" data-tour="global-search">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              setQuery('')
              setFocused(false)
              inputRef.current?.blur()
            }
          }}
          placeholder="Cerca conto, progetto, responsabile..."
          autoComplete="off"
          className="pl-9 h-9"
        />
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-md">
          <Command shouldFilter={false}>
            <CommandList className="max-h-[360px]">
              {!loading && totalMatches === 0 && (
                <CommandEmpty>
                  Nessun risultato per "{debouncedQuery}"
                </CommandEmpty>
              )}
              {accountItems.length > 0 && (
                <CommandGroup heading="Conto">
                  {accountItems.map(item => (
                    <CommandItem
                      key={`account:${item}`}
                      value={`account:${item}`}
                      onSelect={() => handlePick('account', item)}
                      className="cursor-pointer"
                    >
                      {item}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {projectItems.length > 0 && (
                <CommandGroup heading="Progetto">
                  {projectItems.map(item => (
                    <CommandItem
                      key={`project:${item}`}
                      value={`project:${item}`}
                      onSelect={() => handlePick('project', item)}
                      className="cursor-pointer"
                    >
                      {item}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {ownerItems.length > 0 && (
                <CommandGroup heading="Responsabile">
                  {ownerItems.map(item => (
                    <CommandItem
                      key={`owner:${item}`}
                      value={`owner:${item}`}
                      onSelect={() => handlePick('owner', item)}
                      className="cursor-pointer"
                    >
                      {item}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup heading="Ricerca testuale">
                <CommandItem
                  key="text-search"
                  value={`text:${debouncedQuery}`}
                  onSelect={() => handlePick('text', debouncedQuery)}
                  className="cursor-pointer"
                >
                  Cerca "{debouncedQuery}" su tutti i campi
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  )
}
