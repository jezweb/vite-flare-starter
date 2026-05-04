/**
 * KanbanDemoPage — exercises the <KanbanBoard> primitive against the
 * generic `entities` API. Uses entities of type `task`, mapping
 * `fields.column` → kanban column and `fields.order` → sort order.
 *
 * The page is feature-flagged off by default (set
 * VITE_FEATURE_KANBAN_DEMO=true to enable). It exists as a working
 * reference implementation — fork-users see the optimistic-update
 * pattern, the column-collapse wiring, and the slot-based card
 * rendering all in one place.
 */
import * as React from 'react'
import { Kanban as KanbanIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoading } from '@/client/components/PageState'
import { EmptyState } from '@/client/components/EmptyState'
import {
  KanbanBoard,
  type KanbanColumn,
  type KanbanCardMove,
} from '@/components/ui/kanban'
import {
  useTaskEntities,
  useMoveTask,
  useSeedDemoTasks,
  type TaskColumn,
  type TaskEntity,
} from '../hooks/useTaskEntities'

interface KanbanTask {
  id: string
  columnId: string
  order: number
  title: string
  raw: TaskEntity
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'todo', title: 'To do' },
  { id: 'doing', title: 'Doing' },
  { id: 'done', title: 'Done' },
]

const VALID_COLUMNS: ReadonlyArray<TaskColumn> = ['todo', 'doing', 'done']

function isTaskColumn(value: unknown): value is TaskColumn {
  return typeof value === 'string' && VALID_COLUMNS.includes(value as TaskColumn)
}

function entityToCard(entity: TaskEntity): KanbanTask {
  const rawColumn = entity.fields.column
  const columnId = isTaskColumn(rawColumn) ? rawColumn : 'todo'
  const order =
    typeof entity.fields.order === 'number' ? entity.fields.order : entity.createdAt
  return {
    id: entity.id,
    columnId,
    order,
    title: entity.title,
    raw: entity,
  }
}

const SEED_TASKS = [
  { title: 'Draft kickoff brief', column: 'todo' as TaskColumn, order: 1 },
  { title: 'Sketch component layouts', column: 'todo' as TaskColumn, order: 2 },
  { title: 'Wire up dnd-kit sensors', column: 'doing' as TaskColumn, order: 1 },
  { title: 'Hook up TanStack Query mutation', column: 'doing' as TaskColumn, order: 2 },
  { title: 'Set up entities seed data', column: 'done' as TaskColumn, order: 1 },
  { title: 'Pick the icon set', column: 'done' as TaskColumn, order: 2 },
]

export function KanbanDemoPage() {
  const { data, isLoading } = useTaskEntities()
  const moveTask = useMoveTask()
  const seedTasks = useSeedDemoTasks()

  // Persisted collapse state lives in component state for the demo —
  // forks adopting this primitive can wire it to user prefs / localStorage.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())

  const cards: KanbanTask[] = React.useMemo(
    () => (data?.entities ?? []).map(entityToCard),
    [data],
  )

  const columns: KanbanColumn[] = React.useMemo(
    () =>
      DEFAULT_COLUMNS.map((c) => ({
        ...c,
        collapsed: collapsed.has(c.id),
      })),
    [collapsed],
  )

  const handleMove = (move: KanbanCardMove) => {
    if (!isTaskColumn(move.toColumnId)) return
    moveTask.mutate({
      id: move.cardId,
      column: move.toColumnId,
      order: move.toOrder,
    })
  }

  const handleToggle = (columnId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(columnId)) next.delete(columnId)
      else next.add(columnId)
      return next
    })
  }

  const handleSeed = () => {
    seedTasks.mutate(SEED_TASKS)
  }

  return (
    <PageContainer type="detail" maxWidth="7xl">
      <PageHeader
        title="Kanban demo"
        subtitle="Drag cards within a column to reorder, or across columns to move. Persisted to the entities API as type=task."
        trailing={
          data && data.total > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {data.total} {data.total === 1 ? 'task' : 'tasks'}
            </span>
          ) : null
        }
      />

      {isLoading && <PageLoading variant="list" count={4} />}

      {!isLoading && (data?.total ?? 0) === 0 && (
        <EmptyState
          icon={KanbanIcon}
          title="No demo tasks yet"
          description="Seed six example tasks across To do / Doing / Done to try the Kanban primitive."
          tips={[
            'Each task is a generic `entity` of type `task` — same API any module can use.',
            'Drag cards across columns to reassign them; drag within a column to reorder.',
          ]}
          action={{
            label: seedTasks.isPending ? 'Seeding…' : 'Seed 6 demo tasks',
            onClick: handleSeed,
          }}
        />
      )}

      {!isLoading && (data?.total ?? 0) > 0 && (
        <>
          <KanbanBoard<KanbanTask>
            columns={columns}
            cards={cards}
            onCardMove={handleMove}
            onColumnToggle={handleToggle}
            renderCard={(card) => (
              <div className="space-y-1">
                <div className="text-sm font-medium leading-snug">{card.title}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  order {Number(card.order).toFixed(2)}
                </div>
              </div>
            )}
          />
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleSeed} disabled={seedTasks.isPending}>
              {seedTasks.isPending ? 'Seeding…' : 'Seed 6 more tasks'}
            </Button>
          </div>
        </>
      )}
    </PageContainer>
  )
}

export default KanbanDemoPage
