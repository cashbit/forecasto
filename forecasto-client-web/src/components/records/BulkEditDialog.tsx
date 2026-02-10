import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { STAGES, STAGE_LABELS_BY_AREA, SIGN_OPTIONS } from '@/lib/constants'
import type { Record, Area, RecordUpdate } from '@/types/record'

const FIELD_LABELS: Record<string, string> = {
  account: 'Conto',
  reference: 'Riferimento',
  transaction_id: 'ID Transazione',
  project_code: 'Codice Progetto',
  date_cashflow: 'Data Cashflow',
  date_offer: 'Data Offerta',
  amount: 'Imponibile',
  total: 'Totale',
  stage: 'Stato',
  owner: 'Responsabile',
  nextaction: 'Prossima Azione',
  review_date: 'Prossima Revisione',
  note: 'Note',
}

interface BulkEditFormState {
  sign: 'in' | 'out' | ''
  account: string
  reference: string
  transaction_id: string
  project_code: string
  date_cashflow: string
  date_offer: string
  amount: string
  vat: string
  total: string
  stage: string
  owner: string
  nextaction: string
  review_date: string
  note: string
}

const EMPTY_FORM: BulkEditFormState = {
  sign: '',
  account: '',
  reference: '',
  transaction_id: '',
  project_code: '',
  date_cashflow: '',
  date_offer: '',
  amount: '',
  vat: '',
  total: '',
  stage: '',
  owner: '',
  nextaction: '',
  review_date: '',
  note: '',
}

interface BulkEditDialogProps {
  records: Record[] | null
  currentArea: Area
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (data: RecordUpdate) => void
}

export function BulkEditDialog({
  records,
  currentArea,
  open,
  onOpenChange,
  onConfirm,
}: BulkEditDialogProps) {
  const [phase, setPhase] = useState<'editing' | 'confirming'>('editing')
  const [form, setForm] = useState<BulkEditFormState>({ ...EMPTY_FORM })
  const [lastEdited, setLastEdited] = useState<'vat' | 'total'>('total')

  const stages = STAGES[currentArea] || []

  const setField = <K extends keyof BulkEditFormState>(key: K, value: BulkEditFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Auto-calc logic (same as RecordForm)
  const calcTotalFromVat = (amount: string, vat: string) => {
    const a = parseFloat(amount) || 0
    const v = parseFloat(vat) || 0
    if (a <= 0) return
    setField('total', (a * (1 + v / 100)).toFixed(2))
  }

  const calcVatFromTotal = (amount: string, total: string) => {
    const a = parseFloat(amount) || 0
    const t = parseFloat(total) || 0
    if (a <= 0) { setField('vat', '0'); return }
    setField('vat', (((t - a) / a) * 100).toFixed(0))
  }

  const handleAmountChange = (val: string) => {
    setField('amount', val)
    if (lastEdited === 'vat' && form.vat) {
      calcTotalFromVat(val, form.vat)
    } else if (form.total) {
      calcVatFromTotal(val, form.total)
    }
  }

  const handleVatChange = (val: string) => {
    setField('vat', val)
    setLastEdited('vat')
    if (form.amount) calcTotalFromVat(form.amount, val)
  }

  const handleTotalChange = (val: string) => {
    setField('total', val)
    setLastEdited('total')
    if (form.amount) calcVatFromTotal(form.amount, val)
  }

  const getChangedFields = (): RecordUpdate => {
    const changes: RecordUpdate = {}
    const signMultiplier = form.sign === 'out' ? -1 : 1

    if (form.account.trim()) changes.account = form.account.trim()
    if (form.reference.trim()) changes.reference = form.reference.trim()
    if (form.transaction_id.trim()) changes.transaction_id = form.transaction_id.trim()
    if (form.project_code.trim()) changes.project_code = form.project_code.trim()
    if (form.date_cashflow) changes.date_cashflow = form.date_cashflow
    if (form.date_offer) changes.date_offer = form.date_offer
    if (form.stage) changes.stage = form.stage
    if (form.owner.trim()) changes.owner = form.owner.trim()
    if (form.nextaction.trim()) changes.nextaction = form.nextaction.trim()
    if (form.review_date) changes.review_date = form.review_date
    if (form.note.trim()) changes.note = form.note.trim()

    if (form.amount.trim()) {
      const amountNum = parseFloat(form.amount) || 0
      changes.amount = (amountNum * (form.sign ? signMultiplier : 1)).toString()
    }
    if (form.total.trim()) {
      const totalNum = parseFloat(form.total) || 0
      changes.total = (totalNum * (form.sign ? signMultiplier : 1)).toString()
    }
    if (form.vat.trim() && form.amount.trim()) {
      changes.vat = form.vat
    }

    return changes
  }

  // Human-readable display value for confirmation
  const getDisplayValue = (key: string, value: string): string => {
    if (key === 'stage') {
      return STAGE_LABELS_BY_AREA[currentArea]?.[value] || value
    }
    return value
  }

  const changedFields = getChangedFields()
  const changedEntries = Object.entries(changedFields).filter(([k]) => k !== 'vat')
  const hasChanges = changedEntries.length > 0

  const handleApply = () => {
    if (!hasChanges) return
    setPhase('confirming')
  }

  const handleConfirm = () => {
    onConfirm(changedFields)
    handleReset()
  }

  const handleReset = () => {
    setForm({ ...EMPTY_FORM })
    setPhase('editing')
    setLastEdited('total')
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) handleReset()
    onOpenChange(open)
  }

  if (!records) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {phase === 'editing'
              ? `Modifica Massiva (${records.length} record)`
              : `Conferma Modifica`
            }
          </DialogTitle>
        </DialogHeader>

        {phase === 'editing' ? (
          <>
            <div className="space-y-3 overflow-y-auto flex-1 pr-2">
              <p className="text-sm text-muted-foreground">
                Compila solo i campi che vuoi modificare. I campi vuoti non verranno toccati.
              </p>

              {/* Tipo (Entrata/Uscita) */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">Tipo</Label>
                <div className="flex gap-1">
                  {SIGN_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={form.sign === option.value ? (option.value === 'in' ? 'default' : 'destructive') : 'outline'}
                      onClick={() => setField('sign', form.sign === option.value ? '' : option.value as 'in' | 'out')}
                      className="flex-1"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Conto */}
              <div className="space-y-1">
                <Label htmlFor="bulk-account">Conto</Label>
                <Input id="bulk-account" value={form.account} onChange={e => setField('account', e.target.value)} />
              </div>

              {/* Riferimento */}
              <div className="space-y-1">
                <Label htmlFor="bulk-reference">Riferimento</Label>
                <Input id="bulk-reference" value={form.reference} onChange={e => setField('reference', e.target.value)} />
              </div>

              {/* ID Transazione */}
              <div className="space-y-1">
                <Label htmlFor="bulk-transaction_id">ID Transazione</Label>
                <Input id="bulk-transaction_id" value={form.transaction_id} onChange={e => setField('transaction_id', e.target.value)} />
              </div>

              {/* Codice Progetto */}
              <div className="space-y-1">
                <Label htmlFor="bulk-project_code">Codice Progetto</Label>
                <Input id="bulk-project_code" value={form.project_code} onChange={e => setField('project_code', e.target.value)} placeholder="es. PROJ-001" />
              </div>

              {/* Date */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="bulk-date_cashflow">Data Cashflow</Label>
                  <Input id="bulk-date_cashflow" type="date" value={form.date_cashflow} onChange={e => setField('date_cashflow', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bulk-date_offer">Data Offerta</Label>
                  <Input id="bulk-date_offer" type="date" value={form.date_offer} onChange={e => setField('date_offer', e.target.value)} />
                </div>
              </div>

              {/* Imponibile + IVA% + Totale */}
              <div className="grid grid-cols-[1fr_4rem_1fr] gap-2">
                <div className="space-y-1">
                  <Label htmlFor="bulk-amount">Imponibile</Label>
                  <Input id="bulk-amount" type="number" step="0.01" value={form.amount} onChange={e => handleAmountChange(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bulk-vat">IVA %</Label>
                  <Input id="bulk-vat" type="number" step="1" value={form.vat} onChange={e => handleVatChange(e.target.value)} className="px-1 text-center" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bulk-total">Totale</Label>
                  <Input id="bulk-total" type="number" step="0.01" value={form.total} onChange={e => handleTotalChange(e.target.value)} />
                </div>
              </div>

              {/* Stato */}
              <div className="space-y-1">
                <Label>Stato</Label>
                <div className="flex gap-1">
                  {stages.map((stage) => (
                    <Button
                      key={stage}
                      type="button"
                      size="sm"
                      variant={form.stage === stage ? (stage === '1' ? 'default' : 'destructive') : 'outline'}
                      onClick={() => setField('stage', form.stage === stage ? '' : stage)}
                      className="flex-1"
                    >
                      {STAGE_LABELS_BY_AREA[currentArea]?.[stage] || stage}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Responsabile */}
              <div className="space-y-1">
                <Label htmlFor="bulk-owner">Responsabile</Label>
                <Input id="bulk-owner" value={form.owner} onChange={e => setField('owner', e.target.value)} placeholder="Nome" />
              </div>

              {/* Prossima Azione */}
              <div className="space-y-1">
                <Label htmlFor="bulk-nextaction">Prossima Azione</Label>
                <Input id="bulk-nextaction" value={form.nextaction} onChange={e => setField('nextaction', e.target.value)} placeholder="Azione" />
              </div>

              {/* Prossima Revisione */}
              <div className="space-y-1">
                <Label htmlFor="bulk-review_date">Prossima Revisione</Label>
                <Input id="bulk-review_date" type="date" value={form.review_date} onChange={e => setField('review_date', e.target.value)} />
              </div>

              {/* Note */}
              <div className="space-y-1">
                <Label htmlFor="bulk-note">Note</Label>
                <Textarea id="bulk-note" value={form.note} onChange={e => setField('note', e.target.value)} rows={3} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Annulla
              </Button>
              <Button onClick={handleApply} disabled={!hasChanges}>
                Applica
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <p className="text-sm">
                Modifica massiva di <strong>{records.length}</strong> record
              </p>
              <div className="space-y-2">
                <p className="text-sm font-medium">Campi che verranno modificati:</p>
                <ul className="space-y-1">
                  {changedEntries.map(([key, value]) => (
                    <li key={key} className="text-sm flex items-baseline gap-2">
                      <span className="text-muted-foreground">{FIELD_LABELS[key] || key}</span>
                      <span className="font-medium">→ "{getDisplayValue(key, value as string)}"</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setPhase('editing')}>
                Indietro
              </Button>
              <Button onClick={handleConfirm}>
                Conferma modifica
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
