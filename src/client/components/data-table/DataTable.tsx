/**
 * DataTable — reusable data table built on TanStack Table
 *
 * Features: sorting, filtering, pagination, column visibility,
 * row selection with bulk actions, empty state, loading skeleton.
 *
 * @example
 * import { DataTable } from '@/client/components/data-table'
 * import { createColumnHelper } from '@tanstack/react-table'
 *
 * const columnHelper = createColumnHelper<Issue>()
 * const columns = [
 *   columnHelper.accessor('title', { header: 'Title' }),
 *   columnHelper.accessor('status', { header: 'Status' }),
 * ]
 *
 * <DataTable columns={columns} data={issues} searchColumn="title" />
 */
import { useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table'
import { ArrowUpDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface DataTableProps<TData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<TData, any>[]
  data: TData[]
  /** Column ID to use for text search filter */
  searchColumn?: string
  /** Placeholder for search input */
  searchPlaceholder?: string
  /** Show row selection checkboxes */
  selectable?: boolean
  /** Callback when selected rows change */
  onSelectionChange?: (rows: TData[]) => void
  /** Render bulk action buttons when rows are selected */
  bulkActions?: (selectedRows: TData[], clearSelection: () => void) => React.ReactNode
  /** Show column visibility toggle */
  showColumnToggle?: boolean
  /** Show CSV export button */
  showExport?: boolean
  /** Loading state — shows skeleton rows */
  isLoading?: boolean
  /** Empty state message */
  emptyMessage?: string
  /** Rows per page options */
  pageSizeOptions?: number[]
}

export function DataTable<TData>({
  columns,
  data,
  searchColumn,
  searchPlaceholder = 'Search...',
  selectable = false,
  onSelectionChange,
  bulkActions,
  showColumnToggle = true,
  showExport = false,
  isLoading = false,
  emptyMessage = 'No results.',
  pageSizeOptions = [10, 20, 50],
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: selectable,
  })

  const selectedRows = table.getFilteredSelectedRowModel().rows.map((r) => r.original)

  // Notify parent of selection changes
  if (onSelectionChange && selectedRows.length > 0) {
    onSelectionChange(selectedRows)
  }

  const handleExport = () => {
    const headers = table.getVisibleFlatColumns().map((c) => c.id)
    const rows = table.getFilteredRowModel().rows.map((row) =>
      headers.map((h) => {
        const val = row.getValue(h)
        return typeof val === 'string' ? val : JSON.stringify(val ?? '')
      })
    )
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'export.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      {/* Toolbar: search + column toggle + export */}
      <div className="flex items-center gap-2">
        {searchColumn && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ''}
              onChange={(e) => table.getColumn(searchColumn)?.setFilterValue(e.target.value)}
              className="pl-8"
            />
          </div>
        )}
        <div className="flex-1" />
        {showExport && (
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
            <Download className="size-3.5" />
            Export
          </Button>
        )}
        {showColumnToggle && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <SlidersHorizontal className="size-3.5" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table.getAllColumns().filter((c) => c.getCanHide()).map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {column.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Bulk actions bar */}
      {selectable && selectedRows.length > 0 && bulkActions && (
        <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{selectedRows.length} selected</span>
          <div className="flex-1" />
          {bulkActions(selectedRows, () => setRowSelection({}))}
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      'px-3 py-2 text-left text-xs font-medium text-muted-foreground',
                      header.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground transition-colors'
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <ArrowUpDown className="size-3 text-muted-foreground/50" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              // Skeleton rows
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {columns.map((_, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={cn('border-b hover:bg-muted/50 transition-colors', row.getIsSelected() && 'bg-primary/5')}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 text-sm">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} row(s)
          {selectable && selectedRows.length > 0 && ` · ${selectedRows.length} selected`}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>{size} / page</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
