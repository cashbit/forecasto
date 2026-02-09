import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import type { ActivatedCodeReportRow, AdminUser, BillingSummaryFilter, PartnerBillingSummary } from '@/types/admin'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
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

function PartnerSummaryRow({ summary, month, year }: { summary: PartnerBillingSummary; month: string; year: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [details, setDetails] = useState<ActivatedCodeReportRow[]>([])
  const [loading, setLoading] = useState(false)

  const loadDetails = async () => {
    if (details.length > 0) return
    setLoading(true)
    try {
      const data = await adminApi.getActivatedCodesReport({
        partner_id: summary.partner_id,
        month: parseInt(month),
        year: parseInt(year),
      })
      setDetails(data)
    } catch {
      toast({
        title: 'Errore',
        description: 'Impossibile caricare i dettagli',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = () => {
    if (!isOpen) loadDetails()
    setIsOpen(!isOpen)
  }

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={handleToggle}>
        <TableCell>
          <div className="flex items-center gap-2">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium">{summary.partner_name}</span>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline">{partnerTypeLabel(summary.partner_type)}</Badge>
        </TableCell>
        <TableCell className="text-center">{summary.total_activated}</TableCell>
        <TableCell className="text-center">{summary.invoiced_count}</TableCell>
        <TableCell className="text-center">{summary.not_invoiced_count}</TableCell>
        <TableCell className="text-center">{summary.invoiced_to_client}</TableCell>
        <TableCell className="text-center">{summary.invoiced_to_partner}</TableCell>
        <TableCell className="text-center">{summary.fee_recognized_count}</TableCell>
        <TableCell className="text-center">
          {summary.fee_pending_count > 0 ? (
            <Badge variant="outline">{summary.fee_pending_count}</Badge>
          ) : (
            '0'
          )}
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow>
          <TableCell colSpan={9} className="p-0">
            <div className="bg-muted/30 p-4">
              {loading ? (
                <div className="text-center py-4 text-muted-foreground">Caricamento...</div>
              ) : details.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  Nessun dettaglio disponibile
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Codice</TableHead>
                      <TableHead>Data attivazione</TableHead>
                      <TableHead>Utente</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Fatturato</TableHead>
                      <TableHead>Fatturato a</TableHead>
                      <TableHead>Fee</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.map((row) => (
                      <TableRow key={row.code_id}>
                        <TableCell className="font-mono text-sm">{row.code}</TableCell>
                        <TableCell>{formatDate(row.used_at)}</TableCell>
                        <TableCell>
                          <div>
                            <div className="text-sm">{row.used_by_name || '-'}</div>
                            <div className="text-xs text-muted-foreground">{row.used_by_email || ''}</div>
                          </div>
                        </TableCell>
                        <TableCell>{row.batch_name || '-'}</TableCell>
                        <TableCell>
                          {row.invoiced ? (
                            <Badge variant="default">Si</Badge>
                          ) : (
                            <Badge variant="outline">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>{row.invoiced_to || '-'}</TableCell>
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
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export function BillingSummaryPage() {
  const now = new Date()
  const [summaries, setSummaries] = useState<PartnerBillingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [partners, setPartners] = useState<AdminUser[]>([])
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1))
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [selectedPartnerId, setSelectedPartnerId] = useState('')

  const fetchPartners = async () => {
    try {
      const data = await adminApi.listUsers({ status: 'partner' })
      setPartners(data.users)
    } catch {
      // silently fail
    }
  }

  const fetchSummaries = async () => {
    setLoading(true)
    try {
      const filters: BillingSummaryFilter = {
        month: parseInt(selectedMonth),
        year: parseInt(selectedYear),
      }
      if (selectedPartnerId) filters.partner_id = selectedPartnerId

      const data = await adminApi.getBillingSummary(filters)
      setSummaries(data)
    } catch {
      toast({
        title: 'Errore',
        description: 'Impossibile caricare il sommario',
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
    fetchSummaries()
  }, [selectedMonth, selectedYear, selectedPartnerId])

  const handleExportCSV = () => {
    const header = 'Partner,Tipo,Attivati,Fatturati,Non fatturati,Fatt. Cliente,Fatt. Partner,Fee riconosciute,Fee pendenti\n'
    const rows = summaries
      .map(
        (s) =>
          `${s.partner_name},${partnerTypeLabel(s.partner_type)},${s.total_activated},${s.invoiced_count},${s.not_invoiced_count},${s.invoiced_to_client},${s.invoiced_to_partner},${s.fee_recognized_count},${s.fee_pending_count}`
      )
      .join('\n')

    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report_fatturazione_${selectedYear}_${selectedMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Report Fatturazione</h2>
        <p className="text-muted-foreground">
          Sommario fatturazione per periodo e partner
        </p>
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
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Esporta CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sommario per Partner</CardTitle>
          <CardDescription>
            Clicca su un partner per vedere il dettaglio dei codici
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground">Caricamento...</div>
          ) : summaries.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              Nessun dato disponibile per il periodo selezionato
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-center">Attivati</TableHead>
                  <TableHead className="text-center">Fatturati</TableHead>
                  <TableHead className="text-center">Non fatt.</TableHead>
                  <TableHead className="text-center">Fatt. Cliente</TableHead>
                  <TableHead className="text-center">Fatt. Partner</TableHead>
                  <TableHead className="text-center">Fee riconosc.</TableHead>
                  <TableHead className="text-center">Fee pendenti</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((summary) => (
                  <PartnerSummaryRow
                    key={summary.partner_id}
                    summary={summary}
                    month={selectedMonth}
                    year={selectedYear}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
