/**
 * Runtime badge state for nav items.
 *
 * `nav.ts` stays plain serialisable data — the CommandPalette and forks
 * both read it directly, so it must not grow hooks or components. An
 * item names a `badgeSource` instead, and this resolves the name here,
 * in the sidebar renderer.
 *
 * Every hook below runs unconditionally on every render, once each. That
 * is the rule that keeps this legal: the map is fixed at build time, so
 * adding a source is adding a line here, never a conditional call.
 */
import { useEffect, useMemo, useState } from 'react'
import { useUpdatesSummary } from '@/client/modules/updates/hooks/useUpdates'
import type { NavBadgeSource, NavBadgeState } from '@/shared/config/nav'

export type { NavBadgeState }

/**
 * Remembers whether this app has ever had a published entry.
 *
 * Purely a first-paint hint, never a source of truth: it decides what to
 * show for the few hundred ms before the summary query answers, and the
 * real answer overwrites it. Without it, an app that DOES have entries
 * hides the nav item on every cold load and then pops it in — a visible
 * shift on a permanent piece of chrome. With it, the item is there
 * immediately and only disappears in the rare case the hint was stale.
 */
const HAS_ENTRIES_HINT = 'nav:updates:has-entries'

function readHint(): boolean {
  try {
    return localStorage.getItem(HAS_ENTRIES_HINT) === 'true'
  } catch {
    return false
  }
}

function writeHint(hasEntries: boolean): void {
  try {
    localStorage.setItem(HAS_ENTRIES_HINT, hasEntries ? 'true' : 'false')
  } catch {
    // Private mode / storage disabled — the hint is optional by design.
  }
}

export function useNavBadges(): Record<NavBadgeSource, NavBadgeState> {
  const { data, isSuccess, isLoading } = useUpdatesSummary()

  // Read once per mount, in an initialiser rather than during render, and
  // write in an effect. Touching localStorage inline in a render body is
  // the exact defect this module's own docs call out in the reference
  // implementation — it is neither reactive nor concurrent-safe.
  const [hadEntries] = useState(readHint)

  useEffect(() => {
    if (isSuccess) writeHint(data.total > 0)
  }, [isSuccess, data])

  // Memoised because AppSidebar and CommandPalette both feed this into a
  // useMemo dependency list; a fresh object literal every render would
  // defeat those memos entirely.
  return useMemo(
    () => ({
      updates: {
        dot: (data?.unseenCount ?? 0) > 0,
        // Three states, not two:
        //   answered  → hide only if the feed is genuinely empty, so a
        //               fresh fork never links to an empty page
        //   in flight → fall back to the remembered answer, so a populated
        //               app paints the item immediately instead of
        //               popping it in once the query lands
        //   errored   → show it. A network blip must not remove working
        //               navigation for the rest of the session.
        hidden: isSuccess ? data.total === 0 : isLoading ? !hadEntries : false,
      },
    }),
    [data, isSuccess, isLoading, hadEntries]
  )
}
