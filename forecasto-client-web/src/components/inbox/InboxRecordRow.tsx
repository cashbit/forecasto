import { useState } from 'react'
import { ChevronDown, ChevronRight, StickyNote } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'
import { cn } from '@/lib/utils'
import type { RecordSuggestion } from '@/types/inbox'
import { AREAS, AREA_LABELS } from '@/lib/constants'

interface InboxRecordRowProps {
  suggestion: RecordSuggestion
  index: number
  editable: boolean
  workspaceId: string
  onChange: (index: number, field: keyof RecordSuggestion, value: string) => void
  forceNoteExpanded?: boolean
}

// Number of <td> columns in the main row (used for colSpan in note row)
const COL_COUNT = 9

export function InboxRecordRow({ suggestion, index, editable, workspaceId, onChange, forceNoteExpanded }: InboxRecordRowProps) {
  const [noteExpanded, setNoteExpanded] = useState(false)
  const hasNote = Boolean(suggestion.note?.trim())
  const showNote = noteExpanded || forceNoteExpanded

  return (
    <>
      <tr className="border-b last:border-0 group">
        {/* Area */}
        <td className="py-1.5 pr-2">
          {editable ? (
            <Select
              value={suggestion.area}
              onValueChange={(v) => onChange(index, 'area', v)}
            >
              <SelectTrigger className="h-7 text-xs w-full min-w-[7rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AREAS.map((a) => (
                  <SelectItem key={a} value={a} className="text-xs">
                    {AREA_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs">{AREA_LABELS[suggestion.area] ?? suggestion.area}</span>
          )}
        </td>

        {/* Conto — autocomplete from existing account values */}
        <td className="py-1.5 pr-2">
          {editable ? (
            <AutocompleteInput
              field="account"
              workspaceIds={[workspaceId]}
              value={suggestion.account ?? ''}
              onChange={(v) => onChange(index, 'account', v)}
              className="h-7 text-xs w-full min-w-[8rem]"
            />
          ) : (
            <span className="text-xs truncate max-w-[9rem] block">{suggestion.account}</span>
          )}
        </td>

        {/* Riferimento — counterpart name + document reference */}
        <td className="py-1.5 pr-2">
          {editable ? (
            <AutocompleteInput
              field="reference"
              workspaceIds={[workspaceId]}
              value={suggestion.reference ?? ''}
              onChange={(v) => onChange(index, 'reference', v)}
              className="h-7 text-xs w-full min-w-[12rem]"
            />
          ) : (
            <span className="text-xs truncate max-w-[12rem] block">{suggestion.reference}</span>
          )}
        </td>

        {/* N. Transazione */}
        <td className="py-1.5 pr-2">
          {editable ? (
            <Input
              className="h-7 text-xs w-full min-w-[7rem]"
              value={suggestion.transaction_id ?? ''}
              onChange={(e) => onChange(index, 'transaction_id', e.target.value)}
              placeholder="—"
            />
          ) : (
            <span className="text-xs truncate max-w-[7rem] block text-muted-foreground">
              {suggestion.transaction_id || '—'}
            </span>
          )}
        </td>

        {/* Data ordine */}
        <td className="py-1.5 pr-2">
          {editable ? (
            <Input
              className="h-7 text-xs w-full min-w-[7.5rem]"
              type="date"
              value={suggestion.date_offer ?? ''}
              onChange={(e) => onChange(index, 'date_offer', e.target.value)}
            />
          ) : (
            <span className="text-xs">{suggestion.date_offer}</span>
          )}
        </td>

        {/* Data cassa */}
        <td className="py-1.5 pr-2">
          {editable ? (
            <Input
              className="h-7 text-xs w-full min-w-[7.5rem]"
              type="date"
              value={suggestion.date_cashflow ?? ''}
              onChange={(e) => onChange(index, 'date_cashflow', e.target.value)}
            />
          ) : (
            <span className="text-xs">{suggestion.date_cashflow}</span>
          )}
        </td>

        {/* Totale */}
        <td className="py-1.5 pr-2 text-right">
          {editable ? (
            <Input
              className="h-7 text-xs w-full min-w-[5.5rem] text-right"
              value={suggestion.total ?? ''}
              onChange={(e) => onChange(index, 'total', e.target.value)}
            />
          ) : (
            <span className={`text-xs font-medium ${Number(suggestion.total) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {Number(suggestion.total).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
            </span>
          )}
        </td>

        {/* Tipo — read-only */}
        <td className="py-1.5 pr-2 text-xs text-muted-foreground whitespace-nowrap">
          {suggestion.type}
        </td>

        {/* Note toggle */}
        <td className="py-1.5 pl-1 w-7">
          <button
            type="button"
            onClick={() => setNoteExpanded((v) => !v)}
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded transition-colors',
              hasNote || editable
                ? 'text-amber-500 hover:bg-amber-50'
                : 'text-muted-foreground/30 hover:bg-muted/50',
              noteExpanded && 'bg-amber-50'
            )}
            title={noteExpanded ? 'Nascondi nota' : 'Mostra nota'}
          >
            <StickyNote className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>

      {/* Expanded note row */}
      {showNote && (
        <tr className="bg-amber-50/50 border-b last:border-0">
          <td colSpan={COL_COUNT} className="px-3 py-2">
            <div className="flex items-start gap-2">
              <StickyNote className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
              {editable ? (
                <Textarea
                  className="text-xs min-h-[56px] resize-none flex-1 bg-white"
                  value={suggestion.note ?? ''}
                  onChange={(e) => onChange(index, 'note', e.target.value)}
                  placeholder="Aggiungi una nota descrittiva sulla natura della fornitura o del documento…"
                />
              ) : (
                <p className={cn('text-xs flex-1', hasNote ? 'text-foreground' : 'text-muted-foreground italic')}>
                  {hasNote ? suggestion.note : 'Nessuna nota.'}
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
