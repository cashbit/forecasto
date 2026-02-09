import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { adminApi } from '@/api/admin'
import { PartnerCombobox } from '@/components/admin/PartnerCombobox'
import type { ActivatedCodeReportRow, ActivatedCodesReportFilter, AdminUser } from '@/types/admin'
import { Download, FileText, Receipt } from 'lucide-react'
import { toast } from '@/hooks/useToast'

const MONTHS = [
  { value: '1', label: 'Gennaio' },
  { value: '2', label: 'Febbraio' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Aprile' },
  { value: '5', label: 'Maggio' },
  { value: '6', label: 'Giugno' },
  { value: '7', label: 'Luglio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Settembre' },
  { value: '10', label: 'Ottobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Dicembre' },
]

function formatDate(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function partnerTypeLabel(type: string | null): string {
  if (type === 'billing_to_client') return 'Fatt. Cliente'
  if (type === 'billing_to_partner') return 'Fatt. Partner'
  return '-'
}

export function ActivatedCodesReportPage() {
  const now = new Date()
  const [rows, setRows] = useState<ActivatedCodeReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [partners, setPartners] = useState<AdminUser[]>([])
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1))
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [selectedPartnerId, setSelectedPartnerId] = useState('')
  const [invoicedFilter, setInvoicedFilter] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
  const [invoiceTo, setInvoiceTo] = useState<'client' | 'partner'>('client')
  const [invoiceNote, setInvoiceNote] = useState('')
  const [processing, setProcessing] = useState(false)

  const fetchPartners = async () => {
    try {
      const data = await adminApi.listUsers({ status: 'partner' })
      setPartners(data.users)
    } catch {
      // silently fail
    }
  }

  const fetchReport = async () => {
    setLoading(true)
    try {
      const filters: ActivatedCodesReportFilter = {
        month: parseInt(selectedMonth),
        year: parseInt(selectedYear),
      }
      if (selectedPartnerId) filters.partner_id = selectedPartnerId
      if (invoicedFilter === 'yes') filters.invoiced = true
      if (invoicedFilter === 'no') filters.invoiced = false

      const data = await adminApi.getActivatedCodesReport(filters)
      setRows(data)
      setSelectedIds(new Set())
    } catch {
      toast({
        title: 'Errore',
        description: 'Impossibile caricare il report',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPartners()
  }, [])

  useEffect(() => {
    fetchReport()
  }, [selectedMonth, selectedYear, selectedPartnerId, invoicedFilter])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map((r) => r.code_id)))
    }
  }

  const handleInvoice = async () => {
    if (selectedIds.size === 0) return
    setProcessing(true)
    try {
      const count = await adminApi.invoiceCodes({
        code_ids: Array.from(selectedIds),
        invoiced_to: invoiceTo,
        invoice_note: invoiceNote || null,
      })
      toast({ title: `${count} codici fatturati` })
      setInvoiceDialogOpen(false)
      setInvoiceNote('')
      fetchReport()
    } catch {
      toast({
        title: 'Errore',
        description: 'Impossibile fatturare i codici',
        variant: 'destructive',
      })
    } finally {
      setProcessing(false)
    }
  }

  const handleRecognizeFee = async () => {
    if (selectedIds.size === 0) return
    setProcessing(true)
    try {
      const count = await adminApi.recognizePartnerFee(Array.from(selectedIds))
      toast({ title: `Fee riconosciute per ${count} codici` })
      fetchReport()
    } catch {
      toast({
        title: 'Errore',
        description: 'Impossibile riconoscere le fee',
        variant: 'destructive',
      })
    } finally {
      setProcessing(false)
    }
  }

  const handleExportCSV = async () => {
    try {
      const filters: ActivatedCodesReportFilter = {
        month: parseInt(selectedMonth),
        year: parseInt(selectedYear),
      }
      if (selectedPartnerId) filters.partner_id = selectedPartnerId
      if (invoicedFilter === 'yes') filters.invoiced = true
      if (invoicedFilter === 'no') filters.invoiced = false

      const blob = await adminApi.exportActivatedCodesCSV(filters)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report_attivazioni_${selectedYear}_${selectedMonth}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast({
        title: 'Errore',
        description: 'Impossibile esportare il CSV',
        variant: 'destructive',
      })
    }
  }

  // Summary stats
  const totalActivated = rows.length
  const invoicedCount = rows.filter((r) => r.invoiced).length
  const notInvoicedCount = totalActivated - invoicedCount
  const feePending = rows.filter(
    (r) => r.invoiced && r.invoiced_to === 'client' && !r.partner_fee_recognized
  ).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Report Attivazioni</h2>
        <p className="text-muted-foreground">
          Codici attivati per periodo e partner
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalActivated}</div>
            <p className="text-xs text-muted-foreground">Totale attivati</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{invoicedCount}</div>
            <p className="text-xs text-muted-foreground">Fatturati</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{notInvoicedCount}</div>
            <p className="text-xs text-muted-foreground">Non fatturati</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{feePending}</div>
            <p className="text-xs text-muted-foreground">Fee da riconoscere</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Mese:</Label>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Anno:</Label>
          <Input
            type="number"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-[100px]"
          />
        </div>
        <div className="flex items-center gap-2 min-w-[250px]">
          <Label className="text-sm whitespace-nowrap">Partner:</Label>
          <PartnerCombobox
            partners={partners}
            value={selectedPartnerId}
            onValueChange={setSelectedPartnerId}
            placeholder="Tutti i partner"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Stato:</Label>
          <Select value={invoicedFilter} onValueChange={setInvoicedFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="yes">Fatturati</SelectItem>
              <SelectItem value="no">Non fatturati</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Actions toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
          <span className="text-sm font-medium">{selectedIds.size} selezionati</span>
          <Button
            size="sm"
            onClick={() => setInvoiceDialogOpen(true)}
          >
            <Receipt className="h-4 w-4 mr-1" />
            Segna come fatturato
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRecognizeFee}
            disabled={processing}
          >
            <FileText className="h-4 w-4 mr-1" />
            Riconosci fee partner
          </Button>
        </div>
      )}

      {/* Export button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="h-4 w-4 mr-2" />
          Esporta CSV
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Caricamento...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Nessun codice attivato nel periodo selezionato
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={selectedIds.size === rows.length && rows.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Codice</TableHead>
                <TableHead>Data attivazione</TableHead>
                <TableHead>Utente</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Tipo Partner</TableHead>
                <TableHead>Fatturato</TableHead>
                <TableHead>Fatturato a</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead>Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.code_id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(row.code_id)}
                      onCheckedChange={() => toggleSelect(row.code_id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{row.code}</TableCell>
                  <TableCell>{formatDate(row.used_at)}</TableCell>
                  <TableCell>
                    <div>
                      <div className="text-sm">{row.used_by_name || '-'}</div>
                      <div className="text-xs text-muted-foreground">{row.used_by_email || ''}</div>
                    </div>
                  </TableCell>
                  <TableCell>{row.batch_name || '-'}</TableCell>
                  <TableCell>{row.partner_name || '-'}</TableCell>
                  <TableCell>{partnerTypeLabel(row.partner_type)}</TableCell>
                  <TableCell>
                    {row.invoiced ? (
                      <Badge variant="default">Si</Badge>
                    ) : (
                      <Badge variant="outline">No</Badge>
                    )}
                  </TableCell>
                  <TableCell>{row.invoiced_to || '-'}</TableCell>
                  <TableCell className="max-w-[150px] truncate">{row.invoice_note || '-'}</TableCell>
                  <TableCell>
                    {row.invoiced && row.invoiced_to === 'client' ? (
                      row.partner_fee_recognized ? (
                        <Badge variant="default">Si</Badge>
                      ) : (
                        <Badge variant="outline">Pendente</Badge>
                      )
                    ) : (
                      '-'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Invoice Dialog */}
      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Segna come fatturato</DialogTitle>
            <DialogDescription>
              Stai per fatturare {selectedIds.size} codici. Scegli il tipo di fatturazione.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Fatturato a</Label>
              <Select value={invoiceTo} onValueChange={(v) => setInvoiceTo(v as 'client' | 'partner')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Cliente</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nota fattura (opzionale)</Label>
              <Input
                placeholder="es. Fattura #123"
                value={invoiceNote}
                onChange={(e) => setInvoiceNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleInvoice} disabled={processing}>
              {processing ? 'Fatturazione...' : 'Fattura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
