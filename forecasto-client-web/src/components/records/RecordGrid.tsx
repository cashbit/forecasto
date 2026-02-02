import { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { ArrowUpDown, MoreHorizontal, Pencil, Trash, ArrowRight } from 'lucide-react'
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

interface RecordGridProps {
  records: Record[]
  isLoading?: boolean
  onSelectRecord?: (record: Record) => void
  onEditRecord?: (record: Record) => void
  onDeleteRecord?: (record: Record) => void
  onTransferRecord?: (record: Record) => void
}

export function RecordGrid({
  records,
  isLoading,
  onSelectRecord,
  onEditRecord,
  onDeleteRecord,
  onTransferRecord,
}: RecordGridProps) {
  const [sorting, setSorting] = useState<SortingState>([])

  const columns: ColumnDef<Record>[] = useMemo(
    () => [
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
        accessorKey: 'stage',
        header: 'Stato',
        cell: ({ row }) => <StatusBadge status={row.original.stage} />,
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
    [onEditRecord, onDeleteRecord, onTransferRecord]
  )

  const table = useReactTable({
    data: records,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  })

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

  return (
    <div className="rounded-md border">
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
              className="cursor-pointer"
              onClick={() => onSelectRecord?.(row.original)}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
