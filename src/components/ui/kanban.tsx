/**
 * KanbanBoard — minimal, slot-based Kanban primitive.
 *
 * Use this for any "cards in columns, drag to reorder/move" surface
 * (project boards, issue triage, hiring pipelines). The primitive owns
 * dnd-kit wiring, drop indicators, keyboard support, and column collapse.
 * The CONSUMER decides:
 *
 *   - what a card looks like (via the `renderCard` slot)
 *   - how to persist the move (via the `onCardMove` callback)
 *   - how to recover from persistence errors (caller does optimistic
 *     update locally; primitive fires `onCardMove` immediately and never
 *     reverts — if the server rejects, the consumer must restore the
 *     previous state in their TanStack Query mutation `onError`)
 *
 * Order field is a `number` (float). Use the "midpoint between
 * neighbours" trick (`(prev.order + next.order) / 2`) to reorder
 * without rewriting every card's order. New cards at the end of a
 * column get `Math.max(...) + 1` (or `Date.now()` as a default).
 *
 * @example
 * ```tsx
 * <KanbanBoard
 *   columns={[{ id: 'todo', title: 'To do' }, { id: 'doing', title: 'Doing' }]}
 *   cards={tasks}
 *   onCardMove={({ cardId, toColumnId, toOrder }) => {
 *     // optimistic local update + persist
 *     mutate({ id: cardId, fields: { column: toColumnId, order: toOrder } })
 *   }}
 *   renderCard={(task) => <TaskCard task={task} />}
 * />
 * ```
 */
import * as React from 'react'
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────

export interface KanbanColumn {
  id: string
  title: string
  collapsed?: boolean
}

export interface KanbanCard {
  id: string
  columnId: string
  /** Float — midpoint between neighbours for cheap reorders. */
  order: number
}

export interface KanbanCardMove {
  cardId: string
  toColumnId: string
  toOrder: number
}

export interface KanbanBoardProps<TCard extends KanbanCard> {
  columns: KanbanColumn[]
  cards: TCard[]
  /**
   * Called immediately on drop with the new column + computed order.
   * The consumer is responsible for persisting + reverting on error
   * (optimistic update pattern). Primitive does NOT revert.
   */
  onCardMove: (move: KanbanCardMove) => void
  /** Toggle a column's `collapsed` flag. Header is non-clickable when omitted. */
  onColumnToggle?: (columnId: string) => void
  /** How to render a card body. Slot pattern — caller owns visuals. */
  renderCard: (card: TCard) => React.ReactNode
  className?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Compute the new order value when dropping a card into a position.
 * Uses midpoint-between-neighbours so existing cards don't get rewritten.
 */
function computeOrder(
  cardsInTargetColumn: KanbanCard[],
  insertIndex: number,
  excludeCardId: string,
): number {
  const sorted = cardsInTargetColumn
    .filter((c) => c.id !== excludeCardId)
    .sort((a, b) => a.order - b.order)

  if (sorted.length === 0) return Date.now()
  if (insertIndex <= 0) return (sorted[0]?.order ?? 0) - 1
  if (insertIndex >= sorted.length) return (sorted[sorted.length - 1]?.order ?? 0) + 1
  const prev = sorted[insertIndex - 1]?.order ?? 0
  const next = sorted[insertIndex]?.order ?? prev + 2
  return (prev + next) / 2
}

// ─── Sortable card wrapper ────────────────────────────────────────────

interface SortableCardProps {
  id: string
  children: React.ReactNode
}

function SortableCard({ id, children }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="touch-none"
    >
      {children}
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────

interface KanbanColumnViewProps<TCard extends KanbanCard> {
  column: KanbanColumn
  cards: TCard[]
  onToggle?: (columnId: string) => void
  renderCard: (card: TCard) => React.ReactNode
}

function KanbanColumnView<TCard extends KanbanCard>({
  column,
  cards,
  onToggle,
  renderCard,
}: KanbanColumnViewProps<TCard>) {
  // Empty columns still need a droppable target (SortableContext only
  // covers cards). Without this, dragging onto an empty column does
  // nothing — `over` is null, no move event fires.
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}` })

  const sortedCards = React.useMemo(
    () => [...cards].sort((a, b) => a.order - b.order),
    [cards],
  )
  const cardIds = React.useMemo(() => sortedCards.map((c) => c.id), [sortedCards])
  const isCollapsed = column.collapsed ?? false
  const Icon = isCollapsed ? ChevronRight : ChevronDown

  return (
    <div
      data-slot="kanban-column"
      data-column-id={column.id}
      className={cn(
        'bg-muted/30 rounded-lg p-3 w-72 shrink-0 flex flex-col',
        isCollapsed && 'w-12 items-center',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 mb-3',
          isCollapsed && 'flex-col mb-0',
        )}
      >
        {onToggle ? (
          <button
            type="button"
            onClick={() => onToggle(column.id)}
            className="flex items-center gap-1 text-sm font-medium hover:text-foreground/80 transition-colors"
            aria-expanded={!isCollapsed}
          >
            <Icon className="size-3.5 text-muted-foreground" />
            {!isCollapsed && <span>{column.title}</span>}
          </button>
        ) : (
          <div className="flex items-center gap-1 text-sm font-medium">
            {!isCollapsed && <span>{column.title}</span>}
          </div>
        )}
        {!isCollapsed && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {sortedCards.length}
          </span>
        )}
      </div>

      {!isCollapsed && (
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          <div
            ref={setNodeRef}
            className={cn(
              'flex flex-col gap-2 min-h-12 rounded-md transition-colors',
              isOver && 'bg-accent/30 outline-2 outline-dashed outline-accent-foreground/20',
            )}
          >
            {sortedCards.map((card) => (
              <SortableCard key={card.id} id={card.id}>
                <div className="bg-card border rounded-md p-3 shadow-sm hover:shadow transition-shadow cursor-grab active:cursor-grabbing">
                  {renderCard(card)}
                </div>
              </SortableCard>
            ))}
            {sortedCards.length === 0 && (
              <div className="text-xs text-muted-foreground/60 italic px-2 py-3 border border-dashed rounded-md text-center">
                Drop here
              </div>
            )}
          </div>
        </SortableContext>
      )}
    </div>
  )
}

// ─── Board ────────────────────────────────────────────────────────────

export function KanbanBoard<TCard extends KanbanCard>({
  columns,
  cards,
  onCardMove,
  onColumnToggle,
  renderCard,
  className,
}: KanbanBoardProps<TCard>) {
  const [activeId, setActiveId] = React.useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const cardsByColumn = React.useMemo(() => {
    const map = new Map<string, TCard[]>()
    for (const col of columns) map.set(col.id, [])
    for (const card of cards) {
      if (!map.has(card.columnId)) map.set(card.columnId, [])
      map.get(card.columnId)!.push(card)
    }
    return map
  }, [columns, cards])

  const activeCard = React.useMemo(
    () => (activeId ? cards.find((c) => c.id === activeId) ?? null : null),
    [activeId, cards],
  )

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return

    const activeCardId = String(active.id)
    const overId = String(over.id)
    const dragged = cards.find((c) => c.id === activeCardId)
    if (!dragged) return

    // Two over-target shapes: another card id (drop on/before/after a
    // card) OR a `column:<id>` droppable id (drop into an empty column).
    let toColumnId: string
    let insertIndex: number

    if (overId.startsWith('column:')) {
      toColumnId = overId.slice('column:'.length)
      const targetCards = (cardsByColumn.get(toColumnId) ?? [])
        .filter((c) => c.id !== activeCardId)
        .sort((a, b) => a.order - b.order)
      insertIndex = targetCards.length
    } else {
      const overCard = cards.find((c) => c.id === overId)
      if (!overCard) return
      toColumnId = overCard.columnId
      const targetCards = (cardsByColumn.get(toColumnId) ?? [])
        .filter((c) => c.id !== activeCardId)
        .sort((a, b) => a.order - b.order)
      const overIndex = targetCards.findIndex((c) => c.id === overCard.id)
      insertIndex = overIndex < 0 ? targetCards.length : overIndex
    }

    // No-op: dropped on itself in the same column at the same position.
    if (
      dragged.columnId === toColumnId &&
      activeCardId === overId
    ) {
      return
    }

    const targetCards = cardsByColumn.get(toColumnId) ?? []
    const toOrder = computeOrder(targetCards, insertIndex, activeCardId)

    onCardMove({ cardId: activeCardId, toColumnId, toOrder })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div
        data-slot="kanban-board"
        className={cn(
          'flex gap-3 overflow-x-auto pb-2 items-start',
          className,
        )}
      >
        {columns.map((col) => (
          <KanbanColumnView
            key={col.id}
            column={col}
            cards={cardsByColumn.get(col.id) ?? []}
            onToggle={onColumnToggle}
            renderCard={renderCard}
          />
        ))}
      </div>

      <DragOverlay>
        {activeCard ? (
          <div className="bg-card border rounded-md p-3 shadow-lg cursor-grabbing">
            {renderCard(activeCard)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

KanbanBoard.displayName = 'KanbanBoard'
