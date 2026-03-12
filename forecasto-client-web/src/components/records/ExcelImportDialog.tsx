import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import {
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ChevronLeft,
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
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { RecordCreate, Area } from '@/types/record'
import { recordsApi } from '@/api/records'
import { workspacesApi } from '@/api/workspaces'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { canImport } from '@/lib/permissions'
import type { WorkspaceSettings, ExcelColumnMappingEntry } from '@/types/workspace'

// ─── Field definitions ────────────────────────────────────────────────────────

type ForecastoFieldKey =
  | 'date_cashflow'
  | 'date_offer'
  | 'reference'
  | 'account'
  | 'note'
  | 'owner'
  | 'type_label'
  | 'project_code'
  | 'transaction_id'
  | 'total'
  | 'amount'
  | 'vat_percent'
  | 'vat_amount'
  | 'amount_in'
  | 'amount_out'
  | 'stage'

interface FieldDef {
  key: ForecastoFieldKey
  label: string
  required: boolean
  hint?: string
}

const FORECASTO_FIELDS: FieldDef[] = [
  { key: 'date_cashflow', label: 'Data Cashflow', required: true },
  { key: 'reference', label: 'Riferimento / Causale', required: true },
  { key: 'amount', label: 'Imponibile', required: false, hint: 'Importo netto senza IVA' },
  { key: 'total', label: 'Totale (con IVA)', required: false },
  { key: 'vat_amount', label: 'IVA (importo)', required: false },
  { key: 'vat_percent', label: 'IVA %', required: false, hint: 'Es: 22' },
  { key: 'amount_in', label: 'Entrate', required: false, hint: 'Modalità due colonne' },
  { key: 'amount_out', label: 'Uscite', required: false, hint: 'Modalità due colonne' },
  { key: 'account', label: 'Conto / Controparte', required: false },
  { key: 'date_offer', label: 'Data Offerta', required: false },
  { key: 'type_label', label: 'Tipo / Categoria', required: false },
  { key: 'note', label: 'Note', required: false },
  { key: 'owner', label: 'Responsabile', required: false },
  { key: 'project_code', label: 'Codice Progetto', required: false },
  { key: 'transaction_id', label: 'ID Transazione', required: false },
  { key: 'stage', label: 'Stato', required: false, hint: '0=da fare, 1=fatto' },
]

const FIELD_KEYWORDS: Record<ForecastoFieldKey, string[]> = {
  date_cashflow: ['data', 'date', 'cashflow', 'oper', 'valuta', 'movimento', 'mov'],
  reference: ['riferimento', 'causale', 'descrizione', 'description', 'causale'],
  account: ['conto', 'controparte', 'beneficiario', 'fornitore', 'cliente', 'ragione', 'denominaz'],
  total: ['totale', 'total'],
  amount: ['imponibile', 'netto', 'net', 'subtotal'],
  vat_amount: ['iva', 'vat', 'imposta', 'tassa'],
  vat_percent: ['iva%', 'vat%', 'aliquota'],
  amount_in: ['entrat', 'avere', 'credito', 'accredito', 'accred', 'dare'],
  amount_out: ['uscit', 'debito', 'addebito', 'addebit'],
  date_offer: ['offerta', 'documento', 'fattura', 'emiss'],
  note: ['note', 'notes', 'commento', 'comment', 'annotaz'],
  owner: ['responsabile', 'owner', 'assegnato', 'gestore'],
  project_code: ['progetto', 'project', 'codice proj'],
  transaction_id: ['transaz', 'id trans'],
  type_label: ['tipo', 'type', 'categoria', 'category'],
  stage: ['stato', 'status', 'stage'],
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function suggestField(colName: string): ForecastoFieldKey | '' {
  const normalized = colName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [field, keywords] of Object.entries(FIELD_KEYWORDS) as [ForecastoFieldKey, string[]][]) {
    if (keywords.some(kw => normalized.includes(kw))) {
      return field
    }
  }
  return ''
}

function fingerprintColumns(headers: string[]): string {
  return JSON.stringify([...headers].sort())
}

function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null

  // Excel serial number (from raw: true mode)
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value)
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
    }
    return null
  }

  const str = String(value).trim()
  if (!str) return null

  // ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/)
  if (dmatch) {
    const [, d, m, y] = dmatch
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return null
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return value

  const str = String(value).trim().replace(/\s/g, '')
  if (!str) return null

  // Italian format: 1.234,56
  if (/^-?[\d.]+,\d+$/.test(str)) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.'))
  }

  // English format: 1,234.56
  if (/^-?[\d,]+\.\d+$/.test(str)) {
    return parseFloat(str.replace(/,/g, ''))
  }

  const n = parseFloat(str.replace(',', '.'))
  return isNaN(n) ? null : n
}

function genTransactionId(): string {
  return `xl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const AREA_LABELS: Record<Area, string> = {
  budget: 'Budget',
  prospect: 'Prospect',
  orders: 'Ordini',
  actual: 'Actual',
}

// ─── Row builder ───────────────────────────────────────────────────────────────

interface RowBuildResult {
  record?: RecordCreate
  errors: string[]
}

function buildRecord(
  rawRow: unknown[],
  headers: string[],
  columnToField: Record<string, ForecastoFieldKey | ''>,
  fieldDefaults: Record<string, string>,
  area: Area,
  amountMode: 'single' | 'two_columns',
  rowNum: number,
): RowBuildResult {
  const errors: string[] = []

  // Helper: get value from mapped column or default
  const getVal = (field: ForecastoFieldKey): string => {
    const col = Object.entries(columnToField).find(([, f]) => f === field)?.[0]
    const cellVal = col !== undefined ? String(rawRow[headers.indexOf(col)] ?? '') : ''
    return cellVal.trim() || fieldDefaults[field] || ''
  }

  // ── Date Cashflow
  const rawDateCf = getVal('date_cashflow')
  const dateCashflow = parseDate(rawDateCf)
  if (!dateCashflow) {
    errors.push(`Riga ${rowNum}: data cashflow non valida ("${rawDateCf}")`)
  }

  // ── Reference
  const reference = getVal('reference')
  if (!reference) errors.push(`Riga ${rowNum}: riferimento/causale mancante`)

  // ── Amount / Total
  let signedAmount: number | null = null
  let signedTotal: number | null = null
  let vatPercent = 0

  if (amountMode === 'two_columns') {
    const rawIn = getVal('amount_in')
    const rawOut = getVal('amount_out')
    const inVal = rawIn ? parseNumber(rawIn) : null
    const outVal = rawOut ? parseNumber(rawOut) : null

    if (inVal === null && outVal === null) {
      errors.push(`Riga ${rowNum}: nessun importo entrata o uscita`)
    } else {
      const sign = (inVal !== null && inVal !== 0) ? 1 : -1
      signedAmount = sign * Math.abs((inVal ?? 0) - (outVal ?? 0))
    }
  } else {
    // Single column: map 'amount' or 'total' or 'amount_in'
    const rawAmount = getVal('amount')
    const rawTotal = getVal('total')

    if (rawAmount) {
      const n = parseNumber(rawAmount)
      if (n === null) errors.push(`Riga ${rowNum}: importo non valido ("${rawAmount}")`)
      else signedAmount = n
    } else if (rawTotal) {
      const n = parseNumber(rawTotal)
      if (n === null) errors.push(`Riga ${rowNum}: totale non valido ("${rawTotal}")`)
      else signedTotal = n
    } else {
      errors.push(`Riga ${rowNum}: importo mancante`)
    }
  }

  // ── VAT
  const rawVatPct = getVal('vat_percent')
  const rawVatAmt = getVal('vat_amount')
  vatPercent = rawVatPct ? (parseNumber(rawVatPct) ?? 0) : 0

  if (errors.length > 0) return { errors }

  // ── Compute amount / total / vat
  let finalAmount: number
  let finalTotal: number
  let finalVatPct: number = vatPercent

  if (signedAmount !== null && signedTotal !== null) {
    // both provided
    finalAmount = signedAmount
    finalTotal = signedTotal
    finalVatPct = finalAmount !== 0 ? Math.round(((finalTotal - finalAmount) / finalAmount) * 100) : 0
  } else if (signedAmount !== null) {
    if (rawVatAmt) {
      const vatAmt = parseNumber(rawVatAmt) ?? 0
      finalAmount = signedAmount
      finalTotal = signedAmount + (Math.sign(signedAmount) * Math.abs(vatAmt))
      finalVatPct = finalAmount !== 0 ? Math.round((Math.abs(vatAmt) / Math.abs(finalAmount)) * 100) : 0
    } else {
      finalAmount = signedAmount
      finalTotal = finalAmount * (1 + vatPercent / 100)
    }
  } else if (signedTotal !== null) {
    if (rawVatAmt) {
      const vatAmt = parseNumber(rawVatAmt) ?? 0
      finalTotal = signedTotal
      finalAmount = signedTotal - (Math.sign(signedTotal) * Math.abs(vatAmt))
      finalVatPct = finalAmount !== 0 ? Math.round((Math.abs(vatAmt) / Math.abs(finalAmount)) * 100) : 0
    } else if (vatPercent > 0) {
      finalTotal = signedTotal
      finalAmount = finalTotal / (1 + vatPercent / 100)
    } else {
      finalTotal = signedTotal
      finalAmount = signedTotal
    }
  } else {
    return { errors: [`Riga ${rowNum}: impossibile calcolare importo`] }
  }

  // ── Optional fields
  const rawDateOffer = getVal('date_offer')
  const dateOffer = parseDate(rawDateOffer) ?? dateCashflow!
  const account = getVal('account') || reference
  const note = getVal('note') || undefined
  const owner = getVal('owner') || undefined
  const typeLabel = getVal('type_label') || 'Importazione Excel'
  const projectCode = getVal('project_code') || undefined
  const txId = getVal('transaction_id') || genTransactionId()
  const rawStage = getVal('stage')
  const stage = rawStage === '1' || rawStage.toLowerCase() === 'pagato' || rawStage.toLowerCase() === 'fatto' ? '1' : '0'

  const record: RecordCreate = {
    area,
    type: typeLabel,
    account,
    reference,
    note,
    date_cashflow: dateCashflow!,
    date_offer: dateOffer,
    owner,
    amount: finalAmount.toFixed(2),
    vat: String(finalVatPct),
    vat_deduction: '100',
    total: finalTotal.toFixed(2),
    stage,
    transaction_id: txId,
    project_code: projectCode,
    review_date: addDays(dateCashflow!, -7),
  }

  return { record, errors: [] }
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ExcelImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  workspaceName: string
  workspaceSettings: WorkspaceSettings
  currentArea: Area
  onImportComplete: () => void
}

interface ImportResult {
  total: number
  success: number
  failed: number
  errors: string[]
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ExcelImportDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceName,
  workspaceSettings,
  currentArea,
  onImportComplete,
}: ExcelImportDialogProps) {
  const { workspaces } = useWorkspaceStore()
  const currentMember = workspaces.find(w => w.id === workspaceId)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step: 1=file, 2=mapping, 3=import, 4=result
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [dragActive, setDragActive] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [allRows, setAllRows] = useState<unknown[][]>([])
  const [amountMode, setAmountMode] = useState<'single' | 'two_columns'>('single')
  const [targetArea, setTargetArea] = useState<Area>(currentArea)
  // columnToField: excel column name → forecasto field
  const [columnToField, setColumnToField] = useState<Record<string, ForecastoFieldKey | ''>>({})
  const [fieldDefaults, setFieldDefaults] = useState<Record<string, string>>({})
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [validRowCount, setValidRowCount] = useState(0)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const previewRows = allRows.slice(0, 50)

  // ── Reset

  const resetState = () => {
    setStep(1)
    setDragActive(false)
    setFile(null)
    setParseError(null)
    setHeaders([])
    setAllRows([])
    setAmountMode('single')
    setTargetArea(currentArea)
    setColumnToField({})
    setFieldDefaults({})
    setValidationErrors([])
    setValidRowCount(0)
    setIsImporting(false)
    setImportProgress(0)
    setImportResult(null)
  }

  const handleClose = () => {
    if (!isImporting) {
      resetState()
      onOpenChange(false)
    }
  }

  // ── Load saved mapping from workspace settings

  const loadSavedMapping = useCallback(
    (hdrs: string[]) => {
      const fp = fingerprintColumns(hdrs)
      const saved = (workspaceSettings.excel_column_mappings ?? []).find(
        m => m.columns_fingerprint === fp,
      )
      if (saved) {
        setAmountMode(saved.amount_mode)
        setColumnToField(saved.mapping as Record<string, ForecastoFieldKey | ''>)
        setFieldDefaults(saved.defaults ?? {})
      } else {
        // Auto-suggest
        const suggested: Record<string, ForecastoFieldKey | ''> = {}
        const assigned = new Set<ForecastoFieldKey>()
        for (const col of hdrs) {
          const f = suggestField(col)
          if (f && !assigned.has(f)) {
            suggested[col] = f
            assigned.add(f)
          } else {
            suggested[col] = ''
          }
        }
        setColumnToField(suggested)
        setFieldDefaults({})
        // Auto-detect amount mode: if columns suggest in+out
        const hasIn = hdrs.some(h => suggestField(h) === 'amount_in')
        const hasOut = hdrs.some(h => suggestField(h) === 'amount_out')
        if (hasIn && hasOut) setAmountMode('two_columns')
      }
    },
    [workspaceSettings.excel_column_mappings],
  )

  // ── File parsing

  const parseFile = useCallback(
    async (f: File) => {
      setFile(f)
      setParseError(null)

      try {
        const arrayBuffer = await f.arrayBuffer()
        let workbook: XLSX.WorkBook

        if (f.name.toLowerCase().endsWith('.csv')) {
          const text = new TextDecoder().decode(arrayBuffer)
          workbook = XLSX.read(text, { type: 'string' })
        } else {
          workbook = XLSX.read(arrayBuffer, { cellDates: true })
        }

        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]

        // Get raw data as array of arrays
        const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: '',
          raw: true,
        })

        if (!data || data.length < 2) {
          throw new Error('Il file deve contenere almeno una riga di intestazione e una riga di dati')
        }

        const hdrs = (data[0] as unknown[]).map(h => String(h ?? '').trim()).filter(Boolean)
        if (hdrs.length === 0) throw new Error('Nessuna colonna trovata nella prima riga')

        const rows = (data.slice(1) as unknown[][]).filter(row =>
          row.some(cell => cell !== null && cell !== undefined && cell !== ''),
        )

        setHeaders(hdrs)
        setAllRows(rows)
        loadSavedMapping(hdrs)
        setStep(2)
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Errore durante la lettura del file')
      }
    },
    [loadSavedMapping],
  )

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)
      const f = e.dataTransfer.files?.[0]
      if (f) parseFile(f)
    },
    [parseFile],
  )

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) parseFile(f)
  }

  // ── Mapping helpers

  const setColumnField = (col: string, field: ForecastoFieldKey | '') => {
    setColumnToField(prev => {
      // If assigning a field that's already assigned to another column, clear the old one
      const updated: Record<string, ForecastoFieldKey | ''> = { ...prev }
      if (field) {
        for (const [c, f] of Object.entries(updated)) {
          if (f === field && c !== col) updated[c] = ''
        }
      }
      updated[col] = field
      return updated
    })
  }

  const mappedFields = new Set(Object.values(columnToField).filter(Boolean) as ForecastoFieldKey[])
  const unmappedFields = FORECASTO_FIELDS.filter(f => !mappedFields.has(f.key))

  // ── Validation check before step 3

  const validateMapping = (): string | null => {
    if (!columnToField[headers.find(h => columnToField[h] === 'date_cashflow') ?? ''] &&
        !fieldDefaults['date_cashflow']) {
      return 'Mappa il campo "Data Cashflow" a una colonna o imposta un valore di default'
    }
    if (!columnToField[headers.find(h => columnToField[h] === 'reference') ?? ''] &&
        !fieldDefaults['reference']) {
      return 'Mappa il campo "Riferimento / Causale" a una colonna o imposta un valore di default'
    }
    if (amountMode === 'single') {
      const hasAmountCol = headers.some(h => columnToField[h] === 'amount' || columnToField[h] === 'total')
      const hasAmountDefault = fieldDefaults['amount'] || fieldDefaults['total']
      if (!hasAmountCol && !hasAmountDefault) {
        return 'Mappa il campo "Imponibile" o "Totale" a una colonna'
      }
    } else {
      const hasIn = headers.some(h => columnToField[h] === 'amount_in')
      const hasOut = headers.some(h => columnToField[h] === 'amount_out')
      if (!hasIn && !hasOut) {
        return 'Mappa almeno una colonna "Entrate" o "Uscite"'
      }
    }
    return null
  }

  // ── Proceed to validation step

  const handleProceedToValidation = () => {
    const mappingError = validateMapping()
    if (mappingError) {
      setParseError(mappingError)
      return
    }
    setParseError(null)

    // Run validation on all rows
    const errors: string[] = []
    let valid = 0
    for (let i = 0; i < allRows.length; i++) {
      const result = buildRecord(
        allRows[i],
        headers,
        columnToField,
        fieldDefaults,
        targetArea,
        amountMode,
        i + 2,
      )
      if (result.errors.length > 0) {
        errors.push(...result.errors)
      } else {
        valid++
      }
    }
    setValidationErrors(errors)
    setValidRowCount(valid)
    setStep(3)
  }

  // ── Import

  const handleImport = async () => {
    if (!canImport(currentMember)) {
      setParseError('Non hai il permesso di importare record. Contatta l\'amministratore del workspace.')
      return
    }

    setIsImporting(true)
    setImportProgress(0)

    const result: ImportResult = { total: 0, success: 0, failed: 0, errors: [] }
    const records: RecordCreate[] = []

    for (let i = 0; i < allRows.length; i++) {
      const built = buildRecord(allRows[i], headers, columnToField, fieldDefaults, targetArea, amountMode, i + 2)
      if (built.record) records.push(built.record)
    }

    result.total = records.length

    const batchSize = 20
    const batches: RecordCreate[][] = []
    for (let i = 0; i < records.length; i += batchSize) {
      batches.push(records.slice(i, i + batchSize))
    }

    for (let bi = 0; bi < batches.length; bi++) {
      try {
        await recordsApi.bulkCreate(workspaceId, batches[bi])
        result.success += batches[bi].length
      } catch {
        for (const rec of batches[bi]) {
          try {
            await recordsApi.create(workspaceId, rec)
            result.success++
          } catch (err) {
            result.failed++
            result.errors.push(`${rec.reference}: ${err instanceof Error ? err.message : 'Errore'}`)
          }
        }
      }
      setImportProgress(Math.round(((bi + 1) / batches.length) * 100))
    }

    // Save mapping to workspace settings
    try {
      const fp = fingerprintColumns(headers)
      const entry: ExcelColumnMappingEntry = {
        columns_fingerprint: fp,
        mapping: columnToField as Record<string, string>,
        defaults: fieldDefaults,
        amount_mode: amountMode,
        last_used: new Date().toISOString(),
      }
      const existing = (workspaceSettings.excel_column_mappings ?? []).filter(
        m => m.columns_fingerprint !== fp,
      )
      await workspacesApi.update(workspaceId, {
        settings: {
          ...workspaceSettings,
          excel_column_mappings: [entry, ...existing].slice(0, 20),
        },
      })
    } catch {
      // Non-critical: mapping save failure
    }

    setImportResult(result)
    setIsImporting(false)
    setStep(4)
    onImportComplete()
  }

  // ── Render helpers

  const stepLabel = (n: number, label: string) => (
    <span className={cn('text-xs font-medium', step === n ? 'text-primary' : 'text-muted-foreground')}>
      {n}. {label}
    </span>
  )

  const isWide = step === 2

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn('transition-all duration-200 flex flex-col max-h-[80vh]', isWide ? 'max-w-[80vw]' : 'max-w-lg')}>
        <DialogHeader>
          <DialogTitle>Importa da Excel / CSV</DialogTitle>
          <DialogDescription>
            Workspace: <strong>{workspaceName}</strong> — Area:{' '}
            <strong>{AREA_LABELS[targetArea]}</strong>
          </DialogDescription>
          {/* Step indicators */}
          <div className="flex gap-4 pt-1">
            {stepLabel(1, 'File')}
            {stepLabel(2, 'Mappatura')}
            {stepLabel(3, 'Importa')}
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0 pr-1">

        {/* ── STEP 1: File Upload ─────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50',
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                onChange={handleFileSelect}
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet className="h-10 w-10 text-primary" />
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Download className="h-10 w-10 text-muted-foreground" />
                  <p className="font-medium">Trascina qui il file Excel o CSV</p>
                  <p className="text-sm text-muted-foreground">oppure clicca per selezionare</p>
                  <p className="text-xs text-muted-foreground mt-1">.xlsx · .xls · .csv</p>
                </div>
              )}
            </div>
            {parseError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{parseError}</p>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Column Mapping ──────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Area + Amount mode */}
            <div className="flex flex-wrap gap-6 p-3 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <Label className="text-xs">Area di destinazione</Label>
                <Select value={targetArea} onValueChange={v => setTargetArea(v as Area)}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(AREA_LABELS) as [Area, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Modalità importo</Label>
                <RadioGroup
                  value={amountMode}
                  onValueChange={v => setAmountMode(v as 'single' | 'two_columns')}
                  className="flex gap-4 pt-0.5"
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="single" id="mode-single" />
                    <Label htmlFor="mode-single" className="text-xs font-normal cursor-pointer">
                      Colonna singola
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="two_columns" id="mode-two" />
                    <Label htmlFor="mode-two" className="text-xs font-normal cursor-pointer">
                      Due colonne (Entrate / Uscite)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            {/* Mapping table */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Seleziona il campo Forecasto corrispondente a ciascuna colonna del file ({headers.length} colonne, {allRows.length} righe).
              </p>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      {/* Row 1: Forecasto field dropdowns */}
                      <tr className="bg-primary/5">
                        {headers.map(col => (
                          <th key={col} className="p-1.5 border-b border-r last:border-r-0 min-w-[140px]">
                            <Select
                              value={columnToField[col] || '__ignore__'}
                              onValueChange={v => setColumnField(col, v === '__ignore__' ? '' : v as ForecastoFieldKey)}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="-- ignora --" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__ignore__">
                                  <span className="text-muted-foreground">— ignora —</span>
                                </SelectItem>
                                {FORECASTO_FIELDS.map(f => (
                                  <SelectItem
                                    key={f.key}
                                    value={f.key}
                                    disabled={
                                      mappedFields.has(f.key) && columnToField[col] !== f.key
                                    }
                                  >
                                    {f.label}
                                    {f.required && ' *'}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </th>
                        ))}
                      </tr>
                      {/* Row 2: Excel column names */}
                      <tr className="bg-muted/60">
                        {headers.map(col => (
                          <th
                            key={col}
                            className="px-2 py-1 text-left font-semibold border-b border-r last:border-r-0 text-muted-foreground truncate max-w-[140px]"
                            title={col}
                          >
                            {col}
                            {columnToField[col] && (
                              <Badge variant="secondary" className="ml-1 text-[10px] py-0 h-4">
                                ✓
                              </Badge>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-muted/20'}>
                          {headers.map((col, ci) => (
                            <td
                              key={col}
                              className="px-2 py-1 border-b border-r last:border-r-0 truncate max-w-[200px] text-muted-foreground"
                              title={String(row[ci] ?? '')}
                            >
                              {String(row[ci] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {allRows.length > 50 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Mostra le prime 50 righe su {allRows.length} totali.
                </p>
              )}
            </div>

            {/* Defaults section */}
            {unmappedFields.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2">
                  Valori di default per i campi non mappati
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3 bg-muted/30 rounded-lg">
                  {unmappedFields.map(f => (
                    <div key={f.key} className="space-y-0.5">
                      <Label className="text-xs text-muted-foreground">
                        {f.label}
                        {f.required && <span className="text-destructive"> *</span>}
                        {f.hint && <span className="ml-1 text-[10px]">({f.hint})</span>}
                      </Label>
                      <Input
                        className="h-7 text-xs"
                        placeholder="lascia vuoto per omettere"
                        value={fieldDefaults[f.key] ?? ''}
                        onChange={e =>
                          setFieldDefaults(prev => ({ ...prev, [f.key]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {parseError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{parseError}</p>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Validation + Import ─────────────────────────── */}
        {step === 3 && !isImporting && !importResult && (
          <div className="space-y-4">
            <div
              className={cn(
                'p-4 rounded-lg space-y-1',
                validationErrors.length === 0
                  ? 'bg-green-500/10 text-green-700'
                  : 'bg-yellow-500/10 text-yellow-700',
              )}
            >
              <p className="font-medium flex items-center gap-2">
                {validationErrors.length === 0 ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
                {validRowCount} record pronti per l'importazione
              </p>
              {validationErrors.length > 0 && (
                <p className="text-sm">
                  {allRows.length - validRowCount} righe verranno saltate per errori
                </p>
              )}
              <p className="text-sm">
                Area: <strong>{AREA_LABELS[targetArea]}</strong> — Workspace:{' '}
                <strong>{workspaceName}</strong>
              </p>
            </div>

            {validationErrors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-destructive">
                  Errori di validazione ({validationErrors.length}):
                </p>
                <ScrollArea className="h-32 border rounded p-2">
                  <ul className="text-xs space-y-1">
                    {validationErrors.map((err, i) => (
                      <li key={i} className="text-destructive">
                        {err}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        {/* Import progress */}
        {isImporting && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Importazione in corso...</span>
            </div>
            <Progress value={importProgress} />
            <p className="text-xs text-muted-foreground text-center">{importProgress}%</p>
          </div>
        )}

        {/* ── STEP 4: Result ──────────────────────────────────────── */}
        {step === 4 && importResult && (
          <div className="space-y-3">
            <div
              className={cn(
                'flex items-start gap-2 p-3 rounded-lg',
                importResult.failed === 0
                  ? 'bg-green-500/10 text-green-700'
                  : 'bg-yellow-500/10 text-yellow-700',
              )}
            >
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Importazione completata</p>
                <p className="text-sm">
                  {importResult.success} record importati
                  {importResult.failed > 0 && `, ${importResult.failed} falliti`}
                </p>
              </div>
            </div>
            {importResult.errors.length > 0 && (
              <ScrollArea className="h-24 border rounded p-2">
                <ul className="text-xs space-y-1">
                  {importResult.errors.map((err, i) => (
                    <li key={i} className="text-destructive">
                      {err}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </div>
        )}

        </div>

        <DialogFooter>
          {step === 4 || (step === 3 && importResult) ? (
            <Button onClick={handleClose}>Chiudi</Button>
          ) : step === 1 ? (
            <Button variant="outline" onClick={handleClose}>
              Annulla
            </Button>
          ) : step === 2 ? (
            <>
              <Button variant="outline" onClick={() => { setStep(1); setParseError(null) }}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Indietro
              </Button>
              <Button onClick={handleProceedToValidation}>
                Valida
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          ) : step === 3 ? (
            <>
              <Button variant="outline" onClick={() => setStep(2)} disabled={isImporting}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Modifica mappatura
              </Button>
              <Button onClick={handleImport} disabled={validRowCount === 0 || isImporting}>
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importazione...
                  </>
                ) : (
                  <>Importa {validRowCount} record</>
                )}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
