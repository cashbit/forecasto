import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, Loader2, ArrowLeft, Building2, CalendarClock, Send, Download, FileCode, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/formatters'
import { VAT_RATES, NATURA_OPTIONS, vatCategoryForRate } from '@/lib/invoiceConstants'
import { toast } from '@/hooks/useToast'
import { useInvoices, useInvoice } from '@/hooks/useInvoices'
import { invoicesApi } from '@/api/invoices'
import { ExtendedFieldsAccordion } from './ExtendedFieldsAccordion'
import type { Customer } from '@/types/customer'
import type { InvoiceDraftCreate } from '@/types/invoice'

interface LineRow {
  key: string
  code: string
  name: string
  quantity: string
  net_unit_price: string
  discount_percent: string
  vat_rate: string
  natura: string
}

interface ScadenzaRow {
  key: string
  due_date: string
  amount: string
}

interface InvoiceEditorProps {
  workspaceId: string
  invoiceId?: string
  /** Pre-selected customer for a NEW invoice (header is read-only). */
  customer?: Customer
  onBack: () => void
  onSaved?: (documentId: string) => void
}

let _seq = 0
const nextKey = () => `r${_seq++}`

const emptyLine = (): LineRow => ({
  key: nextKey(), code: '', name: '', quantity: '1', net_unit_price: '', discount_percent: '', vat_rate: '22', natura: '',
})

function num(v: string): number {
  const n = parseFloat((v || '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function lineNet(l: LineRow): number {
  const gross = num(l.quantity) * num(l.net_unit_price)
  const disc = num(l.discount_percent)
  return Math.round(gross * (1 - disc / 100) * 100) / 100
}

export function InvoiceEditor({ workspaceId, invoiceId, customer, onBack, onSaved }: InvoiceEditorProps) {
  const { createDraft, updateInvoice, issueInvoice, isSaving, isIssuing } = useInvoices(workspaceId)
  const { data: existing, isLoading: loadingExisting } = useInvoice(workspaceId, invoiceId)

  const [typeCode, setTypeCode] = useState('380')
  const [issueDate, setIssueDate] = useState('')
  const [causale, setCausale] = useState('')
  const [esigibilita, setEsigibilita] = useState('I')
  const [terms, setTerms] = useState(() => customer?.data.default_payment_terms ?? '')
  const [parsingTerms, setParsingTerms] = useState(false)
  const [lines, setLines] = useState<LineRow[]>([emptyLine()])
  const [scadenze, setScadenze] = useState<ScadenzaRow[]>([])
  const [extended, setExtended] = useState<Record<string, Record<string, string>>>({})
  const [docId, setDocId] = useState<string | undefined>(invoiceId)
  const [status, setStatus] = useState<string>('draft')
  const [number, setNumber] = useState<string | null>(null)
  const [confirmIssueOpen, setConfirmIssueOpen] = useState(false)

  const { data: einvoices = [] } = useQuery({
    queryKey: ['einvoices', workspaceId, docId, status],
    queryFn: () => invoicesApi.listEInvoices(workspaceId, docId!),
    enabled: !!docId && status !== 'draft',
  })

  // Customer shown in the (read-only) header: from the prop (new) or the snapshot (edit).
  const headerCustomer = useMemo(() => {
    if (customer) return { name: customer.data.legal_name, vat: customer.data.vat_id, code: customer.data.customer_code }
    const snap = existing?.data.customer_snapshot as { legal_name?: string; vat_id?: string; customer_code?: string } | null
    return snap ? { name: snap.legal_name, vat: snap.vat_id, code: snap.customer_code } : null
  }, [customer, existing])

  useEffect(() => {
    if (!existing) return
    const d = existing.data
    setDocId(existing.document_id)
    setStatus(existing.status)
    setNumber(existing.number)
    setTypeCode(d.type_code ?? '380')
    setIssueDate(d.issue_date ?? '')
    setCausale(d.causale ?? '')
    setEsigibilita(d.payments?.esigibilita_iva ?? 'I')
    setTerms(d.payments?.terms ?? '')
    setLines(
      (d.lines ?? []).map((l) => ({
        key: nextKey(), code: l.code ?? '', name: l.name ?? '', quantity: l.quantity ?? '1',
        net_unit_price: l.net_unit_price ?? '', discount_percent: l.discount_percent ?? '',
        vat_rate: l.vat_rate ?? '22', natura: l.natura ?? '',
      })) || [emptyLine()],
    )
    setScadenze((d.payments?.scadenze ?? []).map((s) => ({ key: nextKey(), due_date: s.due_date, amount: s.amount ?? '' })))
    setExtended((d.extended as Record<string, Record<string, string>>) ?? {})
  }, [existing])

  const totals = useMemo(() => {
    const byRate = new Map<string, { taxable: number; rate: number }>()
    let lineTotal = 0
    for (const l of lines) {
      const net = lineNet(l)
      lineTotal += net
      const rate = num(l.vat_rate)
      const g = byRate.get(String(rate)) ?? { taxable: 0, rate }
      g.taxable += net
      byRate.set(String(rate), g)
    }
    let tax = 0
    for (const g of byRate.values()) tax += Math.round((g.taxable * g.rate) / 100 * 100) / 100
    lineTotal = Math.round(lineTotal * 100) / 100
    tax = Math.round(tax * 100) / 100
    return { lineTotal, tax, grand: Math.round((lineTotal + tax) * 100) / 100 }
  }, [lines])

  const updateLine = (key: string, patch: Partial<LineRow>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const buildPayload = (): InvoiceDraftCreate => ({
    ...(docId ? {} : { customer_document_id: customer?.document_id ?? null }),
    type_code: typeCode,
    issue_date: issueDate || null,
    causale: causale || null,
    lines: lines
      .filter((l) => l.net_unit_price !== '')
      .map((l) => ({
        code: l.code || undefined,
        name: l.name || undefined,
        quantity: l.quantity || '1',
        net_unit_price: l.net_unit_price,
        discount_percent: l.discount_percent === '' ? null : l.discount_percent,
        vat_rate: l.vat_rate || '0',
        vat_category: vatCategoryForRate(l.vat_rate || '0'),
        natura: num(l.vat_rate) === 0 ? (l.natura || undefined) : undefined,
      })),
    payments: {
      esigibilita_iva: esigibilita,
      terms: terms || null,
      scadenze: scadenze.map((s) => ({ due_date: s.due_date, amount: s.amount === '' ? null : s.amount })),
    },
    extended,
  })

  const handleGenerateScadenze = async () => {
    if (!terms.trim()) {
      toast({ title: 'Indica la modalità di pagamento (es. 30/60/90 df fm)', variant: 'destructive' })
      return
    }
    if (!issueDate) {
      toast({ title: 'Imposta prima la data documento', variant: 'destructive' })
      return
    }
    setParsingTerms(true)
    try {
      const parsed = await invoicesApi.parsePaymentTerms(workspaceId, terms, issueDate)
      if (parsed.length === 0) {
        toast({ title: 'Modalità di pagamento non riconosciuta', variant: 'destructive' })
        return
      }
      setScadenze(parsed.map((p) => ({ key: nextKey(), due_date: p.due_date, amount: '' })))
      toast({ title: `${parsed.length} scadenz${parsed.length === 1 ? 'a' : 'e'} generate`, variant: 'success' })
    } catch {
      toast({ title: 'Errore nel calcolo delle scadenze', variant: 'destructive' })
    } finally {
      setParsingTerms(false)
    }
  }

  const handleSave = async () => {
    const payload = buildPayload()
    if (payload.lines.length === 0) {
      toast({ title: 'Aggiungi almeno una riga con un importo', variant: 'destructive' })
      return
    }
    const zeroNoNatura = payload.lines.find((l) => num(String(l.vat_rate)) === 0 && !l.natura)
    if (zeroNoNatura) {
      toast({ title: 'Per le righe con IVA 0% indica la Natura', variant: 'destructive' })
      return
    }
    try {
      if (docId) {
        const inv = await updateInvoice({ documentId: docId, data: payload })
        setStatus(inv.status)
        setNumber(inv.number)
        toast({ title: 'Fattura salvata', variant: 'success' })
        onSaved?.(inv.document_id)
      } else {
        const inv = await createDraft(payload)
        setDocId(inv.document_id)
        setStatus(inv.status)
        toast({ title: 'Bozza creata', variant: 'success' })
        onSaved?.(inv.document_id)
      }
    } catch {
      /* toast handled by hook */
    }
  }

  const handleIssue = async () => {
    setConfirmIssueOpen(false)
    if (!docId) return
    try {
      const inv = await issueInvoice(docId)
      setStatus(inv.status)
      setNumber(inv.number)
      toast({ title: `Fattura emessa Nº ${inv.number}`, variant: 'success' })
      onSaved?.(inv.document_id)
    } catch {
      /* toast handled by hook */
    }
  }

  if (invoiceId && loadingExisting) {
    return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Indietro
          </Button>
          {number ? (
            <Badge>Nº {number}</Badge>
          ) : (
            <Badge variant="secondary">Bozza</Badge>
          )}
          {status === 'issued' && <span className="text-sm text-green-600">Emessa</span>}
        </div>
        <div className="flex gap-2">
          <Button variant={status === 'draft' && docId ? 'outline' : 'default'} onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {docId ? 'Salva' : 'Crea bozza'}
          </Button>
          {docId && status === 'draft' && (
            <Button onClick={() => setConfirmIssueOpen(true)} disabled={isIssuing}>
              {isIssuing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Emetti
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={confirmIssueOpen} onOpenChange={setConfirmIssueOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Emettere la fattura?</AlertDialogTitle>
            <AlertDialogDescription>
              Verrà assegnato il <strong>numero definitivo</strong> e creati i movimenti di cassa
              (uno per scadenza) nell'area Consuntivo. L'operazione assegna il numero in modo
              permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleIssue}>Emetti fattura</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader><CardTitle className="text-base">Testata</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {headerCustomer && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{headerCustomer.name}</div>
                <div className="text-xs text-muted-foreground">
                  {[headerCustomer.code, headerCustomer.vat].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={typeCode} onValueChange={setTypeCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="380">Fattura (TD01)</SelectItem>
                  <SelectItem value="381">Nota di credito (TD04)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Data documento</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Causale</Label>
            <Textarea value={causale} onChange={(e) => setCausale(e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Righe</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="hidden md:grid grid-cols-[90px_1fr_70px_110px_80px_90px_110px_40px] gap-2 text-xs text-muted-foreground px-1">
            <span>Codice</span><span>Descrizione</span><span className="text-right">Q.tà</span>
            <span className="text-right">Prezzo</span><span className="text-right">Sconto %</span>
            <span>IVA</span><span className="text-right">Imponibile</span><span />
          </div>
          {lines.map((l) => (
            <div key={l.key} className="space-y-1">
              <div className="grid grid-cols-2 md:grid-cols-[90px_1fr_70px_110px_80px_90px_110px_40px] gap-2 items-center">
                <Input placeholder="Cod." value={l.code} onChange={(e) => updateLine(l.key, { code: e.target.value })} />
                <Input placeholder="Descrizione" value={l.name} onChange={(e) => updateLine(l.key, { name: e.target.value })} />
                <Input className="text-right" value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} />
                <Input className="text-right" placeholder="0,00" value={l.net_unit_price} onChange={(e) => updateLine(l.key, { net_unit_price: e.target.value })} />
                <Input className="text-right" placeholder="0" value={l.discount_percent} onChange={(e) => updateLine(l.key, { discount_percent: e.target.value })} />
                <Select value={l.vat_rate} onValueChange={(v) => updateLine(l.key, { vat_rate: v, natura: num(v) === 0 ? l.natura : '' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VAT_RATES.map((r) => <SelectItem key={r} value={r}>{r}%</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="text-right text-sm tabular-nums px-2">{formatCurrency(lineNet(l))}</div>
                <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {num(l.vat_rate) === 0 && (
                <div className="md:pl-[100px]">
                  <Select value={l.natura} onValueChange={(v) => updateLine(l.key, { natura: v })}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Natura (obbligatoria con IVA 0%)" /></SelectTrigger>
                    <SelectContent>
                      {NATURA_OPTIONS.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <Plus className="h-4 w-4 mr-1" /> Aggiungi riga
          </Button>

          <div className="flex justify-end pt-2">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Imponibile</span><span className="tabular-nums">{formatCurrency(totals.lineTotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span className="tabular-nums">{formatCurrency(totals.tax)}</span></div>
              <div className="flex justify-between font-semibold border-t pt-1"><span>Totale</span><span className="tabular-nums">{formatCurrency(totals.grand)}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pagamenti e scadenze</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 w-44">
              <Label>Esigibilità IVA</Label>
              <Select value={esigibilita} onValueChange={setEsigibilita}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="I">Immediata</SelectItem>
                  <SelectItem value="D">Differita</SelectItem>
                  <SelectItem value="S">Split payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[220px]">
              <Label>Modalità di pagamento</Label>
              <Input
                placeholder="es. 30/60/90 df fm, immediato, 30 gg fm…"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={handleGenerateScadenze} disabled={parsingTerms}>
              {parsingTerms ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CalendarClock className="h-4 w-4 mr-1" />}
              Genera scadenze
            </Button>
          </div>
          {scadenze.map((s) => (
            <div key={s.key} className="grid grid-cols-[160px_140px_40px] gap-2 items-center">
              <Input type="date" value={s.due_date} onChange={(e) => setScadenze((ss) => ss.map((x) => x.key === s.key ? { ...x, due_date: e.target.value } : x))} />
              <Input className="text-right" placeholder="auto" value={s.amount} onChange={(e) => setScadenze((ss) => ss.map((x) => x.key === s.key ? { ...x, amount: e.target.value } : x))} />
              <Button variant="ghost" size="icon" onClick={() => setScadenze((ss) => ss.filter((x) => x.key !== s.key))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setScadenze((ss) => [...ss, { key: nextKey(), due_date: '', amount: '' }])}>
            <Plus className="h-4 w-4 mr-1" /> Aggiungi scadenza
          </Button>
          <p className="text-xs text-muted-foreground">Lascia l'importo vuoto per distribuire automaticamente il totale tra le scadenze.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Dati aggiuntivi (opzionali)</CardTitle></CardHeader>
        <CardContent>
          <ExtendedFieldsAccordion value={extended} onChange={setExtended} />
        </CardContent>
      </Card>

      {status !== 'draft' && einvoices.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Documenti elettronici (XML)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {einvoices.map((e) => (
              <div key={e.document_id} className="flex items-center justify-between border rounded-md px-3 py-2">
                <div className="flex items-center gap-3">
                  <FileCode className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium uppercase">{e.standard}</div>
                    <div className="text-xs text-muted-foreground">{e.filename}</div>
                  </div>
                  {e.validation?.ok ? (
                    <span className="text-xs flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> valido</span>
                  ) : (
                    <span className="text-xs flex items-center gap-1 text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> errori</span>
                  )}
                  {e.stale && <Badge variant="secondary">da rigenerare</Badge>}
                </div>
                <Button variant="outline" size="sm" onClick={() => invoicesApi.downloadEInvoiceXml(workspaceId, e.document_id)}>
                  <Download className="h-4 w-4 mr-1" /> XML
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
