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
import { useMemo } from 'react'
import { useUpdatesSummary } from '@/client/modules/updates/hooks/useUpdates'
import type { NavBadgeSource, NavBadgeState } from '@/shared/config/nav'

export type { NavBadgeState }

export function useNavBadges(): Record<NavBadgeSource, NavBadgeState> {
  const { data, isSuccess, isLoading } = useUpdatesSummary()

  // Memoised because AppSidebar feeds this into a useMemo dependency list;
  // a fresh object literal every render would defeat that memo entirely.
  return useMemo(
    () => ({
      updates: {
        dot: (data?.unseenCount ?? 0) > 0,
        // Three states, not two. Hide on a SUCCESSFUL empty read (a fork
        // that has never published a note should not link to an empty
        // page) and while the first read is still in flight (so the item
        // fades in once instead of flashing and vanishing). But on ERROR,
        // show it: a transient rate-limit or network blip must not remove
        // a working navigation entry for the rest of the session.
        hidden: isSuccess ? data.total === 0 : isLoading,
      },
    }),
    [data, isSuccess, isLoading]
  )
}
