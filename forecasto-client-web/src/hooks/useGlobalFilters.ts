import { useFilterStore } from '@/stores/filterStore'
import type { TextFilterField } from '@/types/record'

export type SuggestionKind = 'account' | 'project' | 'owner' | 'text'

export interface FilterChip {
  key: string
  kind: SuggestionKind
  label: string
  value: string
  onRemove: () => void
}

const FIELD_LABEL: Record<NonNullable<TextFilterField>, string> = {
  account: 'Conto',
  reference: 'Riferimento',
  note: 'Note',
  owner: 'Responsabile',
  transaction_id: 'ID Trans.',
}

export function useGlobalFilters() {
  const textFilter = useFilterStore(s => s.textFilter)
  const textFilterField = useFilterStore(s => s.textFilterField)
  const projectCodeFilter = useFilterStore(s => s.projectCodeFilter)
  const ownerFilter = useFilterStore(s => s.ownerFilter)

  const setTextFilter = useFilterStore(s => s.setTextFilter)
  const setTextFilterField = useFilterStore(s => s.setTextFilterField)
  const setProjectCodeFilter = useFilterStore(s => s.setProjectCodeFilter)
  const toggleOwnerFilter = useFilterStore(s => s.toggleOwnerFilter)
  const clearGlobalFilters = useFilterStore(s => s.clearGlobalFilters)

  const chips: FilterChip[] = []

  if (textFilter) {
    const fieldLabel = textFilterField ? FIELD_LABEL[textFilterField] : 'Cerca'
    chips.push({
      key: `text:${textFilterField ?? 'all'}:${textFilter}`,
      kind: textFilterField === 'owner' ? 'owner' : textFilterField === 'account' ? 'account' : 'text',
      label: fieldLabel,
      value: textFilter,
      onRemove: () => {
        setTextFilter('')
        setTextFilterField(null)
      },
    })
  }

  if (projectCodeFilter) {
    chips.push({
      key: `project:${projectCodeFilter}`,
      kind: 'project',
      label: 'Progetto',
      value: projectCodeFilter,
      onRemove: () => setProjectCodeFilter(null),
    })
  }

  for (const owner of ownerFilter) {
    chips.push({
      key: `owner:${owner}`,
      kind: 'owner',
      label: 'Responsabile',
      value: owner === '_noowner_' ? '(senza)' : owner,
      onRemove: () => toggleOwnerFilter(owner),
    })
  }

  const applySuggestion = (kind: SuggestionKind, value: string) => {
    if (kind === 'account') {
      setTextFilter(value)
      setTextFilterField('account')
    } else if (kind === 'project') {
      setProjectCodeFilter(value)
    } else if (kind === 'owner') {
      if (!ownerFilter.includes(value)) toggleOwnerFilter(value)
    } else {
      setTextFilter(value)
      setTextFilterField(null)
    }
  }

  return {
    chips,
    hasActive: chips.length > 0,
    applySuggestion,
    clearAll: clearGlobalFilters,
  }
}
