import { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { ArrowUpDown, MoreHorizontal, Pencil, Trash, ArrowRight, Split, Merge, Calendar, Download, CheckCircle } from 'lucide-react'
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
import { AmountDisplay } from '@/components/common/AmountDisplay'
import { DateDisplay } from '@/components/common/DateDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import type { Record } from '@/types/record'
import { FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'

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

  const columns: ColumnDef<Record>[] = useMemo(
    () => [
      {
        id: 'select',
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
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Data
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => <DateDisplay date={row.original.date_cashflow} />,
      },
      {
        accessorKey: 'account',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Conto
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => <span className="font-medium">{row.original.account}</span>,
      },
      {
        accessorKey: 'reference',
        header: 'Riferimento',
        cell: ({ row }) => (
          <span className="truncate max-w-[200px] block">{row.original.reference}</span>
        ),
      },
      {
        accessorKey: 'transaction_id',
        header: 'ID Transazione',
        cell: ({ row }) => (
          <span className="truncate max-w-[120px] block font-mono text-xs">{row.original.transaction_id || '-'}</span>
        ),
      },
      {
        accessorKey: 'owner',
        header: 'Responsabile',
        cell: ({ row }) => (
          <span className="truncate max-w-[120px] block">{row.original.owner || '-'}</span>
        ),
      },
      {
        accessorKey: 'project_code',
        header: 'Progetto',
        cell: ({ row }) => (
          <span className="truncate max-w-[100px] block font-mono text-xs">{row.original.project_code || '-'}</span>
        ),
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="justify-end w-full"
          >
            Imponibile
            <ArrowUpDown className="ml-2 h-4 w-4" />
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
        header: () => <div className="text-right">Totale</div>,
        cell: ({ row }) => (
          <div className="text-right">
            <AmountDisplay amount={row.original.total} />
          </div>
        ),
      },
      {
        accessorKey: 'stage',
        header: 'Stato',
        cell: ({ row }) => <StatusBadge status={row.original.stage} area={row.original.area} />,
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const record = row.original
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
                <DropdownMenuItem onClick={() => onEditRecord?.(record)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Modifica
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onTransferRecord?.(record)}>
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Trasferisci
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSplitRecord?.(record)}>
                  <Split className="mr-2 h-4 w-4" />
                  Dividi in Rate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDeleteRecord?.(record)}
                  className="text-destructive"
                >
                  <Trash className="mr-2 h-4 w-4" />
                  Elimina
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [onEditRecord, onDeleteRecord, onTransferRecord, onSplitRecord]
  )

  const table = useReactTable({
    data: records,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    state: { sorting, rowSelection },
    getRowId: (row) => row.id,
  })

  // Calculate totals
  const totals = useMemo(() => {
    const allAmount = records.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0)
    const allTotal = records.reduce((sum, r) => sum + parseFloat(r.total || '0'), 0)

    const selectedRows = table.getFilteredSelectedRowModel().rows
    const selectedAmount = selectedRows.reduce((sum, row) => sum + parseFloat(row.original.amount || '0'), 0)
    const selectedTotal = selectedRows.reduce((sum, row) => sum + parseFloat(row.original.total || '0'), 0)

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
    <div className="rounded-md border">
      {/* Bulk Actions Bar */}
      <div className="border-b bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium min-w-[100px]", !hasSelection && "text-muted-foreground")}>
            {hasSelection
              ? `${selectedRecords.length} ${selectedRecords.length === 1 ? 'selezionato' : 'selezionati'}`
              : 'Nessuna selezione'
            }
          </span>
          <div className="w-px h-4 bg-border mx-2" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onBulkDelete?.(selectedRecords)}
            disabled={!hasSelection}
            className={cn(hasSelection && "text-destructive hover:text-destructive")}
          >
            <Trash className="mr-1 h-3 w-3" />
            Elimina
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onBulkMerge?.(selectedRecords)}
            disabled={selectedRecords.length < 2}
          >
            <Merge className="mr-1 h-3 w-3" />
            Unisci
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onBulkMoveDates?.(selectedRecords)}
            disabled={!hasSelection}
          >
            <Calendar className="mr-1 h-3 w-3" />
            Sposta Date
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onBulkSetDay?.(selectedRecords)}
            disabled={!hasSelection}
          >
            <Calendar className="mr-1 h-3 w-3" />
            Imposta Giorno
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onBulkExport?.(selectedRecords)}
            disabled={!hasSelection}
          >
            <Download className="mr-1 h-3 w-3" />
            Esporta CSV
          </Button>
          <div className="w-px h-4 bg-border mx-2" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onBulkTransfer?.(selectedRecords)}
            disabled={!hasSelection}
          >
            <ArrowRight className="mr-1 h-3 w-3" />
            Trasferisci
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onBulkSetStage?.(selectedRecords)}
            disabled={!hasSelection}
          >
            <CheckCircle className="mr-1 h-3 w-3" />
            Cambia Stage
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => table.toggleAllRowsSelected(false)}
            disabled={!hasSelection}
          >
            Deseleziona
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
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
                <TableCell key={cell.id} className="py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Footer with totals */}
      <div className="border-t bg-muted/50 px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            {totals.count} {totals.count === 1 ? 'record' : 'record'}
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
