import { useState } from 'react'
import { StickyNote, Link2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'
import { cn } from '@/lib/utils'
import type { RecordSuggestion, ReconciliationMatch } from '@/types/inbox'
import { AREAS, AREA_LABELS, SIGN_OPTIONS } from '@/lib/constants'

interface InboxRecordRowProps {
  suggestion: RecordSuggestion
  index: number
  editable: boolean
  workspaceId: string
  onChange: (index: number, field: keyof RecordSuggestion, value: string) => void
  onMatchChange?: (index: number, match: ReconciliationMatch | null) => void
  forceNoteExpanded?: boolean
  isPending?: boolean
}

// Number of <td> columns in the main row (used for colSpan in note row)
const COL_COUNT = 9

const MATCH_BADGE: Record<string, { bg: string; label: string }> = {
  payment: { bg: 'bg-emerald-100 text-emerald-800', label: 'Pagamento' },
  update: { bg: 'bg-amber-100 text-amber-800', label: 'Aggiorna' },
  update_partial: { bg: 'bg-amber-100 text-amber-800', label: 'Pagamento parziale' },
  duplicate: { bg: 'bg-red-100 text-red-800', label: 'Possibile duplicato di:' },
}

const fmtAmount = (n: number) =>
  n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Preview client-side del ricalcolo IVA quando un bonifico/EC chiude un
 * ordine aperto. Riceve l'importo originale del record (amount/vat) e il
 * totale del bonifico, deriva l'aliquota e mostra il nuovo imponibile.
 */
function recomputeVatPreview(
  matched: ReconciliationMatch,
  newTotal: number,
): { newAmount: number; newVat: number; ratePct: number } | null {
  const oldAmount = Number(matched.amount ?? 0)
  const oldTotal = Number(matched.total ?? 0)
  if (!Number.isFinite(oldAmount) || !Number.isFinite(oldTotal) || oldAmount === 0) {
    return null
  }
  const oldVat = oldTotal - oldAmount
  const rate = oldVat / oldAmount  // es. 0.22
  if (!Number.isFinite(rate) || rate === 0) {
    return { newAmount: newTotal, newVat: 0, ratePct: 0 }
  }
  const newAmount = newTotal / (1 + rate)
  const newVat = newTotal - newAmount
  return {
    newAmount: Math.round(newAmount * 100) / 100,
    newVat: Math.round(newVat * 100) / 100,
    ratePct: Math.round(rate * 1000) / 10,
  }
}

export function InboxRecordRow({ suggestion, index, editable, workspaceId, onChange, onMatchChange, forceNoteExpanded, isPending }: InboxRecordRowProps) {
  const [noteExpanded, setNoteExpanded] = useState(false)
  const [matchExpanded, setMatchExpanded] = useState(false)

  const currentSign: 'in' | 'out' = parseFloat(suggestion.amount || '0') >= 0 ? 'in' : 'out'

  const handleSignToggle = (newSign: 'in' | 'out') => {
    const abs = Math.abs(parseFloat(suggestion.amount || '0'))
    onChange(index, 'amount', String(newSign === 'out' ? -abs : abs))
  }
  const hasNote = Boolean(suggestion.note?.trim())
  const showNote = noteExpanded || forceNoteExpanded
  const matched = suggestion.matched_record
  const alternatives = suggestion.similar_records || []

  const hadMatchRemoved = !matched && alternatives.length > 0

  return (
    <>
      <tr className={cn("border-b last:border-0 group", hadMatchRemoved && "bg-green-50/30")}>
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

        {/* Imponibile (amount) */}
        <td className="py-1.5 pr-2 text-right">
          {editable ? (
            <Input
              className="h-7 text-xs w-full min-w-[5.5rem] text-right"
              value={suggestion.amount ?? ''}
              onChange={(e) => onChange(index, 'amount', e.target.value)}
            />
          ) : (
            <span className={`text-xs font-medium ${Number(suggestion.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {Number(suggestion.amount).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
            </span>
          )}
        </td>

        {/* Tipo / Segno — sign toggle in edit, type label in view */}
        <td className="py-1.5 pr-2 text-xs text-muted-foreground whitespace-nowrap">
          {editable ? (
            <div className="flex flex-col gap-0.5">
              {SIGN_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={currentSign === opt.value ? (opt.value === 'in' ? 'default' : 'destructive') : 'outline'}
                  className="h-5 w-full px-1.5 text-[10px] leading-none"
                  onClick={() => handleSignToggle(opt.value as 'in' | 'out')}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          ) : (
            <span className="flex items-center gap-1">
              {suggestion.type}
              {hadMatchRemoved && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">
                  Nuovo
                </span>
              )}
            </span>
          )}
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

      {/* Match row — auto-assigned match or alternatives */}
      {matched && (() => {
        const isPaymentMatch = matched.match_type === 'payment' || matched.match_type === 'update_partial'
        const recomputeVat = matched.recompute_vat ?? true
        const newTotal = Number(suggestion.total ?? 0)
        const preview = isPaymentMatch && recomputeVat ? recomputeVatPreview(matched, newTotal) : null
        return (
          <tr className={cn(
            'bg-blue-50/50 border-b last:border-0',
            matched.low_confidence && 'border-l-4 border-l-amber-400 border-dashed',
          )}>
            <td colSpan={COL_COUNT} className="px-3 py-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Link2 className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${MATCH_BADGE[matched.match_type || 'update']?.bg || 'bg-gray-100'}`}>
                  {MATCH_BADGE[matched.match_type || 'update']?.label || 'Match'}
                </span>
                {matched.low_confidence && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                    Da verificare
                  </span>
                )}
                <span className="text-muted-foreground">
                  {matched.reference} &middot; {matched.account} &middot;{' '}
                  {fmtAmount(Number(matched.amount ?? matched.total))} &middot;{' '}
                  {matched.area}
                  {matched.suggested_transfer_area && (
                    <span className="text-blue-600 font-medium"> &rarr; {matched.suggested_transfer_area}</span>
                  )}
                </span>
                <span className="text-muted-foreground/60">{Math.round(matched.match_score * 100)}%</span>
                <span className="text-muted-foreground/60 truncate max-w-[14rem]">
                  {matched.match_reasons?.join(', ')}
                </span>
                {isPending && alternatives.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setMatchExpanded(v => !v)}
                    className="text-blue-500 hover:underline ml-auto"
                  >
                    {matchExpanded ? 'Chiudi' : `${alternatives.length - 1} altri`}
                  </button>
                )}
                {isPending && onMatchChange && (
                  <button
                    type="button"
                    onClick={() => onMatchChange(index, null)}
                    className="text-muted-foreground hover:text-red-500 ml-1"
                    title="Rimuovi associazione (crea nuovo record)"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              {/* Payment match details: ricalcolo IVA toggle + preview */}
              {isPaymentMatch && isPending && (
                <div className="mt-1 pl-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-blue-700">
                  {onMatchChange && (
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={recomputeVat}
                        onChange={(e) => onMatchChange(index, { ...matched, recompute_vat: e.target.checked })}
                        className="h-3 w-3"
                      />
                      Ricalcola IVA dal totale del bonifico
                    </label>
                  )}
                  <span className="text-muted-foreground">
                    stage 0 &rarr; <span className="font-medium text-blue-700">1</span>
                  </span>
                  {preview && preview.ratePct > 0 && (
                    <span className="text-muted-foreground">
                      imponibile {fmtAmount(Number(matched.amount ?? 0))} &rarr;{' '}
                      <span className="font-medium text-blue-700">{fmtAmount(preview.newAmount)}</span>
                      {' '}(IVA {preview.ratePct}%)
                    </span>
                  )}
                  {preview && preview.ratePct === 0 && (
                    <span className="text-muted-foreground">IVA esente preservata</span>
                  )}
                </div>
              )}
            </td>
          </tr>
        )
      })()}

      {/* Match removed indicator — show option to restore */}
      {hadMatchRemoved && isPending && onMatchChange && (
        <tr className="bg-green-50/30 border-b last:border-0">
          <td colSpan={COL_COUNT} className="px-3 py-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">
                Nuovo record
              </span>
              <span>Match ignorato — verrà creato un nuovo record</span>
              <button
                type="button"
                onClick={() => onMatchChange(index, alternatives[0])}
                className="text-blue-500 hover:underline ml-auto"
              >
                Ripristina match ({alternatives[0].reference}, {Math.round(alternatives[0].match_score * 100)}%)
              </button>
            </div>
          </td>
        </tr>
      )}

      {/* Alternative matches */}
      {matchExpanded && alternatives.length > 0 && (
        <>
          {alternatives.filter(m => m.record_id !== matched?.record_id).map((m) => (
            <tr key={m.record_id} className="bg-blue-50/30 border-b last:border-0">
              <td colSpan={COL_COUNT} className="px-3 py-1 pl-10">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${MATCH_BADGE[m.match_type || 'duplicate']?.bg || 'bg-gray-100'}`}>
                    {MATCH_BADGE[m.match_type || 'duplicate']?.label}
                  </span>
                  <span>{m.reference} &middot; {m.account} &middot; {Number(m.amount ?? m.total).toLocaleString('it-IT', { minimumFractionDigits: 2 })} &middot; {m.area}</span>
                  <span className="text-muted-foreground/60">{Math.round(m.match_score * 100)}%</span>
                  {isPending && onMatchChange && (
                    <button
                      type="button"
                      onClick={() => { onMatchChange(index, m); setMatchExpanded(false) }}
                      className="text-blue-500 hover:underline ml-auto"
                    >
                      Usa questo
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </>
      )}
    </>
  )
}
