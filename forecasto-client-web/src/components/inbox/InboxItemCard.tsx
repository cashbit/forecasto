import { useState } from 'react'
import { Check, X, Trash2, FileText, AlertTriangle, ChevronDown, ChevronUp, Pencil, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { InboxRecordRow } from './InboxRecordRow'
import { AREAS, AREA_LABELS } from '@/lib/constants'
import type { InboxItem, RecordSuggestion, ReconciliationMatch } from '@/types/inbox'

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: 'Fattura',
  quote: 'Offerta',
  bank_statement: 'Estratto conto',
  wire_transfer: 'Bonifico',
  receipt: 'Ricevuta',
  credit_note: 'Nota credito',
  other: 'Documento',
}

const DOC_TYPE_COLORS: Record<string, string> = {
  invoice: 'bg-blue-100 text-blue-800 border-blue-200',
  quote: 'bg-purple-100 text-purple-800 border-purple-200',
  bank_statement: 'bg-slate-100 text-slate-800 border-slate-200',
  wire_transfer: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  receipt: 'bg-orange-100 text-orange-800 border-orange-200',
  credit_note: 'bg-rose-100 text-rose-800 border-rose-200',
  other: 'bg-gray-100 text-gray-700 border-gray-200',
}

interface InboxItemCardProps {
  item: InboxItem
  onConfirm: (item: InboxItem, suggestions: RecordSuggestion[]) => Promise<void>
  onReject: (item: InboxItem) => Promise<void>
  onDelete: (item: InboxItem) => Promise<void>
  onUpdate: (item: InboxItem, suggestions: RecordSuggestion[], reconciliationMatches?: ReconciliationMatch[]) => Promise<void>
}

export function InboxItemCard({ item, onConfirm, onReject, onDelete, onUpdate }: InboxItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(item.status === 'pending')
  const [isEditing, setIsEditing] = useState(false)
  const [editedSuggestions, setEditedSuggestions] = useState<RecordSuggestion[]>(item.extracted_data)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set())
  const [allNotesExpanded, setAllNotesExpanded] = useState(false)

  const isPending = item.status === 'pending'
  const isConfirmed = item.status === 'confirmed'
  const isRejected = item.status === 'rejected'

  const handleFieldChange = (index: number, field: keyof RecordSuggestion, value: string) => {
    setEditedSuggestions((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const handleBulkAreaChange = (area: string) => {
    setEditedSuggestions((prev) =>
      prev.map((s) => ({ ...s, area }))
    )
  }

  const handleSaveEdit = async () => {
    setIsLoading(true)
    try {
      await onUpdate(item, editedSuggestions)
      setIsEditing(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelEdit = () => {
    setEditedSuggestions(item.extracted_data)
    setIsEditing(false)
  }

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      if (selectedMatchIds.size > 0) {
        const updatedMatches = (item.reconciliation_matches ?? []).map(m => ({
          ...m,
          confirmed: selectedMatchIds.has(m.record_id),
        }))
        await onUpdate(item, editedSuggestions, updatedMatches)
      }
      await onConfirm(item, editedSuggestions)
    } finally {
      setIsLoading(false)
    }
  }

  const handleReject = async () => {
    setIsLoading(true)
    try {
      await onReject(item)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    setIsLoading(true)
    try {
      await onDelete(item)
    } finally {
      setIsLoading(false)
    }
  }

  const statusBadge = () => {
    if (isConfirmed) return <Badge className="bg-green-100 text-green-800 border-green-200">Confermato</Badge>
    if (isRejected) return <Badge variant="secondary">Rifiutato</Badge>
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200">In attesa</Badge>
  }

  const suggestions = isEditing ? editedSuggestions : item.extracted_data

  return (
    <div
      className={cn(
        'rounded-lg border bg-card transition-all',
        isPending && 'border-amber-200 shadow-sm',
        isConfirmed && 'border-green-200 opacity-80',
        isRejected && 'border-muted opacity-60'
      )}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={() => setIsExpanded((v) => !v)}
      >
        <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{item.source_filename}</span>
            {item.document_type && (
              <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${DOC_TYPE_COLORS[item.document_type] ?? DOC_TYPE_COLORS.other}`}>
                {DOC_TYPE_LABELS[item.document_type] ?? item.document_type}
              </span>
            )}
            {item.source_deleted && (
              <Tooltip>
                <TooltipTrigger>
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                </TooltipTrigger>
                <TooltipContent>File sorgente eliminato</TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{item.source_path}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {statusBadge()}
          <span className="text-xs text-muted-foreground">
            {item.extracted_data.length} {item.extracted_data.length === 1 ? 'riga' : 'righe'}
          </span>
          <span className="text-xs text-muted-foreground hidden sm:block">
            {item.llm_model}
          </span>
          <span className="text-xs text-muted-foreground hidden md:block">
            {new Date(item.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div className="border-t px-4 pb-4 pt-3">
          {/* Reconciliation panel */}
          {(item.document_type === 'wire_transfer' || item.document_type === 'bank_statement') &&
            item.reconciliation_matches && item.reconciliation_matches.length > 0 && (
            <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
              <p className="text-xs font-semibold text-emerald-800 mb-2 flex items-center gap-1">
                <span>🔗</span> Riconciliazione — possibili corrispondenze
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left pb-1 pr-2 w-5"></th>
                    <th className="text-left pb-1 pr-2">Riferimento</th>
                    <th className="text-left pb-1 pr-2">Conto</th>
                    <th className="text-right pb-1 pr-2">Importo</th>
                    <th className="text-left pb-1">Data cassa</th>
                  </tr>
                </thead>
                <tbody>
                  {item.reconciliation_matches.map((m) => (
                    <tr key={m.record_id} className={selectedMatchIds.has(m.record_id) ? 'bg-emerald-100/50' : ''}>
                      <td className="pr-2 py-1">
                        <input
                          type="checkbox"
                          checked={selectedMatchIds.has(m.record_id)}
                          onChange={(e) => {
                            setSelectedMatchIds(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(m.record_id)
                              else next.delete(m.record_id)
                              return next
                            })
                          }}
                          className="h-3 w-3"
                          disabled={!isPending}
                        />
                      </td>
                      <td className="pr-2 py-1 truncate max-w-[12rem]">{m.reference}</td>
                      <td className="pr-2 py-1 text-muted-foreground truncate max-w-[8rem]">{m.account}</td>
                      <td className="pr-2 py-1 text-right font-medium">
                        {Number(m.total).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-1 text-muted-foreground">{m.date_cashflow ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selectedMatchIds.size > 0 && isPending && (
                <p className="text-xs text-emerald-700 mt-2">
                  {selectedMatchIds.size} record selezionati — verranno marcati come pagati alla conferma.
                </p>
              )}
            </div>
          )}

          {/* Document toolbar */}
          {isPending && suggestions.length > 0 && (
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Area:</span>
                <Select onValueChange={handleBulkAreaChange}>
                  <SelectTrigger className="h-7 text-xs w-44">
                    <SelectValue placeholder="Imposta tutte le righe…" />
                  </SelectTrigger>
                  <SelectContent>
                    {AREAS.map((a) => (
                      <SelectItem key={a} value={a} className="text-xs">
                        {AREA_LABELS[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                className={cn('h-7 text-xs gap-1', allNotesExpanded && 'bg-amber-50 border-amber-200')}
                onClick={() => setAllNotesExpanded((v) => !v)}
              >
                <StickyNote className="h-3.5 w-3.5" />
                {allNotesExpanded ? 'Nascondi note' : 'Note'}
              </Button>
            </div>
          )}

          {suggestions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-auto">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left pb-2 pr-2 font-medium">Area</th>
                    <th className="text-left pb-2 pr-2 font-medium">Conto</th>
                    <th className="text-left pb-2 pr-2 font-medium">Riferimento</th>
                    <th className="text-left pb-2 pr-2 font-medium">N. Transazione</th>
                    <th className="text-left pb-2 pr-2 font-medium">Data ordine</th>
                    <th className="text-left pb-2 pr-2 font-medium">Data cassa</th>
                    <th className="text-right pb-2 pr-2 font-medium">Totale</th>
                    <th className="text-left pb-2 pr-2 font-medium">Tipo</th>
                    <th className="pb-2 w-7" title="Note" />
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s, i) => (
                    <InboxRecordRow
                      key={i}
                      suggestion={s}
                      index={i}
                      editable={isEditing}
                      workspaceId={item.workspace_id}
                      onChange={handleFieldChange}
                      forceNoteExpanded={allNotesExpanded}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Nessun record estratto dall'LLM.</p>
          )}

          {/* Confirmed record IDs */}
          {isConfirmed && item.confirmed_record_ids.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Record creati: {item.confirmed_record_ids.length}
            </p>
          )}

          {/* Action buttons */}
          {isPending && (
            <div className="flex items-center gap-2 mt-3">
              {isEditing ? (
                <>
                  <Button size="sm" onClick={handleSaveEdit} disabled={isLoading}>
                    Salva modifiche
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancelEdit} disabled={isLoading}>
                    Annulla
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleConfirm}
                    disabled={isLoading || suggestions.length === 0}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    {selectedMatchIds.size > 0 ? 'Conferma pagamento' : 'Conferma'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    disabled={isLoading}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Modifica
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReject}
                    disabled={isLoading}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Rifiuta
                  </Button>
                </>
              )}
              <div className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
                disabled={isLoading}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}

          {!isPending && (
            <div className="flex justify-end mt-3">
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
                disabled={isLoading}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Elimina
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
