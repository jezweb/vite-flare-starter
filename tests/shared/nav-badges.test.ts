/**
 * Nav badge overlay — the render-side half of "a fresh fork shows no
 * What's New item".
 *
 * The API half is pinned in tests/server/modules/updates/routes.test.ts
 * (an empty table reports total 0). This pins what the sidebar then does
 * with that: drop the item entirely rather than link to an empty page.
 */
import { describe, it, expect } from 'vitest'
import { House, Megaphone } from '@phosphor-icons/react'
import { applyBadges, type NavItem } from '@/shared/config/nav'

const home: NavItem = { to: '/dashboard', label: 'Home', icon: House }
const updates: NavItem = {
  to: '/dashboard/updates',
  label: "What's new",
  icon: Megaphone,
  badgeSource: 'updates',
}

describe('applyBadges', () => {
  it('drops an item whose source reports hidden', () => {
    const result = applyBadges([home, updates], { updates: { hidden: true } })
    expect(result.map((i) => i.to)).toEqual(['/dashboard'])
  })

  it('keeps the item and sets the dot when there is something unseen', () => {
    const result = applyBadges([home, updates], { updates: { dot: true } })
    expect(result.map((i) => i.to)).toEqual(['/dashboard', '/dashboard/updates'])
    expect(result[1]?.dot).toBe(true)
  })

  it('keeps the item without a dot when everything has been seen', () => {
    const result = applyBadges([home, updates], { updates: { dot: false } })
    expect(result).toHaveLength(2)
    expect(result[1]?.dot).toBe(false)
  })

  it('leaves items without a badgeSource completely untouched', () => {
    const result = applyBadges([home], { updates: { dot: true, hidden: true } })
    expect(result).toEqual([home])
    expect(result[0]).not.toHaveProperty('dot')
  })

  it('falls OPEN when the named resolver is missing', () => {
    // A fork that deletes a resolver but leaves the nav entry behind
    // gets a visible, working link rather than a page it can no longer
    // reach. Failing closed here would turn a config slip into a
    // silently unreachable route, which is the worse failure.
    const result = applyBadges([updates], {})
    expect(result.map((i) => i.to)).toEqual(['/dashboard/updates'])
    expect(result[0]?.dot).toBe(false)
  })
})
