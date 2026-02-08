import { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  type PaginationState,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { ArrowUpDown, MoreHorizontal, Pencil, Trash, ArrowRight, Split, Merge, Calendar, Download, Check, CheckCircle, X, User, LayoutList, WrapText, Eye, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AmountDisplay } from '@/components/common/AmountDisplay'
import { DateDisplay } from '@/components/common/DateDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import type { Record, Area } from '@/types/record'
import type { Sign } from '@/types/workspace'
import { FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'

function parseAmount(amount: string | number): number {
  if (typeof amount === 'number') return amount
  if (!amount) return 0
  const str = amount.toString().trim()

  // If contains comma, assume European format: "1.234,56" -> 1234.56
  if (str.includes(',')) {
    const cleaned = str
      .replace(/\./g, '')  // Remove dots (thousands separator)
      .replace(',', '.')   // Convert comma to dot (decimal separator)
    return parseFloat(cleaned) || 0
  }

  // Otherwise assume US/standard format: "1234.56"
  return parseFloat(str) || 0
}

function getSignFromAmount(amount: string): Sign {
  const num = parseAmount(amount)
  return num >= 0 ? 'in' : 'out'
}

interface RecordGridProps {
  records: Record[]
  isLoading?: boolean
  onSelectRecord?: (record: Record) => void
  onEditRecord?: (record: Record) => void
  onDeleteRecord?: (record: Record) => void
  onTransferRecord?: (record: Record) => void
  onSplitRecord?: (record: Record) => void
  onBulkDelete?: (records: Record[]) => void
  onBulkMerge?: (records: Record[]) => void
  onBulkMoveDates?: (records: Record[]) => void
  onBulkSetDay?: (records: Record[]) => void
  onBulkExport?: (records: Record[]) => void
  onBulkTransfer?: (records: Record[]) => void
  onBulkSetStage?: (records: Record[]) => void
}

export function RecordGrid({
  records,
  isLoading,
  onSelectRecord,
  onEditRecord,
  onDeleteRecord,
  onTransferRecord,
  onSplitRecord,
  onBulkDelete,
  onBulkMerge,
  onBulkMoveDates,
  onBulkSetDay,
  onBulkExport,
  onBulkTransfer,
  onBulkSetStage,
}: RecordGridProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [viewMode, setViewMode] = useState<'compact' | 'extended'>(() => {
    return (localStorage.getItem('forecasto_viewMode') as 'compact' | 'extended') || 'compact'
  })
  const [showProject, setShowProject] = useState(() => {
    const stored = localStorage.getItem('forecasto_showProject')
    return stored !== null ? stored === 'true' : true
  })
  const [showOwner, setShowOwner] = useState(() => {
    const stored = localStorage.getItem('forecasto_showOwner')
    return stored !== null ? stored === 'true' : true
  })
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 100 })
  const { checkPermission } = useWorkspaceStore()
  const { user } = useAuthStore()

  const handleSetViewMode = (mode: 'compact' | 'extended') => {
    setViewMode(mode)
    localStorage.setItem('forecasto_viewMode', mode)
  }
  const handleSetShowProject = (show: boolean) => {
    setShowProject(show)
    localStorage.setItem('forecasto_showProject', String(show))
  }
  const handleSetShowOwner = (show: boolean) => {
    setShowOwner(show)
    localStorage.setItem('forecasto_showOwner', String(show))
  }

  const columnVisibility: VisibilityState = { project_code: showProject, owner: showOwner }
  const textCellClass = viewMode === 'compact' ? 'truncate' : 'whitespace-normal break-words'

  const canEditRecord = (record: Record): boolean => {
    const sign = getSignFromAmount(record.amount)
    return checkPermission(record.area as Area, sign, 'can_edit_others', record.created_by, user?.id)
  }

  const canDeleteRecord = (record: Record): boolean => {
    const sign = getSignFromAmount(record.amount)
    return checkPermission(record.area as Area, sign, 'can_delete_others', record.created_by, user?.id)
  }

  const columns: ColumnDef<Record>[] = useMemo(
    () => [
      {
        id: 'select',
        size: 24,
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Seleziona tutto"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Seleziona riga"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'date_cashflow',
        size: 65,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-1 h-8"
          >
            Data
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => <DateDisplay date={row.original.date_cashflow} />,
      },
      {
        accessorKey: 'account',
        size: 80,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-1 h-8"
          >
            Conto
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => <span className={cn("font-medium block", textCellClass)}>{row.original.account}</span>,
      },
      {
        accessorKey: 'reference',
        size: 120,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-1 h-8"
          >
            Riferimento
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className={cn("block", textCellClass)}>{row.original.reference}</span>
        ),
      },
      {
        accessorKey: 'transaction_id',
        size: 130,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-1 h-8"
          >
            ID Trans.
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className={cn("block font-mono text-xs", textCellClass)}>{row.original.transaction_id || '-'}</span>
        ),
      },
      {
        accessorKey: 'owner',
        size: 60,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-1 h-8"
          >
            Respons.
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className={cn("block", textCellClass)}>{row.original.owner || '-'}</span>
        ),
      },
      {
        accessorKey: 'project_code',
        size: 70,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-1 h-8"
          >
            Progetto
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className={cn("block font-mono text-xs", textCellClass)}>{row.original.project_code || '-'}</span>
        ),
      },
      {
        accessorKey: 'amount',
        size: 95,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="justify-end w-full px-1 h-8"
          >
            Imponibile
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <AmountDisplay amount={row.original.amount} />
          </div>
        ),
      },
      {
        accessorKey: 'total',
        size: 90,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="justify-end w-full px-1 h-8"
          >
            Totale
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <AmountDisplay amount={row.original.total} />
          </div>
        ),
      },
      {
        accessorKey: 'stage',
        size: 12,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-1 h-8"
          >
            Stato
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => {
          const stage = row.original.stage
          if (stage === '1' || stage === 'paid' || stage === 'completed') {
            return <Check className="h-4 w-4 text-green-600" />
          } else if (stage === '0' || stage === 'unpaid' || stage === 'draft') {
            return <X className="h-4 w-4 text-red-500" />
          }
          return <StatusBadge status={stage} area={row.original.area} />
        },
      },
      {
        id: 'other_user',
        size: 28,
        header: '',
        cell: ({ row }) => {
          const record = row.original
          const isOtherUser = record.created_by && user?.id && record.created_by !== user.id
          if (!isOtherUser) return null
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <User className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Creato da un altro utente</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        },
        enableSorting: false,
      },
      {
        id: 'actions',
        size: 6,
        cell: ({ row }) => {
          const record = row.original
          const canEdit = canEditRecord(record)
          const canDelete = canDeleteRecord(record)
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Apri menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Azioni</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => onEditRecord?.(record)}
                  disabled={!canEdit}
                  className={cn(!canEdit && "opacity-50 cursor-not-allowed")}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Modifica
                  {!canEdit && " (non autorizzato)"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onTransferRecord?.(record)}
                  disabled={!canEdit}
                  className={cn(!canEdit && "opacity-50 cursor-not-allowed")}
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Trasferisci
                  {!canEdit && " (non autorizzato)"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onSplitRecord?.(record)}
                  disabled={!canEdit}
                  className={cn(!canEdit && "opacity-50 cursor-not-allowed")}
                >
                  <Split className="mr-2 h-4 w-4" />
                  Dividi in Rate
                  {!canEdit && " (non autorizzato)"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDeleteRecord?.(record)}
                  disabled={!canDelete}
                  className={cn("text-destructive", !canDelete && "opacity-50 cursor-not-allowed")}
                >
                  <Trash className="mr-2 h-4 w-4" />
                  Elimina
                  {!canDelete && " (non autorizzato)"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [onEditRecord, onDeleteRecord, onTransferRecord, onSplitRecord, canEditRecord, canDeleteRecord, user?.id, textCellClass]
  )

  const table = useReactTable({
    data: records,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    state: { sorting, rowSelection, columnVisibility, pagination },
    getRowId: (row) => row.id,
  })

  // Calculate totals
  const totals = useMemo(() => {
    const allAmount = records.reduce((sum, r) => sum + parseAmount(r.amount), 0)
    const allTotal = records.reduce((sum, r) => sum + parseAmount(r.total), 0)

    const selectedRows = table.getFilteredSelectedRowModel().rows
    const selectedAmount = selectedRows.reduce((sum, row) => sum + parseAmount(row.original.amount), 0)
    const selectedTotal = selectedRows.reduce((sum, row) => sum + parseAmount(row.original.total), 0)

    return {
      count: records.length,
      allAmount,
      allTotal,
      selectedCount: selectedRows.length,
      selectedAmount,
      selectedTotal,
    }
  }, [records, table.getFilteredSelectedRowModel().rows])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="Nessun record"
        description="Non ci sono record in questa area. Crea un nuovo record per iniziare."
      />
    )
  }

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedRecords = selectedRows.map(row => row.original)

  const hasSelection = selectedRecords.length > 0

  return (
    <div className="rounded-md border flex flex-col h-full overflow-hidden">
      {/* Bulk Actions Bar - always visible */}
      <div className="border-b bg-muted/30 px-4 py-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium min-w-[100px]", !hasSelection && "text-muted-foreground")}>
            {hasSelection
              ? `${selectedRecords.length} ${selectedRecords.length === 1 ? 'selezionato' : 'selezionati'}`
              : 'Nessuna selezione'
            }
          </span>
          <div className="w-px h-4 bg-border mx-2" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBulkDelete?.(selectedRecords)}
                  disabled={!hasSelection}
                  className={cn("h-8 w-8 p-0", hasSelection && "text-destructive hover:text-destructive")}
                >
                  <Trash className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Elimina</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBulkMerge?.(selectedRecords)}
                  disabled={selectedRecords.length < 2}
                  className="h-8 w-8 p-0"
                >
                  <Merge className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Unisci</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBulkMoveDates?.(selectedRecords)}
                  disabled={!hasSelection}
                  className="h-8 w-8 p-0"
                >
                  <Calendar className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sposta Date</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBulkSetDay?.(selectedRecords)}
                  disabled={!hasSelection}
                  className="h-8 w-8 p-0"
                >
                  <Calendar className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Imposta Giorno</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBulkExport?.(selectedRecords)}
                  disabled={!hasSelection}
                  className="h-8 w-8 p-0"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Esporta CSV</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="w-px h-4 bg-border mx-2" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBulkTransfer?.(selectedRecords)}
                  disabled={!hasSelection}
                  className="h-8 w-8 p-0"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Trasferisci</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBulkSetStage?.(selectedRecords)}
                  disabled={!hasSelection}
                  className="h-8 w-8 p-0"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cambia Stage</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex-1" />
          {/* View controls */}
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === 'compact' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => handleSetViewMode('compact')}
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Vista compatta</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={viewMode === 'extended' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => handleSetViewMode('extended')}
                  >
                    <WrapText className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Vista estesa</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="w-px h-4 bg-border mx-1" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showOwner ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => handleSetShowOwner(!showOwner)}
                  >
                    {showOwner ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    Owner
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{showOwner ? 'Nascondi colonna Responsabile' : 'Mostra colonna Responsabile'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showProject ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => handleSetShowProject(!showProject)}
                  >
                    {showProject ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    Progetto
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{showProject ? 'Nascondi colonna Progetto' : 'Mostra colonna Progetto'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Scrollable Table */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        <Table className="table-fixed font-narrow">
          <TableHeader className="sticky top-0 bg-background z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="whitespace-nowrap px-2"
                    style={{ width: header.column.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(
                  "cursor-pointer",
                  row.getIsSelected() && "bg-primary/10",
                  ['0', 'unpaid', 'draft'].includes(row.original.stage) && new Date(row.original.date_cashflow) <= new Date() && !row.getIsSelected() && "bg-red-50 dark:bg-red-950/30"
                )}
                onClick={() => onSelectRecord?.(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={viewMode === 'compact' ? "py-1 px-2" : "py-2 px-2"}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Footer with totals and pagination - always visible */}
      <div className="border-t bg-muted/50 px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <select
              value={pagination.pageSize}
              onChange={(e) => {
                setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })
              }}
              className="h-7 rounded border bg-background text-xs px-1 cursor-pointer"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={99999}>Tutti</option>
            </select>
            <span className="text-muted-foreground">
              {totals.count} record
            </span>
            {table.getPageCount() > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground px-1">
                  {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-6">
            {totals.selectedCount > 0 && (
              <>
                <div className="text-muted-foreground">
                  Selezionati ({totals.selectedCount}):
                </div>
                <div>
                  <span className="text-muted-foreground mr-1">Imp:</span>
                  <AmountDisplay amount={totals.selectedAmount} className="font-medium" />
                </div>
                <div>
                  <span className="text-muted-foreground mr-1">Tot:</span>
                  <AmountDisplay amount={totals.selectedTotal} className="font-medium" />
                </div>
                <div className="w-px h-4 bg-border" />
              </>
            )}

            <div>
              <span className="text-muted-foreground mr-1">Imponibile:</span>
              <AmountDisplay amount={totals.allAmount} className="font-semibold" />
            </div>
            <div>
              <span className="text-muted-foreground mr-1">Totale:</span>
              <AmountDisplay amount={totals.allTotal} className="font-semibold" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
