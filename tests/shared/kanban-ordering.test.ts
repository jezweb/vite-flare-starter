/**
 * Kanban ordering helpers — fractional-index key generation + display sort.
 *
 * These are the pure functions behind <KanbanBoard>'s "a move is one row
 * update" contract (src/components/ui/kanban.tsx). The invariants that
 * matter:
 *   - keys generated between neighbours always sort strictly between them
 *   - repeated insertion between the same two neighbours never collides
 *     (the float-midpoint approach this replaced exhausts after ~50)
 *   - unkeyed cards (legacy rows) sort after keyed ones, stably
 */
import { describe, it, expect } from 'vitest'
import {
  positionBetween,
  positionForAppend,
  sortKanbanCards,
} from '@/components/ui/kanban'

describe('positionBetween', () => {
  it('generates a key strictly between two neighbours', () => {
    const a = positionBetween(null, null)
    const b = positionBetween(a, null)
    const mid = positionBetween(a, b)
    expect(mid > a).toBe(true)
    expect(mid < b).toBe(true)
  })

  it('survives 200 repeated insertions between the same neighbours', () => {
    // The failure mode float midpoints hit: precision exhaustion. String
    // keys grow a character instead — every key must remain strictly
    // ordered and unique.
    let low = positionBetween(null, null)
    const high = positionBetween(low, null)
    const seen = new Set<string>([low, high])
    for (let i = 0; i < 200; i++) {
      const key = positionBetween(low, high)
      expect(key > low).toBe(true)
      expect(key < high).toBe(true)
      expect(seen.has(key)).toBe(false)
      seen.add(key)
      low = key // keep squeezing the same gap
    }
  })
})

describe('positionForAppend', () => {
  it('returns a key after every existing card', () => {
    const first = positionBetween(null, null)
    const second = positionBetween(first, null)
    const appended = positionForAppend([{ position: second }, { position: first }])
    expect(appended > first).toBe(true)
    expect(appended > second).toBe(true)
  })

  it('handles an empty column and ignores unkeyed cards', () => {
    expect(typeof positionForAppend([])).toBe('string')
    const first = positionBetween(null, null)
    const appended = positionForAppend([{ position: first }, { position: null }, {}])
    expect(appended > first).toBe(true)
  })
})

describe('sortKanbanCards', () => {
  it('sorts keyed cards lexicographically, unkeyed last in input order', () => {
    const a = positionBetween(null, null)
    const b = positionBetween(a, null)
    const cards = [
      { id: 'legacy-1', columnId: 'todo', position: null },
      { id: 'second', columnId: 'todo', position: b },
      { id: 'legacy-2', columnId: 'todo' },
      { id: 'first', columnId: 'todo', position: a },
    ]
    expect(sortKanbanCards(cards).map((c) => c.id)).toEqual([
      'first',
      'second',
      'legacy-1',
      'legacy-2',
    ])
  })

  it('does not mutate the input array', () => {
    const cards = [
      { id: 'x', columnId: 'todo', position: 'b' },
      { id: 'y', columnId: 'todo', position: 'a' },
    ]
    const before = [...cards]
    sortKanbanCards(cards)
    expect(cards).toEqual(before)
  })
})
