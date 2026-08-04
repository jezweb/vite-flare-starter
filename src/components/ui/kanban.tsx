/**
 * KanbanBoard — minimal, slot-based Kanban primitive.
 *
 * Use this for any "cards in columns, drag to reorder/move" surface
 * (project boards, issue triage, hiring pipelines, deal pipelines). The
 * primitive owns dnd-kit wiring, cross-column drag preview, keyboard
 * support with live-region announcements, the "Move to column" fallback
 * menu, and column collapse. The CONSUMER decides:
 *
 *   - what a card looks like (via the `renderCard` slot)
 *   - how to persist the move (via the `onCardMove` callback)
 *   - how to recover from persistence errors (caller does optimistic
 *     update locally; primitive fires `onCardMove` once per completed
 *     move and re-derives from props — if the server rejects, restore
 *     the previous state in your TanStack Query mutation `onError`).
 *     The full mutation recipe — optimistic update, 409 optimistic-lock
 *     revert for boards with concurrent/agent writers, invalidation —
 *     is in docs/PATTERNS.md § "Kanban Optimistic Move (conflict-safe)".
 *
 * Ordering uses **fractional-index string keys** (`fractional-indexing`):
 * each card holds a `position` string; a move is ONE row update, never a
 * renumber, and keys never collide (float midpoints exhaust precision
 * after ~50 inserts between the same neighbours — strings grow a char
 * instead). The primitive computes the new key from the drop neighbours
 * and hands it to `onCardMove` ready to persist. Use `positionForAppend`
 * / `positionBetween` when creating cards.
 *
 * Accessibility: cards are keyboard-sortable (space/enter pick up, arrows
 * move, space/enter drop, escape cancels) with position-aware live-region
 * announcements — and `<KanbanCardMenu>` provides the non-drag "Move to
 * <column>" fallback that screen-reader and voice users actually rely on.
 * Don't ship keyboard-drag alone.
 *
 * Agent-native: in this starter, cards are written by routines/agents as
 * often as by people. Convention: agent-created entities carry
 * `fields.createdBy: 'agent'` — render provenance in your card so
 * agent-authored cards are visually distinct (see the kanban-demo page).
 *
 * @example
 * ```tsx
 * <KanbanBoard
 *   columns={[{ id: 'todo', title: 'To do' }, { id: 'doing', title: 'Doing' }]}
 *   cards={tasks} // { id, columnId, position, ... }
 *   onCardMove={({ cardId, toColumnId, position }) => {
 *     // optimistic local update + persist
 *     mutate({ id: cardId, fields: { column: toColumnId, position } })
 *   }}
 *   renderCard={(task) => (
 *     <div className="flex items-start gap-2">
 *       <span className="flex-1">{task.title}</span>
 *       <KanbanCardMenu cardId={task.id} />
 *     </div>
 *   )}
 * />
 * ```
 */
import * as React from 'react'
import {
  DndContext,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
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
import { generateKeyBetween } from 'fractional-indexing'
import { ArrowsOutCardinal, CaretDown, CaretRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  /**
   * Fractional-index ordering key — lexicographic sort within a column.
   * Cards without a key sort after keyed ones, in input order.
   */
  position?: string | null
}

export interface KanbanCardMove {
  cardId: string
  fromColumnId: string
  toColumnId: string
  /** Neighbour above the drop slot (excluding the moved card), if any. */
  beforeCardId: string | null
  /** Neighbour below the drop slot (excluding the moved card), if any. */
  afterCardId: string | null
  /** Ready-to-persist fractional key for the card's new `position`. */
  position: string
  /** Zero-based index in the destination column. */
  index: number
}

export interface KanbanBoardProps<TCard extends KanbanCard> {
  columns: KanbanColumn[]
  cards: TCard[]
  /**
   * Called once per completed move (drag drop OR menu move) with the new
   * column + computed position key. The consumer is responsible for
   * persisting + reverting on error (optimistic update pattern).
   */
  onCardMove: (move: KanbanCardMove) => void
  /** Toggle a column's `collapsed` flag. Header is non-clickable when omitted. */
  onColumnToggle?: (columnId: string) => void
  /** How to render a card body. Slot pattern — caller owns visuals. */
  renderCard: (card: TCard, ctx: { isDragging: boolean; isOverlay: boolean }) => React.ReactNode
  /** Optional per-column footer slot (e.g. an "Add card" button). */
  renderColumnFooter?: (column: KanbanColumn) => React.ReactNode
  className?: string
}

// ─── Ordering helpers ─────────────────────────────────────────────────

/** Key that sorts after every existing card in a column. */
export function positionForAppend(cards: Pick<KanbanCard, 'position'>[]): string {
  const keys = cards
    .map((c) => c.position)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .sort()
  return generateKeyBetween(keys[keys.length - 1] ?? null, null)
}

/** Key strictly between two neighbours (null = start/end of column). */
export function positionBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b)
}

/** Display sort: keyed cards first (lexicographic), unkeyed last in input order. */
export function sortKanbanCards<TCard extends KanbanCard>(cards: TCard[]): TCard[] {
  return [...cards].sort((a, b) => {
    const pa = a.position ?? null
    const pb = b.position ?? null
    if (pa === null && pb === null) return 0
    if (pa === null) return 1
    if (pb === null) return -1
    return pa < pb ? -1 : pa > pb ? 1 : 0
  })
}

// ─── Context (KanbanCardMenu reaches the board for menu-moves) ────────

interface KanbanContextValue {
  columns: KanbanColumn[]
  moveCardToColumn: (cardId: string, toColumnId: string) => void
  findColumnOfCard: (cardId: string) => string | undefined
}

const KanbanContext = React.createContext<KanbanContextValue | null>(null)

function useKanbanContext(component: string): KanbanContextValue {
  const ctx = React.useContext(KanbanContext)
  if (!ctx) throw new Error(`<${component}> must be rendered inside <KanbanBoard>`)
  return ctx
}

const COLUMN_PREFIX = 'column:'

// ─── Board ────────────────────────────────────────────────────────────

export function KanbanBoard<TCard extends KanbanCard>({
  columns,
  cards,
  onCardMove,
  onColumnToggle,
  renderCard,
  renderColumnFooter,
  className,
}: KanbanBoardProps<TCard>) {
  const cardById = React.useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])

  // Local layout (columnId → ordered card ids). Derived from props; locally
  // mutated during a drag so cross-column hover previews live; re-derived
  // when props change outside a drag (TanStack refetch reconciles).
  const deriveItems = React.useCallback(() => {
    const byColumn: Record<string, string[]> = {}
    for (const col of columns) byColumn[col.id] = []
    for (const card of sortKanbanCards(cards)) {
      // Cards pointing at unknown columns are not rendered — the caller's
      // column set is the source of truth.
      byColumn[card.columnId]?.push(card.id)
    }
    return byColumn
  }, [columns, cards])

  const [items, setItems] = React.useState<Record<string, string[]>>(deriveItems)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  // Where the active card started, for the move payload.
  const dragOrigin = React.useRef<string | null>(null)
  // Final landing spot, set in handleDragEnd BEFORE dnd-kit asks for the
  // drop announcement — the announcements closure otherwise reads the
  // pre-drop layout (React hasn't re-rendered yet) and announces a stale
  // position.
  const lastDrop = React.useRef<{
    cardId: string
    columnId: string
    index: number
    count: number
  } | null>(null)

  React.useEffect(() => {
    if (activeId === null) setItems(deriveItems())
  }, [deriveItems, activeId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const findContainer = React.useCallback(
    (id: UniqueIdentifier): string | undefined => {
      const key = String(id)
      if (key.startsWith(COLUMN_PREFIX)) return key.slice(COLUMN_PREFIX.length)
      return Object.keys(items).find((columnId) => items[columnId]?.includes(key))
    },
    [items]
  )

  const columnTitle = React.useCallback(
    (columnId: string | undefined) => columns.find((c) => c.id === columnId)?.title ?? 'the board',
    [columns]
  )

  /** Compute + emit the move for a card now at rest in `columnIds`. */
  const emitMove = React.useCallback(
    (cardId: string, fromColumnId: string, toColumnId: string, columnIds: string[]) => {
      const index = columnIds.indexOf(cardId)
      if (index === -1) return
      const beforeCardId = index > 0 ? (columnIds[index - 1] ?? null) : null
      const afterCardId = index < columnIds.length - 1 ? (columnIds[index + 1] ?? null) : null
      const position = generateKeyBetween(
        beforeCardId ? (cardById.get(beforeCardId)?.position ?? null) : null,
        afterCardId ? (cardById.get(afterCardId)?.position ?? null) : null
      )
      onCardMove({ cardId, fromColumnId, toColumnId, beforeCardId, afterCardId, position, index })
    },
    [cardById, onCardMove]
  )

  const handleDragStart = React.useCallback(
    ({ active }: DragStartEvent) => {
      setActiveId(String(active.id))
      dragOrigin.current = findContainer(active.id) ?? null
    },
    [findContainer]
  )

  // Cross-column live preview: transfer the card between containers while
  // hovering, so the destination column visibly makes room before drop.
  const handleDragOver = React.useCallback(
    ({ active, over }: DragOverEvent) => {
      if (!over) return
      const activeContainer = findContainer(active.id)
      const overContainer = findContainer(over.id)
      if (!activeContainer || !overContainer || activeContainer === overContainer) return

      setItems((prev) => {
        const activeItems = prev[activeContainer] ?? []
        const overItems = prev[overContainer] ?? []
        const overIndex = overItems.indexOf(String(over.id))
        // Over the column body → append; over a card → take its slot.
        const insertIndex = overIndex >= 0 ? overIndex : overItems.length
        return {
          ...prev,
          [activeContainer]: activeItems.filter((id) => id !== String(active.id)),
          [overContainer]: [
            ...overItems.slice(0, insertIndex),
            String(active.id),
            ...overItems.slice(insertIndex),
          ],
        }
      })
    },
    [findContainer]
  )

  const handleDragEnd = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      const cardId = String(active.id)
      const fromColumnId = dragOrigin.current
      setActiveId(null)
      dragOrigin.current = null
      if (!over || !fromColumnId) return

      const overContainer = findContainer(over.id)
      if (!overContainer) return

      // Same-column reorder happens here (cross-column transfer already
      // landed in onDragOver). Compute the final layout, then emit once.
      const columnIds = [...(items[overContainer] ?? [])]
      const fromIndex = columnIds.indexOf(cardId)
      const overIndex = columnIds.indexOf(String(over.id))
      if (fromIndex !== -1 && overIndex !== -1 && fromIndex !== overIndex) {
        columnIds.splice(fromIndex, 1)
        columnIds.splice(overIndex, 0, cardId)
      }
      setItems((prev) => ({ ...prev, [overContainer]: columnIds }))
      lastDrop.current = {
        cardId,
        columnId: overContainer,
        index: columnIds.indexOf(cardId),
        count: columnIds.length,
      }

      // No-op guard: same column, same slot, nothing changed.
      const startedHere = fromColumnId === overContainer
      const startLayout = deriveItems()[overContainer] ?? []
      if (startedHere && startLayout.join(' ') === columnIds.join(' ')) return

      emitMove(cardId, fromColumnId, overContainer, columnIds)
    },
    [items, deriveItems, emitMove, findContainer]
  )

  const handleDragCancel = React.useCallback(() => {
    setActiveId(null)
    dragOrigin.current = null
    setItems(deriveItems())
  }, [deriveItems])

  /** Non-drag fallback used by KanbanCardMenu: append to a column's end. */
  const moveCardToColumn = React.useCallback(
    (cardId: string, toColumnId: string) => {
      const fromColumnId = Object.keys(items).find((c) => items[c]?.includes(cardId))
      if (!fromColumnId || fromColumnId === toColumnId) return
      const columnIds = [...(items[toColumnId] ?? []).filter((id) => id !== cardId), cardId]
      setItems((prev) => ({
        ...prev,
        [fromColumnId]: (prev[fromColumnId] ?? []).filter((id) => id !== cardId),
        [toColumnId]: columnIds,
      }))
      emitMove(cardId, fromColumnId, toColumnId, columnIds)
    },
    [items, emitMove]
  )

  const findColumnOfCard = React.useCallback(
    (cardId: string) => Object.keys(items).find((c) => items[c]?.includes(cardId)),
    [items]
  )

  // Position-aware live-region announcements ("…position 2 of 5 in Doing").
  const announcements: Announcements = React.useMemo(() => {
    const positionIn = (id: UniqueIdentifier, containerId: string | undefined) => {
      if (!containerId) return ''
      const list = items[containerId] ?? []
      const idx = list.indexOf(String(id))
      return idx === -1 ? '' : `, position ${idx + 1} of ${list.length}`
    }
    return {
      onDragStart({ active }) {
        const col = findContainer(active.id)
        return `Card picked up from ${columnTitle(col)}${positionIn(active.id, col)}.`
      },
      onDragOver({ active, over }) {
        if (!over) return undefined
        const col = findContainer(over.id)
        return `Card is over ${columnTitle(col)}${positionIn(active.id, col)}.`
      },
      onDragEnd({ active, over }) {
        // Prefer the exact landing spot recorded by handleDragEnd — the
        // `items` in this closure are pre-drop and announce a stale slot.
        const drop = lastDrop.current
        if (drop && drop.cardId === String(active.id)) {
          lastDrop.current = null
          return `Card dropped into ${columnTitle(drop.columnId)}, position ${drop.index + 1} of ${drop.count}.`
        }
        if (!over) return 'Card dropped.'
        const col = findContainer(over.id)
        return `Card dropped into ${columnTitle(col)}${positionIn(active.id, col)}.`
      },
      onDragCancel() {
        return 'Move cancelled. Card returned to its original position.'
      },
    }
  }, [items, findContainer, columnTitle])

  const activeCard = activeId ? cardById.get(activeId) : undefined

  const contextValue = React.useMemo<KanbanContextValue>(
    () => ({ columns, moveCardToColumn, findColumnOfCard }),
    [columns, moveCardToColumn, findColumnOfCard]
  )

  return (
    <KanbanContext.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'To pick up a card, press space or enter. Use the arrow keys to move it, ' +
              'space or enter to drop, escape to cancel. Or open the card menu and choose ' +
              'Move to column.',
          },
        }}
      >
        <div
          data-slot="kanban-board"
          className={cn('flex gap-3 overflow-x-auto pb-2 items-start', className)}
        >
          {columns.map((col) => (
            <KanbanColumnView
              key={col.id}
              column={col}
              cardIds={items[col.id] ?? []}
              cardById={cardById}
              onToggle={onColumnToggle}
              renderCard={renderCard}
              footer={renderColumnFooter?.(col)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeCard ? (
            <div className="bg-card border rounded-md p-3 shadow-lg cursor-grabbing">
              {renderCard(activeCard, { isDragging: false, isOverlay: true })}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </KanbanContext.Provider>
  )
}

KanbanBoard.displayName = 'KanbanBoard'

// ─── Column ───────────────────────────────────────────────────────────

interface KanbanColumnViewProps<TCard extends KanbanCard> {
  column: KanbanColumn
  cardIds: string[]
  cardById: Map<string, TCard>
  onToggle?: (columnId: string) => void
  renderCard: KanbanBoardProps<TCard>['renderCard']
  footer?: React.ReactNode
}

function KanbanColumnView<TCard extends KanbanCard>({
  column,
  cardIds,
  cardById,
  onToggle,
  renderCard,
  footer,
}: KanbanColumnViewProps<TCard>) {
  // Empty columns still need a droppable target (SortableContext only
  // covers cards). Without this, dragging onto an empty column does
  // nothing — `over` is null, no move event fires.
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${column.id}` })

  const isCollapsed = column.collapsed ?? false
  const Icon = isCollapsed ? CaretRight : CaretDown

  return (
    <div
      data-slot="kanban-column"
      data-column-id={column.id}
      className={cn(
        'bg-muted/30 rounded-lg p-3 w-72 shrink-0 flex flex-col',
        isCollapsed && 'w-12 items-center'
      )}
    >
      <div className={cn('flex items-center gap-2 mb-3', isCollapsed && 'flex-col mb-0')}>
        {onToggle ? (
          <button
            type="button"
            onClick={() => onToggle(column.id)}
            className="flex items-center gap-1 text-sm font-medium hover:text-foreground/80 transition-colors"
            aria-expanded={!isCollapsed}
            aria-label={
              isCollapsed
                ? `Expand ${column.title} column, ${cardIds.length} cards`
                : `Collapse ${column.title} column`
            }
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
          <span className="text-xs text-muted-foreground tabular-nums">{cardIds.length}</span>
        )}
      </div>

      {!isCollapsed && (
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          <div
            ref={setNodeRef}
            role="list"
            aria-label={column.title}
            className={cn(
              'flex flex-col gap-2 min-h-12 rounded-md transition-colors',
              isOver && 'bg-accent/30 outline-2 outline-dashed outline-accent-foreground/20'
            )}
          >
            {cardIds.map((id) => {
              const card = cardById.get(id)
              if (!card) return null
              return <SortableCard key={id} card={card} renderCard={renderCard} />
            })}
            {cardIds.length === 0 && (
              <div className="text-xs text-muted-foreground/60 italic px-2 py-3 border border-dashed rounded-md text-center">
                Drop here
              </div>
            )}
          </div>
        </SortableContext>
      )}

      {!isCollapsed && footer ? <div className="mt-2">{footer}</div> : null}
    </div>
  )
}

// ─── Sortable card wrapper ────────────────────────────────────────────

interface SortableCardProps<TCard extends KanbanCard> {
  card: TCard
  renderCard: KanbanBoardProps<TCard>['renderCard']
}

function SortableCard<TCard extends KanbanCard>({ card, renderCard }: SortableCardProps<TCard>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  })
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
      role="listitem"
      className="touch-none outline-none rounded-md focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="bg-card border rounded-md p-3 shadow-sm hover:shadow transition-shadow cursor-grab active:cursor-grabbing">
        {renderCard(card, { isDragging, isOverlay: false })}
      </div>
    </div>
  )
}

// ─── Move-to-column fallback menu ─────────────────────────────────────

export interface KanbanCardMenuProps {
  cardId: string
  /** Extra menu items rendered below the Move-to section. */
  children?: React.ReactNode
  className?: string
}

/**
 * The non-drag fallback every accessible board needs: a dropdown that
 * moves the card to the end of any other column. Place it inside your
 * `renderCard` (it stops pointer/keyboard events from starting a drag).
 */
export function KanbanCardMenu({ cardId, children, className }: KanbanCardMenuProps) {
  const { columns, moveCardToColumn, findColumnOfCard } = useKanbanContext('KanbanCardMenu')
  const currentColumnId = findColumnOfCard(cardId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn('text-muted-foreground', className)}
            aria-label="Card actions"
            // Don't let the menu button start a drag.
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <ArrowsOutCardinal />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {columns
          .filter((c) => c.id !== currentColumnId)
          .map((column) => (
            <DropdownMenuItem key={column.id} onClick={() => moveCardToColumn(cardId, column.id)}>
              {column.title}
            </DropdownMenuItem>
          ))}
        {children ? (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
