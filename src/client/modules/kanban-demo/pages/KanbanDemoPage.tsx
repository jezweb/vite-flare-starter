/**
 * KanbanDemoPage — exercises the <KanbanBoard> primitive against the
 * generic `entities` API. Uses entities of type `task`, mapping
 * `fields.column` → kanban column and `fields.position` → fractional
 * sort key.
 *
 * The page is feature-flagged off by default (set
 * VITE_FEATURE_KANBAN_DEMO=true to enable). It exists as a working
 * reference implementation — fork-users see the optimistic-update
 * pattern, keyboard DnD + the KanbanCardMenu a11y fallback, the
 * agent-provenance badge, and slot-based card rendering in one place.
 */
import * as React from 'react'
import { Kanban as KanbanIcon, Robot } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoading } from '@/client/components/PageState'
import { EmptyState } from '@/client/components/EmptyState'
import {
  KanbanBoard,
  KanbanCardMenu,
  positionBetween,
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
import { TaskEditSheet } from '../components/TaskEditSheet'

interface KanbanTask {
  id: string
  columnId: string
  position: string | null
  title: string
  isAgentCreated: boolean
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
  const position = typeof entity.fields.position === 'string' ? entity.fields.position : null
  return {
    id: entity.id,
    columnId,
    position,
    title: entity.title,
    // Convention: entity chat tools stamp fields.createdBy = 'agent' so
    // agent-written cards are visually distinct on boards.
    isAgentCreated: entity.fields.createdBy === 'agent',
    raw: entity,
  }
}

/** Seed keys via the same fractional generator the board uses. */
function seedPositions(count: number): string[] {
  const keys: string[] = []
  let prev: string | null = null
  for (let i = 0; i < count; i++) {
    prev = positionBetween(prev, null)
    keys.push(prev)
  }
  return keys
}

const SEED_DEFS = [
  { title: 'Draft kickoff brief', column: 'todo' as TaskColumn },
  { title: 'Sketch component layouts', column: 'todo' as TaskColumn },
  { title: 'Wire up dnd-kit sensors', column: 'doing' as TaskColumn },
  { title: 'Hook up TanStack Query mutation', column: 'doing' as TaskColumn },
  { title: 'Set up entities seed data', column: 'done' as TaskColumn },
  { title: 'Pick the icon set', column: 'done' as TaskColumn },
]

export function KanbanDemoPage() {
  const { data, isLoading } = useTaskEntities()
  const moveTask = useMoveTask()
  const seedTasks = useSeedDemoTasks()

  // Persisted collapse state lives in component state for the demo —
  // forks adopting this primitive can wire it to user prefs / localStorage.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())

  // Card edit sheet (custom-fields worked example, #62(2)).
  const [editingId, setEditingId] = React.useState<string | null>(null)

  const cards: KanbanTask[] = React.useMemo(() => (data?.entities ?? []).map(entityToCard), [data])

  const columns: KanbanColumn[] = React.useMemo(
    () =>
      DEFAULT_COLUMNS.map((c) => ({
        ...c,
        collapsed: collapsed.has(c.id),
      })),
    [collapsed]
  )

  const handleMove = (move: KanbanCardMove) => {
    if (!isTaskColumn(move.toColumnId)) return
    moveTask.mutate({
      id: move.cardId,
      column: move.toColumnId,
      position: move.position,
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
    const keys = seedPositions(SEED_DEFS.length)
    seedTasks.mutate(SEED_DEFS.map((t, i) => ({ ...t, position: keys[i] ?? 'a0' })))
  }

  return (
    <PageContainer type="detail" maxWidth="7xl">
      <PageHeader
        title="Kanban demo"
        subtitle="Drag cards to reorder or move — or focus a card and use space + arrows, or the card menu. Click a card title to edit its custom fields (DynamicFieldRenderer). Persisted to the entities API as type=task."
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
            'Ask the AI chat to "create a task entity" — agent-created cards get a badge.',
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
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="flex-1 text-left text-sm font-medium leading-snug hover:underline"
                    onClick={() => setEditingId(card.id)}
                  >
                    {card.title}
                  </button>
                  <KanbanCardMenu cardId={card.id} className="-mr-1.5 -mt-1" />
                </div>
                {card.isAgentCreated && (
                  <Badge variant="outline" className="gap-1 text-[11px] text-muted-foreground">
                    <Robot className="size-3" /> Agent
                  </Badge>
                )}
              </div>
            )}
          />
          <TaskEditSheet
            task={cards.find((card) => card.id === editingId)?.raw ?? null}
            onClose={() => setEditingId(null)}
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
