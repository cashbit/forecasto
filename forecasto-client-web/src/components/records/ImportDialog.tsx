import { useState, useRef, useCallback } from 'react'
import { Upload, FileJson, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import type { ImportRecord, ImportResult } from '@/types/import'
import { LEGACY_TYPE_TO_AREA } from '@/types/import'
import type { RecordCreate, Area } from '@/types/record'
import { recordsApi } from '@/api/records'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  workspaceName: string
  onImportComplete: () => void
}

export function ImportDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceName,
  onImportComplete,
}: ImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsedRecords, setParsedRecords] = useState<ImportRecord[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const resetState = () => {
    setSelectedFile(null)
    setParsedRecords(null)
    setParseError(null)
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

  const parseFile = async (file: File) => {
    setSelectedFile(file)
    setParseError(null)
    setParsedRecords(null)
    setImportResult(null)

    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (!Array.isArray(data)) {
        throw new Error('Il file deve contenere un array di record')
      }

      // Validate structure
      const records: ImportRecord[] = data.map((item, index) => {
        if (!item.type || !item.account || !item.reference || !item.date_cashflow || !item.amount || !item.total) {
          throw new Error(`Record ${index + 1}: campi obbligatori mancanti (type, account, reference, date_cashflow, amount, total)`)
        }
        if (!['0', '1', '2', '3'].includes(item.type)) {
          throw new Error(`Record ${index + 1}: type deve essere "0" (actual), "1" (orders), "2" (prospect), o "3" (budget)`)
        }
        return item as ImportRecord
      })

      setParsedRecords(records)
    } catch (error) {
      if (error instanceof SyntaxError) {
        setParseError('Il file non contiene JSON valido')
      } else if (error instanceof Error) {
        setParseError(error.message)
      } else {
        setParseError('Errore durante la lettura del file')
      }
    }
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

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        parseFile(file)
      } else {
        setParseError('Seleziona un file JSON')
      }
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      parseFile(e.target.files[0])
    }
  }

  const convertToRecordCreate = (item: ImportRecord): RecordCreate => {
    const area: Area = LEGACY_TYPE_TO_AREA[item.type] || 'actual'

    return {
      area,
      type: parseFloat(item.amount) >= 0 ? 'income' : 'expense',
      account: item.account,
      reference: item.reference,
      note: item.note || undefined,
      date_cashflow: item.date_cashflow,
      date_offer: item.date_offer || item.date_cashflow,
      owner: item.owner || undefined,
      amount: item.amount,
      vat: item.vat || '22',
      vat_deduction: item.vat_deduction || '100',
      total: item.total,
      stage: item.stage || '0',
      nextaction: item.nextaction || undefined,
      transaction_id: item.transaction_id || `import-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      project_code: item.project_code || undefined,
      review_date: item.review_date || (() => {
        const d = new Date()
        d.setDate(d.getDate() + 7)
        return d.toISOString().split('T')[0]
      })(),
    }
  }

  const handleImport = async () => {
    if (!parsedRecords || parsedRecords.length === 0) return

    setIsImporting(true)
    setImportProgress(0)

    const result: ImportResult = {
      total: parsedRecords.length,
      success: 0,
      failed: 0,
      errors: [],
      byArea: {
        actual: 0,
        orders: 0,
        prospect: 0,
        budget: 0,
      },
    }

    // Import in batches for better performance
    const batchSize = 10
    const batches: RecordCreate[][] = []

    for (let i = 0; i < parsedRecords.length; i += batchSize) {
      const batchRecords = parsedRecords.slice(i, i + batchSize).map(convertToRecordCreate)
      batches.push(batchRecords)
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]

      try {
        await recordsApi.bulkCreate(workspaceId, batch)
        result.success += batch.length
        for (const rec of batch) {
          result.byArea[rec.area]++
        }
      } catch (error) {
        // Fall back to individual creates
        for (const record of batch) {
          try {
            await recordsApi.create(workspaceId, record)
            result.success++
            result.byArea[record.area]++
          } catch (err) {
            result.failed++
            const errMsg = err instanceof Error ? err.message : 'Errore sconosciuto'
            result.errors.push(`${record.reference}: ${errMsg}`)
          }
        }
      }

      setImportProgress(Math.round(((batchIndex + 1) / batches.length) * 100))
    }

    setImportResult(result)
    setIsImporting(false)
    onImportComplete()
  }

  const getSummary = () => {
    if (!parsedRecords) return null

    const summary = {
      actual: 0,
      orders: 0,
      prospect: 0,
      budget: 0,
    }

    for (const record of parsedRecords) {
      const area = LEGACY_TYPE_TO_AREA[record.type]
      if (area) {
        summary[area as keyof typeof summary]++
      }
    }

    return summary
  }

  const summary = getSummary()

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importa Record</DialogTitle>
          <DialogDescription>
            Importa record da file JSON nel workspace <strong>{workspaceName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File drop zone */}
          {!importResult && (
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
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
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileSelect}
                disabled={isImporting}
              />
              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <FileJson className="h-10 w-10 text-primary" />
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <p className="font-medium">Trascina qui il file JSON</p>
                  <p className="text-sm text-muted-foreground">
                    oppure clicca per selezionare
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Parse error */}
          {parseError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{parseError}</p>
            </div>
          )}

          {/* Parsed summary */}
          {parsedRecords && !importResult && (
            <div className="p-4 rounded-lg bg-muted space-y-2">
              <p className="font-medium">Anteprima importazione</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Record totali:</div>
                <div className="font-medium">{parsedRecords.length}</div>
                {summary && (
                  <>
                    <div>Budget:</div>
                    <div>{summary.budget}</div>
                    <div>Prospect:</div>
                    <div>{summary.prospect}</div>
                    <div>Orders:</div>
                    <div>{summary.orders}</div>
                    <div>Actual:</div>
                    <div>{summary.actual}</div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Import progress */}
          {isImporting && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Importazione in corso...</span>
              </div>
              <Progress value={importProgress} />
              <p className="text-xs text-muted-foreground text-center">
                {importProgress}%
              </p>
            </div>
          )}

          {/* Import result */}
          {importResult && (
            <div className="space-y-3">
              <div className={cn(
                'flex items-start gap-2 p-3 rounded-lg',
                importResult.failed === 0 ? 'bg-green-500/10 text-green-700' : 'bg-yellow-500/10 text-yellow-700'
              )}>
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">
                    Importazione completata
                  </p>
                  <p className="text-sm">
                    {importResult.success} record importati con successo
                    {importResult.failed > 0 && `, ${importResult.failed} falliti`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm p-3 bg-muted rounded-lg">
                <div>Budget:</div>
                <div className="font-medium">{importResult.byArea.budget}</div>
                <div>Prospect:</div>
                <div className="font-medium">{importResult.byArea.prospect}</div>
                <div>Orders:</div>
                <div className="font-medium">{importResult.byArea.orders}</div>
                <div>Actual:</div>
                <div className="font-medium">{importResult.byArea.actual}</div>
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
            <Button onClick={handleClose}>
              Chiudi
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isImporting}>
                Annulla
              </Button>
              <Button
                onClick={handleImport}
                disabled={!parsedRecords || parsedRecords.length === 0 || isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importazione...
                  </>
                ) : (
                  <>Importa {parsedRecords?.length || 0} record</>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
