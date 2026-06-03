/**
 * TemplateTablePage — copy this for a "structured rows that benefit
 * from sort + filter + pagination" surface.
 *
 * Use cases: contacts (CRM), policies, claims, deals, transactions —
 * anywhere uniform-shape rows scale into the hundreds.
 *
 * Uses shadcn Data Table (TanStack Table headless). Built-in:
 *   - column sort (click header)
 *   - client-side pagination (shadcn Pagination strip)
 *   - empty state inside the table body
 *   - optional row click handler for navigation
 *
 * For "5–30 visual/logo-y items, find-and-act", copy CatalogPage.tsx.
 * For "text-dominant queue, scan top-to-bottom", copy IndexPage.tsx.
 *
 * Server-side pagination: pass `manualPagination: true` + `pageCount` to
 * useReactTable per TanStack Table docs. The DataTable component
 * accepts these — wire them through `pageSize` for the page size.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'

import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoading } from '@/client/components/PageState'
import { EmptyState } from '@/client/components/EmptyState'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { formatRelative } from '@/client/lib/format-time'

// Replace with your real hook in hooks/useThings.ts
// import { useThings } from '../hooks/useThings'

interface Thing {
  id: string
  name: string
  status: 'active' | 'paused' | 'archived'
  amount: number
  updatedAt: string
}

export function TemplateTablePage() {
  const navigate = useNavigate()

  // const { data, isLoading } = useThings()
  const data = { total: 0, things: [] as Thing[] }
  const isLoading = false

  // Memoise columns so TanStack Table doesn't rebuild row models on
  // every render. Even for 50 rows this matters when filters / sort
  // state change frequently.
  const columns = useMemo<ColumnDef<Thing>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status
          return (
            <Badge
              variant={
                status === 'active' ? 'default' : status === 'paused' ? 'secondary' : 'outline'
              }
            >
              {status}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">${row.original.amount.toLocaleString()}</span>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: 'Updated',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatRelative(row.original.updatedAt)}</span>
        ),
      },
    ],
    []
  )

  return (
    <PageContainer type="catalog">
      <PageHeader
        title="Things"
        subtitle="One-line, user-voice description of what these rows represent and why someone would scan or filter them."
        trailing={
          <Button onClick={() => navigate('/dashboard/things/new')} className="gap-1.5">
            <Plus className="size-4" />
            New thing
          </Button>
        }
      />

      {isLoading && <PageLoading variant="list" count={6} />}

      {!isLoading && data.total === 0 && (
        <EmptyState
          icon={FileText}
          title="No things yet"
          description="Create your first to populate the table."
          action={{
            label: 'Create your first thing',
            onClick: () => navigate('/dashboard/things/new'),
          }}
        />
      )}

      {!isLoading && data.total > 0 && (
        <DataTable
          columns={columns}
          data={data.things}
          pageSize={20}
          onRowClick={(thing) => navigate(`/dashboard/things/${thing.id}`)}
        />
      )}
    </PageContainer>
  )
}

export default TemplateTablePage
