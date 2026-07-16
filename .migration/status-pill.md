# status-pill

2026-07-16, transformation engine (custom in-house wrapper, no registry counterpart), Slot machinery migrated to useRender+mergeProps. Verdict: clean; migration also fixes latently-broken asChild semantics.

## Changed

- `src/components/ui/status-pill.tsx` — `StatusPill` used `Slot.Slot` + `asChild`. Rewired to `useRender` + `mergeProps` with the `render` prop (`useRender.ComponentProps<'span'>`). The icon + label spans are passed as `children` through mergeProps so `render={<Link/>}` produces a single element carrying the pill styling AND the icon/label content.
- Public API change: `asChild` -> `render`. Consumers (ApprovalCard, connector panels, ConnectorsPage, RoutinesPage) all use plain `<StatusPill kind=… label=… />` — none used `asChild`, no call-site fixes.

Leftover scan: `grep -n "radix-ui\|@radix-ui\|asChild" src/components/ui/status-pill.tsx` → no matches.

## Left alone

- `STATUS_SOFT_BG` palette import and all styling — unchanged.

## Behavior changes

- **Latent bug fixed, flagged for awareness:** the old `asChild` path was semantically broken — Radix Slot would merge the pill props onto the internal *label span* (when no icon) or throw on multiple children (with icon); the consumer's element was never rendered either way. No consumer used it. The `render` path is the first working as-link mode.

## Verify by hand

- Connectors page: Connected/Pending/Failed pills render with unchanged colors and sizes (default + lg).
- Approvals inbox rows: status pills in row metadata unchanged at text-[10px].
