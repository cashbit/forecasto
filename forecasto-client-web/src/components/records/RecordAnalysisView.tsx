import { useMemo, useState } from 'react'
import { LayoutList, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AmountDisplay } from '@/components/common/AmountDisplay'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { RecordListDialog } from '@/components/records/RecordListDialog'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/api/auth'
import { vatRegistryApi } from '@/api/vatRegistry'
import { useQuery } from '@tanstack/react-query'
import { toast } from '@/hooks/useToast'
import { AREA_LABELS } from '@/lib/constants'
import type { Record } from '@/types/record'

type Dimension = 'account' | 'reference' | 'project' | 'yearmonth' | 'year' | 'bank' | 'owner' | 'area' | 'workspace'
type DateField = 'date_cashflow' | 'date_offer' | 'date_document'
type ValueField = 'total' | 'amount'

const DIMENSION_LABELS: Record<Dimension, string> = {
  account: 'Conto',
  reference: 'Riferimento',
  project: 'Progetto',
  yearmonth: 'Anno-Mese',
  year: 'Anno',
  bank: 'Conto Bancario',
  owner: 'Responsabile',
  area: 'Area',
  workspace: 'Workspace (P.IVA)',
}

interface RecordAnalysisViewProps {
  records: Record[]
  isLoading?: boolean
  onToggleAnalysis: () => void
}

function getKey(record: Record, dim: Dimension, dateField: DateField, workspaceMap: Map<string, string>): string {
  switch (dim) {
    case 'account': return record.account || '(nessuno)'
    case 'reference': return record.reference || '(nessuno)'
    case 'project': return record.project_code || '(nessuno)'
    case 'yearmonth': {
      const d = record[dateField]
      return d ? d.slice(0, 7) : '(nessuna data)'
    }
    case 'year': {
      const d = record[dateField]
      return d ? d.slice(0, 4) : '(nessuna data)'
    }
    case 'bank': return record.bank_account_name || record.bank_account_id || '(nessuno)'
    case 'owner': return record.owner || '(nessuno)'
    case 'area': return AREA_LABELS[record.area] || record.area
    case 'workspace': return workspaceMap.get(record.workspace_id) || record.workspace_id
  }
}

interface PivotResult {
  rowKeys: string[]
  colKeys: string[]
  cells: Map<string, Map<string, number>>
  cellRecords: Map<string, Map<string, Record[]>>
  rowTotals: Map<string, number>
  colTotals: Map<string, number>
  grandTotal: number
  rowRecords: Map<string, Record[]>
  colRecords: Map<string, Record[]>
}

function buildPivot(
  records: Record[],
  rowDim: Dimension,
  colDim: Dimension,
  dateField: DateField,
  valueField: ValueField,
  workspaceMap: Map<string, string>,
): PivotResult {
  const cells = new Map<string, Map<string, number>>()
  const cellRecords = new Map<string, Map<string, Record[]>>()
  const rowTotals = new Map<string, number>()
  const colTotals = new Map<string, number>()
  const rowRecords = new Map<string, Record[]>()
  const colRecords = new Map<string, Record[]>()
  const rowKeySet = new Set<string>()
  const colKeySet = new Set<string>()
  let grandTotal = 0

  for (const record of records) {
    const rowKey = getKey(record, rowDim, dateField, workspaceMap)
    const colKey = getKey(record, colDim, dateField, workspaceMap)
    const value = parseFloat(record[valueField] || '0')

    rowKeySet.add(rowKey)
    colKeySet.add(colKey)

    // cells
    if (!cells.has(rowKey)) cells.set(rowKey, new Map())
    const row = cells.get(rowKey)!
    row.set(colKey, (row.get(colKey) ?? 0) + value)

    // cellRecords
    if (!cellRecords.has(rowKey)) cellRecords.set(rowKey, new Map())
    const rrow = cellRecords.get(rowKey)!
    if (!rrow.has(colKey)) rrow.set(colKey, [])
    rrow.get(colKey)!.push(record)

    // rowTotals
    rowTotals.set(rowKey, (rowTotals.get(rowKey) ?? 0) + value)

    // colTotals
    colTotals.set(colKey, (colTotals.get(colKey) ?? 0) + value)

    // rowRecords
    if (!rowRecords.has(rowKey)) rowRecords.set(rowKey, [])
    rowRecords.get(rowKey)!.push(record)

    // colRecords
    if (!colRecords.has(colKey)) colRecords.set(colKey, [])
    colRecords.get(colKey)!.push(record)

    grandTotal += value
  }

  const rowKeys = Array.from(rowKeySet).sort()
  const colKeys = Array.from(colKeySet).sort()

  return { rowKeys, colKeys, cells, cellRecords, rowTotals, colTotals, grandTotal, rowRecords, colRecords }
}

export function RecordAnalysisView({ records, isLoading, onToggleAnalysis }: RecordAnalysisViewProps) {
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const { user, fetchUser } = useAuthStore()
  const { data: vatRegistries = [] } = useQuery({
    queryKey: ['vat-registries'],
    queryFn: vatRegistryApi.list,
  })

  const savedPrefs = user?.ui_preferences?.pivot_analysis as { rowDim?: Dimension; colDim?: Dimension; dateField?: DateField; valueField?: ValueField } | undefined

  const [rowDim, setRowDim] = useState<Dimension>(savedPrefs?.rowDim ?? 'account')
  const [colDim, setColDim] = useState<Dimension>(savedPrefs?.colDim ?? 'yearmonth')
  const [dateField, setDateField] = useState<DateField>(savedPrefs?.dateField ?? 'date_cashflow')
  const [valueField, setValueField] = useState<ValueField>(savedPrefs?.valueField ?? 'total')
  const [isSaving, setIsSaving] = useState(false)

  const [drillTitle, setDrillTitle] = useState('')
  const [drillRecords, setDrillRecords] = useState<Record[]>([])
  const [drillOpen, setDrillOpen] = useState(false)

  async function handleSavePrefs() {
    setIsSaving(true)
    try {
      const currentPrefs = (user?.ui_preferences ?? {}) as Record<string, unknown>
      await authApi.updateProfile({
        ui_preferences: { ...currentPrefs, pivot_analysis: { rowDim, colDim, dateField, valueField } },
      })
      await fetchUser()
      toast({ title: 'Impostazioni memorizzate', variant: 'success' })
    } catch {
      toast({ title: 'Errore durante il salvataggio', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const workspaceMap = useMemo(() => {
    const registryMap = new Map(vatRegistries.map(r => [r.id, r.vat_number]))
    const m = new Map<string, string>()
    for (const ws of workspaces) {
      const vatNum = ws.vat_registry_id ? registryMap.get(ws.vat_registry_id) : undefined
      const label = vatNum ? `${ws.name} (${vatNum})` : ws.name
      m.set(ws.id, label)
    }
    return m
  }, [workspaces, vatRegistries])

  const pivot = useMemo(
    () => buildPivot(records, rowDim, colDim, dateField, valueField, workspaceMap),
    [records, rowDim, colDim, dateField, valueField, workspaceMap],
  )

  function openDrill(title: string, recs: Record[]) {
    setDrillTitle(title)
    setDrillRecords(recs)
    setDrillOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  const dimensions = Object.entries(DIMENSION_LABELS) as [Dimension, string][]

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <span className="text-sm text-muted-foreground">Righe:</span>
        <Select value={rowDim} onValueChange={(v) => setRowDim(v as Dimension)}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder={DIMENSION_LABELS[rowDim]} />
          </SelectTrigger>
          <SelectContent>
            {dimensions.map(([id, label]) => (
              <SelectItem key={id} value={id} className="text-xs">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">Colonne:</span>
        <Select value={colDim} onValueChange={(v) => setColDim(v as Dimension)}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder={DIMENSION_LABELS[colDim]} />
          </SelectTrigger>
          <SelectContent>
            {dimensions.map(([id, label]) => (
              <SelectItem key={id} value={id} className="text-xs">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">Data da:</span>
        <div className="flex gap-1">
          <Button
            variant={dateField === 'date_cashflow' ? 'default' : 'outline'}
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => setDateField('date_cashflow')}
          >
            Cashflow
          </Button>
          <Button
            variant={dateField === 'date_offer' ? 'default' : 'outline'}
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => setDateField('date_offer')}
          >
            Offerta
          </Button>
          <Button
            variant={dateField === 'date_document' ? 'default' : 'outline'}
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => setDateField('date_document')}
          >
            Documento
          </Button>
        </div>

        <span className="text-sm text-muted-foreground">Valori:</span>
        <div className="flex gap-1">
          <Button
            variant={valueField === 'amount' ? 'default' : 'outline'}
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => setValueField('amount')}
          >
            Imponibile
          </Button>
          <Button
            variant={valueField === 'total' ? 'default' : 'outline'}
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => setValueField('total')}
          >
            Totale
          </Button>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs gap-1"
                onClick={handleSavePrefs}
                disabled={isSaving}
              >
                <Save className="h-3.5 w-3.5" />
                Memorizza
              </Button>
            </TooltipTrigger>
            <TooltipContent>Memorizza queste impostazioni nel profilo</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex-1" />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs gap-1"
                onClick={onToggleAnalysis}
              >
                <LayoutList className="h-3.5 w-3.5" />
                Lista voci
              </Button>
            </TooltipTrigger>
            <TooltipContent>Torna alla vista lista</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Pivot Table */}
      <div className="flex-1 overflow-auto min-h-0 border rounded-md">
        {pivot.rowKeys.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nessun dato disponibile</div>
        ) : (
          <table className="text-xs border-collapse w-max min-w-full">
            <thead className="sticky top-0 z-20 bg-background">
              <tr>
                {/* corner cell */}
                <th className="sticky left-0 z-30 bg-muted px-3 py-2 border-b border-r text-left font-medium text-muted-foreground min-w-[160px]">
                  {DIMENSION_LABELS[rowDim]} / {DIMENSION_LABELS[colDim]}
                </th>
                {pivot.colKeys.map((colKey) => (
                  <th
                    key={colKey}
                    className="px-3 py-2 border-b border-r text-right font-medium text-muted-foreground whitespace-nowrap bg-muted cursor-pointer hover:bg-muted/70"
                    onClick={() => openDrill(
                      `${DIMENSION_LABELS[colDim]}: ${colKey}`,
                      pivot.colRecords.get(colKey) ?? [],
                    )}
                  >
                    {colKey}
                  </th>
                ))}
                {/* Totale colonna header */}
                <th className="px-3 py-2 border-b text-right font-semibold bg-muted whitespace-nowrap min-w-[100px]">
                  Totale
                </th>
              </tr>
            </thead>
            <tbody>
              {pivot.rowKeys.map((rowKey) => (
                <tr key={rowKey} className="hover:bg-muted/30">
                  {/* Row label — sticky */}
                  <td
                    className="sticky left-0 z-10 bg-background px-3 py-1.5 border-b border-r font-medium whitespace-nowrap cursor-pointer hover:bg-muted/50"
                    onClick={() => openDrill(
                      `${DIMENSION_LABELS[rowDim]}: ${rowKey}`,
                      pivot.rowRecords.get(rowKey) ?? [],
                    )}
                  >
                    {rowKey}
                  </td>
                  {pivot.colKeys.map((colKey) => {
                    const value = pivot.cells.get(rowKey)?.get(colKey) ?? 0
                    return (
                      <td
                        key={colKey}
                        className="px-3 py-1.5 border-b border-r text-right whitespace-nowrap cursor-pointer hover:bg-muted/50"
                        onDoubleClick={() => {
                          const recs = pivot.cellRecords.get(rowKey)?.get(colKey) ?? []
                          if (recs.length > 0) {
                            openDrill(`${rowKey} × ${colKey}`, recs)
                          }
                        }}
                      >
                        {value !== 0 ? <AmountDisplay amount={value} /> : <span className="text-muted-foreground/40">—</span>}
                      </td>
                    )
                  })}
                  {/* Row total */}
                  <td className="px-3 py-1.5 border-b text-right font-semibold whitespace-nowrap bg-muted/20">
                    <AmountDisplay amount={pivot.rowTotals.get(rowKey) ?? 0} />
                  </td>
                </tr>
              ))}
              {/* Col totals row */}
              <tr className="bg-muted font-semibold sticky bottom-0 z-10">
                <td className="sticky left-0 z-20 bg-muted px-3 py-1.5 border-t border-r">Totale</td>
                {pivot.colKeys.map((colKey) => (
                  <td
                    key={colKey}
                    className="px-3 py-1.5 border-t border-r text-right whitespace-nowrap cursor-pointer hover:bg-muted/80"
                    onClick={() => openDrill(
                      `${DIMENSION_LABELS[colDim]}: ${colKey}`,
                      pivot.colRecords.get(colKey) ?? [],
                    )}
                  >
                    <AmountDisplay amount={pivot.colTotals.get(colKey) ?? 0} />
                  </td>
                ))}
                <td className="px-3 py-1.5 border-t text-right whitespace-nowrap bg-muted">
                  <AmountDisplay amount={pivot.grandTotal} />
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <RecordListDialog
        open={drillOpen}
        title={drillTitle}
        records={drillRecords}
        valueField={valueField}
        onClose={() => setDrillOpen(false)}
      />
    </div>
  )
}
