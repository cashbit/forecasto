import { useState, useRef, useCallback } from 'react'
import {
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { parseSdiXml, classifyInvoice } from '@/lib/sdi-parser'
import type { SdiInvoice, SdiClassification } from '@/lib/sdi-parser'
import type { Record as RecordType, RecordCreate, RecordUpdate, RecordFilters, Area } from '@/types/record'
import type { SdiSupplierMapping } from '@/types/workspace'
import { recordsApi } from '@/api/records'
import { workspacesApi } from '@/api/workspaces'
import { Link } from 'react-router-dom'

interface SdiImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  workspaceName: string
  workspaceVatNumber: string
  workspaceSettings: Record<string, unknown>
  onImportComplete: () => void
}

type MatchedArea = 'orders' | 'prospect' | 'budget'

interface SdiPreviewRow {
  id: string // unique key
  selected: boolean
  invoice: SdiInvoice
  classification: SdiClassification
  rataIndex: number // which installment (0-based)
  rataTotal: number // total installments
  dateCashflow: string
  account: string
  vatDeduction: string
  isNewCounterpart: boolean
  isDuplicate: boolean
  matchedRecord: RecordType | null
  matchedArea: MatchedArea | null
}

interface ImportResult {
  total: number
  success: number
  failed: number
  errors: string[]
}

export function SdiImportDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceName,
  workspaceVatNumber,
  workspaceSettings,
  onImportComplete,
}: SdiImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [previewRows, setPreviewRows] = useState<SdiPreviewRow[] | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [targetArea, setTargetArea] = useState<Area>('actual')
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Load supplier mappings from workspace settings
  const supplierMappings: Record<string, SdiSupplierMapping> =
    (workspaceSettings.sdi_supplier_mappings as Record<string, SdiSupplierMapping>) || {}

  // Track known counterpart VATs from existing records (loaded from mappings)
  const knownVats = new Set(Object.keys(supplierMappings))

  const resetState = () => {
    setPreviewRows(null)
    setParseErrors([])
    setIsImporting(false)
    setIsProcessing(false)
    setImportProgress(0)
    setImportResult(null)
  }

  const handleClose = () => {
    if (!isImporting) {
      resetState()
      onOpenChange(false)
    }
  }

  const processFiles = async (files: FileList) => {
    setParseErrors([])
    setImportResult(null)
    setIsProcessing(true)

    const rows: SdiPreviewRow[] = []
    const errors: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const xmlContent = await file.text()
        const invoice = parseSdiXml(xmlContent, file.name)
        const classification = classifyInvoice(invoice, workspaceVatNumber)

        const mapping = supplierMappings[classification.counterpartVat]
        const isNew = !knownVats.has(classification.counterpartVat)

        // Create one row per installment
        for (let rIdx = 0; rIdx < invoice.rate.length; rIdx++) {
          const rata = invoice.rate[rIdx]
          rows.push({
            id: `${file.name}-${rIdx}`,
            selected: true,
            invoice,
            classification,
            rataIndex: rIdx,
            rataTotal: invoice.rate.length,
            dateCashflow: rata.scadenza || invoice.dataEmissione,
            account: mapping?.account || '',
            vatDeduction: mapping ? String(mapping.vat_deduction) : '100',
            isNewCounterpart: isNew,
            isDuplicate: false,
            matchedRecord: null,
            matchedArea: null,
          })
        }
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Errore sconosciuto'}`)
      }
    }

    // Fetch existing records for duplicate detection and order matching
    try {
      const existingActual = await recordsApi.list(workspaceId, { area: 'actual', page_size: 5000 } as RecordFilters)
      const existingSourceFiles = new Set<string>()
      for (const rec of existingActual.items) {
        if (rec.classification?.source_file) {
          existingSourceFiles.add(rec.classification.source_file)
        }
      }

      // Mark duplicates
      for (const row of rows) {
        if (existingSourceFiles.has(row.invoice.fileName)) {
          row.isDuplicate = true
          row.selected = false
        }
      }

      // Fetch records from Orders, Prospect, Budget for promotion matching
      const areasToCheck: MatchedArea[] = ['orders', 'prospect', 'budget']
      const areaRecords: Record<string, RecordType[]> = {}
      for (const area of areasToCheck) {
        try {
          const resp = await recordsApi.list(workspaceId, { area, page_size: 5000 } as RecordFilters)
          areaRecords[area] = resp.items
          console.log(`[SDI] Fetched ${resp.items.length} records from ${area}`)
        } catch (err) {
          console.error(`[SDI] Failed to fetch ${area}:`, err)
          areaRecords[area] = []
        }
      }

      // Word-based fuzzy reference matching: >= 2/3 word overlap
      // Filter out short words (< 3 chars) to avoid false positives from Italian articles/prepositions
      const toWords = (s: string): string[] =>
        s.toLowerCase().split(/[\s.]+/).filter(w => w.length >= 3)

      const fuzzyRefMatch = (a: string, b: string): boolean => {
        const wordsA = toWords(a)
        const wordsB = toWords(b)
        if (wordsA.length === 0 || wordsB.length === 0) return false

        const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA]
        // Only match words of 3+ chars to avoid substring false positives
        const matched = shorter.filter(sw => longer.some(lw => lw === sw || (sw.length >= 4 && lw.length >= 4 && (lw.includes(sw) || sw.includes(lw)))))
        return matched.length >= Math.ceil(shorter.length * 2 / 3)
      }

      // Track which existing records have already been matched (one-to-one)
      const matchedRecordIds = new Set<string>()

      for (const row of rows) {
        if (row.isDuplicate) continue

        // Compute the invoice imponibile for this installment
        const totaleFattura = Math.abs(parseFloat(row.invoice.totale))
        const importoRata = Math.abs(parseFloat(row.invoice.rate[row.rataIndex].importo))
        const ratio = totaleFattura > 0 ? importoRata / totaleFattura : 1
        const invoiceAmount = Math.abs(parseFloat(row.invoice.imponibile)) * ratio
        const invoiceDateStr = row.dateCashflow

        for (const area of areasToCheck) {
          const candidates = areaRecords[area]
          let bestMatch: RecordType | null = null
          let bestDateDiff = Infinity

          for (const rec of candidates) {
            if (matchedRecordIds.has(rec.id)) continue

            // Reference fuzzy match: word-based overlap
            const refMatched = fuzzyRefMatch(rec.reference, row.classification.counterpartName)
            if (!refMatched) {
              console.log(`[SDI] Ref NO match: "${rec.reference}" vs "${row.classification.counterpartName}"`)
              continue
            }

            // Amount match: ±10%
            const recAmount = Math.abs(parseFloat(rec.amount))
            console.log(`[SDI] Ref match! "${rec.reference}" vs "${row.classification.counterpartName}" | amount: rec=${recAmount} inv=${invoiceAmount}`)
            if (recAmount === 0 && invoiceAmount === 0) {
              // both zero, match
            } else if (recAmount === 0 || invoiceAmount === 0) {
              console.log(`[SDI] Amount SKIP: one is zero`)
              continue
            } else {
              const diff = Math.abs(recAmount - invoiceAmount) / Math.max(recAmount, invoiceAmount)
              if (diff > 0.1) {
                console.log(`[SDI] Amount NO match: diff=${(diff*100).toFixed(1)}%`)
                continue
              }
            }

            // Pick closest by date_cashflow
            const dateDiff = Math.abs(
              new Date(rec.date_cashflow).getTime() - new Date(invoiceDateStr).getTime()
            )
            if (dateDiff < bestDateDiff) {
              bestDateDiff = dateDiff
              bestMatch = rec
            }
          }

          if (bestMatch) {
            row.matchedRecord = bestMatch
            row.matchedArea = area
            matchedRecordIds.add(bestMatch.id)
            // Pre-fill account from matched record if row has no account
            if (!row.account && bestMatch.account) {
              row.account = bestMatch.account
            }
            break // Stop cascading: found match in this area
          }
        }
      }
    } catch (err) {
      console.error('[SDI] Dedup/matching failed:', err)
    }

    setPreviewRows(rows)
    setParseErrors(errors)
    setIsProcessing(false)
  }

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files)
    }
  }, [workspaceVatNumber])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files)
    }
  }

  // Auto-propagate account and vatDeduction by counterpart VAT
  const handleAccountChange = (rowId: string, value: string) => {
    setPreviewRows(prev => {
      if (!prev) return prev
      const targetRow = prev.find(r => r.id === rowId)
      if (!targetRow) return prev
      const counterpartVat = targetRow.classification.counterpartVat

      return prev.map(row => {
        if (row.id === rowId) return { ...row, account: value }
        // Auto-propagate to same counterpart if empty
        if (row.classification.counterpartVat === counterpartVat && !row.account) {
          return { ...row, account: value }
        }
        return row
      })
    })
  }

  const handleVatDeductionChange = (rowId: string, value: string) => {
    setPreviewRows(prev => {
      if (!prev) return prev
      const targetRow = prev.find(r => r.id === rowId)
      if (!targetRow) return prev
      const counterpartVat = targetRow.classification.counterpartVat

      return prev.map(row => {
        if (row.id === rowId) return { ...row, vatDeduction: value }
        // Auto-propagate to same counterpart if they still have default
        if (row.classification.counterpartVat === counterpartVat && row.vatDeduction === '100') {
          return { ...row, vatDeduction: value }
        }
        return row
      })
    })
  }

  const handleDateChange = (rowId: string, value: string) => {
    setPreviewRows(prev =>
      prev?.map(row => (row.id === rowId ? { ...row, dateCashflow: value } : row)) || null
    )
  }

  const handleToggleRow = (rowId: string) => {
    setPreviewRows(prev =>
      prev?.map(row => (row.id === rowId ? { ...row, selected: !row.selected } : row)) || null
    )
  }

  const handleToggleAll = (checked: boolean) => {
    setPreviewRows(prev => prev?.map(row => ({ ...row, selected: checked })) || null)
  }

  const convertToRecordCreate = (row: SdiPreviewRow): RecordCreate => {
    const inv = row.invoice
    const cls = row.classification
    const rata = inv.rate[row.rataIndex]
    const isExpense = cls.direction === 'out'

    // Prorate imponibile for installments
    const totaleFattura = Math.abs(parseFloat(inv.totale))
    const importoRata = Math.abs(parseFloat(rata.importo))
    const ratio = totaleFattura > 0 ? importoRata / totaleFattura : 1
    const imponibileRata = Math.abs(parseFloat(inv.imponibile)) * ratio

    const signMultiplier = isExpense ? -1 : 1

    const anno = inv.dataEmissione.split('-')[0] || new Date().getFullYear().toString()
    const numPadded = inv.numero.replace(/^\d+$/, m => m.padStart(4, '0'))
    let transactionId = `${numPadded}/${anno}`
    if (row.rataTotal > 1) {
      transactionId += ` rata ${row.rataIndex + 1}/${row.rataTotal}`
    }

    const reviewDate = new Date()
    reviewDate.setDate(reviewDate.getDate() + 7)

    return {
      area: targetArea,
      type: isExpense ? 'expense' : 'income',
      account: row.account,
      reference: cls.counterpartName,
      transaction_id: transactionId,
      date_cashflow: row.dateCashflow,
      date_offer: inv.dataEmissione,
      amount: (imponibileRata * signMultiplier).toFixed(2),
      vat: inv.aliquotaIva,
      vat_deduction: row.vatDeduction,
      total: (importoRata * signMultiplier).toFixed(2),
      stage: '0',
      review_date: reviewDate.toISOString().split('T')[0],
      classification: { category: '', source_file: inv.fileName },
    }
  }

  const handleImport = async () => {
    if (!previewRows) return

    const selectedRows = previewRows.filter(r => r.selected)

    // Validate all rows have account
    const missingAccount = selectedRows.filter(r => !r.account.trim())
    if (missingAccount.length > 0) {
      setParseErrors(['Tutte le righe selezionate devono avere un Conto compilato'])
      return
    }

    setIsImporting(true)
    setImportProgress(0)
    setParseErrors([])

    const result: ImportResult = { total: selectedRows.length, success: 0, failed: 0, errors: [] }

    // Separate matched rows (transfer+update) from new rows (create)
    const matchedRows = selectedRows.filter(r => r.matchedRecord)
    const newRows = selectedRows.filter(r => !r.matchedRecord)

    const totalOps = matchedRows.length + newRows.length
    let completedOps = 0

    // Process matched rows: transfer to actual + update fields
    for (const row of matchedRows) {
      try {
        const matched = row.matchedRecord!
        // Transfer to actual
        await recordsApi.transfer(workspaceId, matched.id, { to_area: 'actual' })

        // Build updated transaction_id
        const inv = row.invoice
        const anno = inv.dataEmissione.split('-')[0] || new Date().getFullYear().toString()
        const numPadded = inv.numero.replace(/^\d+$/, m => m.padStart(4, '0'))
        let fatturaTxId = `${numPadded}/${anno}`
        if (row.rataTotal > 1) {
          fatturaTxId += ` rata ${row.rataIndex + 1}/${row.rataTotal}`
        }
        const newTxId = matched.transaction_id
          ? `FATTURA ${fatturaTxId} - ${matched.transaction_id}`
          : `FATTURA ${fatturaTxId}`

        // Update fields on the transferred record
        const updateData: RecordUpdate = {
          transaction_id: newTxId,
          date_cashflow: row.dateCashflow,
          vat_deduction: row.vatDeduction,
          classification: { ...matched.classification, source_file: inv.fileName },
        }
        await recordsApi.update(workspaceId, matched.id, updateData)
        result.success++
      } catch (err) {
        result.failed++
        result.errors.push(`${row.classification.counterpartName} (promozione): ${err instanceof Error ? err.message : 'Errore'}`)
      }
      completedOps++
      setImportProgress(Math.round((completedOps / totalOps) * 100))
    }

    // Process new rows: create in batches
    const records = newRows.map(convertToRecordCreate)
    for (const record of records) {
      try {
        await recordsApi.create(workspaceId, record)
        result.success++
      } catch (err) {
        result.failed++
        result.errors.push(`${record.reference}: ${err instanceof Error ? err.message : 'Errore'}`)
      }
      completedOps++
      setImportProgress(Math.round((completedOps / totalOps) * 100))
    }

    // Save updated supplier mappings
    try {
      const updatedMappings = { ...supplierMappings }
      for (const row of selectedRows) {
        const vat = row.classification.counterpartVat
        if (vat && row.account) {
          updatedMappings[vat] = {
            name: row.classification.counterpartName,
            account: row.account,
            vat_deduction: parseFloat(row.vatDeduction) || 100,
          }
        }
      }

      await workspacesApi.update(workspaceId, {
        settings: {
          ...workspaceSettings,
          sdi_supplier_mappings: updatedMappings,
        },
      })
    } catch {
      // Non-critical: mappings save failure
    }

    setImportResult(result)
    setIsImporting(false)
    onImportComplete()
  }

  const selectedCount = previewRows?.filter(r => r.selected).length || 0
  const allSelected = previewRows ? previewRows.every(r => r.selected) : false
  const duplicateCount = previewRows?.filter(r => r.isDuplicate).length || 0
  const matchedCount = previewRows?.filter(r => r.selected && r.matchedRecord).length || 0
  const hasVatNumber = !!workspaceVatNumber
  const hasAnyExpense = previewRows?.some(r => r.classification.direction === 'out') || false

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importa Fatture SDI (XML)</DialogTitle>
          <DialogDescription>
            Importa fatture elettroniche FatturaPA nel workspace <strong>{workspaceName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-4 overflow-hidden">
          {/* VAT number check */}
          {!hasVatNumber && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Partita IVA non configurata</p>
                <p className="text-sm">
                  Per classificare le fatture come attive o passive, devi prima configurare la Partita IVA del workspace in{' '}
                  <Link to="/settings" className="underline font-medium" onClick={handleClose}>
                    Impostazioni &gt; Workspace
                  </Link>.
                </p>
              </div>
            </div>
          )}

          {/* File drop zone */}
          {hasVatNumber && !importResult && (
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
                dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
                isImporting && 'pointer-events-none opacity-50'
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => !isImporting && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                disabled={isImporting}
              />
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">Trascina qui i file XML FatturaPA</p>
                <p className="text-sm text-muted-foreground">oppure clicca per selezionare (selezione multipla)</p>
              </div>
            </div>
          )}

          {/* Processing spinner */}
          {isProcessing && (
            <div className="flex items-center gap-2 p-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Analisi file e verifica duplicati...</span>
            </div>
          )}

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                {parseErrors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          {previewRows && previewRows.length > 0 && !importResult && (
            <>
              {/* Area selector */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Area destinazione:</span>
                <Select value={targetArea} onValueChange={(v) => setTargetArea(v as Area)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actual">Actual</SelectItem>
                    <SelectItem value="orders">Orders</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="budget">Budget</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground ml-auto">
                  {selectedCount} di {previewRows.length} selezionate
                  {duplicateCount > 0 && <span className="text-orange-500"> ({duplicateCount} duplicati)</span>}
                  {matchedCount > 0 && <span className="text-blue-500"> ({matchedCount} da promuovere)</span>}
                </span>
              </div>

              {/* Scrollable table */}
              <ScrollArea className="flex-1 min-h-0 border rounded-lg">
                <div className="min-w-[900px]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0 z-10">
                      <tr>
                        <th className="p-2 w-8">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={(c) => handleToggleAll(!!c)}
                          />
                        </th>
                        <th className="p-2 text-left w-10">Tipo</th>
                        <th className="p-2 text-left">Riferimento</th>
                        <th className="p-2 text-left w-36">ID Transazione</th>
                        <th className="p-2 text-left w-32">Data Cashflow</th>
                        <th className="p-2 text-right w-24">Imponibile</th>
                        <th className="p-2 text-right w-24">Totale</th>
                        <th className="p-2 text-left w-36">Conto</th>
                        {hasAnyExpense && <th className="p-2 text-left w-20">Detr.%</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row) => {
                        const rata = row.invoice.rate[row.rataIndex]
                        const anno = row.invoice.dataEmissione.split('-')[0] || ''
                        const numPad = row.invoice.numero.replace(/^\d+$/, m => m.padStart(4, '0'))
                        let txId = `${numPad}/${anno}`
                        if (row.rataTotal > 1) txId += ` r${row.rataIndex + 1}/${row.rataTotal}`

                        const isExpense = row.classification.direction === 'out'

                        // Prorate imponibile
                        const totaleFattura = Math.abs(parseFloat(row.invoice.totale))
                        const importoRata = Math.abs(parseFloat(rata.importo))
                        const ratio = totaleFattura > 0 ? importoRata / totaleFattura : 1
                        const imponibileRata = (Math.abs(parseFloat(row.invoice.imponibile)) * ratio)

                        return (
                          <tr
                            key={row.id}
                            className={cn(
                              'border-t hover:bg-muted/50',
                              !row.selected && 'opacity-40'
                            )}
                          >
                            <td className="p-2">
                              <Checkbox
                                checked={row.selected}
                                onCheckedChange={() => handleToggleRow(row.id)}
                              />
                            </td>
                            <td className="p-2">
                              {isExpense ? (
                                <ArrowUpRight className="h-4 w-4 text-red-500" />
                              ) : (
                                <ArrowDownLeft className="h-4 w-4 text-green-500" />
                              )}
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="truncate max-w-[180px]" title={row.classification.counterpartName}>
                                  {row.classification.counterpartName}
                                </span>
                                {row.isNewCounterpart && (
                                  <Badge variant="outline" className="text-xs shrink-0">Nuovo</Badge>
                                )}
                                {row.isDuplicate && (
                                  <Badge className="text-xs shrink-0 bg-orange-500 hover:bg-orange-600">Duplicato</Badge>
                                )}
                                {row.matchedArea && (
                                  <Badge className="text-xs shrink-0 bg-blue-500 hover:bg-blue-600">
                                    Da {row.matchedArea === 'orders' ? 'Orders' : row.matchedArea === 'prospect' ? 'Prospect' : 'Budget'}
                                  </Badge>
                                )}
                              </div>
                              {row.matchedRecord && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  ↳ {row.matchedRecord.reference}
                                  {row.matchedRecord.transaction_id && ` | ${row.matchedRecord.transaction_id}`}
                                  {` | ${parseFloat(row.matchedRecord.amount).toFixed(2)}`}
                                </div>
                              )}
                            </td>
                            <td className="p-2 font-mono text-xs">{txId}</td>
                            <td className="p-2">
                              <Input
                                type="date"
                                value={row.dateCashflow}
                                onChange={(e) => handleDateChange(row.id, e.target.value)}
                                className="h-7 text-xs"
                              />
                            </td>
                            <td className="p-2 text-right font-mono text-xs">
                              {isExpense ? '-' : ''}{imponibileRata.toFixed(2)}
                            </td>
                            <td className="p-2 text-right font-mono text-xs">
                              {isExpense ? '-' : ''}{importoRata.toFixed(2)}
                            </td>
                            <td className="p-2">
                              <Input
                                value={row.account}
                                onChange={(e) => handleAccountChange(row.id, e.target.value)}
                                placeholder="Conto..."
                                className="h-7 text-xs"
                              />
                            </td>
                            {hasAnyExpense && (
                              <td className="p-2">
                                {isExpense ? (
                                  <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={row.vatDeduction}
                                    onChange={(e) => handleVatDeductionChange(row.id, e.target.value)}
                                    className="h-7 text-xs w-16"
                                  />
                                ) : null}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            </>
          )}

          {/* Import progress */}
          {isImporting && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Importazione in corso...</span>
              </div>
              <Progress value={importProgress} />
              <p className="text-xs text-muted-foreground text-center">{importProgress}%</p>
            </div>
          )}

          {/* Import result */}
          {importResult && (
            <div className="space-y-3">
              <div
                className={cn(
                  'flex items-start gap-2 p-3 rounded-lg',
                  importResult.failed === 0
                    ? 'bg-green-500/10 text-green-700'
                    : 'bg-yellow-500/10 text-yellow-700'
                )}
              >
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Importazione completata</p>
                  <p className="text-sm">
                    {importResult.success} record importati con successo
                    {importResult.failed > 0 && `, ${importResult.failed} falliti`}
                  </p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-destructive">
                    Errori ({importResult.errors.length}):
                  </p>
                  <ScrollArea className="h-24 border rounded p-2">
                    <ul className="text-xs space-y-1">
                      {importResult.errors.map((err, i) => (
                        <li key={i} className="text-destructive">{err}</li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {importResult ? (
            <Button onClick={handleClose}>Chiudi</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isImporting}>
                Annulla
              </Button>
              <Button
                onClick={handleImport}
                disabled={!previewRows || selectedCount === 0 || isImporting || !hasVatNumber}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importazione...
                  </>
                ) : (
                  <>Importa {selectedCount} record</>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
