# project — Radix UI → Base UI whole-project migration

2026-07-16. Migration complete: every shadcn/custom wrapper and all app code is off Radix; all direct radix dependencies removed. Final build + type-check green.

## ⚠️ FLAGGED FOR YOUR DECISION — components.json style is legacy `new-york`

`components.json` still says `"style": "new-york"`. Legacy styles have **no base counterpart** (there is no `base-new-york`), so per the migration skill the style was NOT flipped — flipping to a `base-<style>` variant would restyle the whole app. Consequence: **future `shadcn add <component>` will deliver RADIX variants** because the CLI still reads the style as radix-era. Options:

1. Leave as-is and hand-migrate any newly added component (the `.migration/` reports + `useRender`/`mergeProps` patterns in-repo make this mechanical), or
2. Switch `components.json` to a `base-<style>` (e.g. `base-lyra`) accepting the restyle, then re-diff customized wrappers.

Until decided, treat `shadcn add` output as radix code needing migration before commit.

## Dependency swap

Removed from `package.json` (pnpm remove; lockfile updated, `pnpm-lock.yaml` importer section has zero radix refs):

- `radix-ui` (1.4.3, consolidated package)
- 22 individual packages: `@radix-ui/react-{accordion, alert-dialog, avatar, checkbox, collapsible, dialog, dropdown-menu, label, popover, progress, radio-group, scroll-area, select, separator, slider, slot, switch, tabs, toggle, toggle-group, tooltip, use-controllable-state}`

Remaining transitive radix (intentional, third-party-owned, NOT our deps):

- `cmdk 1.1.1 → @radix-ui/react-dialog 1.1.15` (command palette)
- `vaul 1.1.2 → @radix-ui/react-dialog 1.1.15` (drawer)

Per the skill's hard rule, cmdk/vaul/sonner/input-otp/react-day-picker/recharts internals were never touched.

`vite.config.ts` vendor-chunk rule `'/@radix-ui/' → 'radix'` replaced with `'/@base-ui/' → 'base-ui'` (dist now emits `base-ui-*.js ~281 kB`, no radix chunk; cmdk/vaul's transitive dialog falls into default chunking).

## Final batch (this run)

Slot-machinery wrappers → `useRender` + `mergeProps` (`render` prop replaces `asChild`; consumers fixed):

| Component | Report | Consumers touched |
|---|---|---|
| breadcrumb | `.migration/breadcrumb.md` | none |
| button-group | `.migration/button-group.md` | none |
| item | `.migration/item.md` | none |
| list-row | `.migration/list-row.md` | ActivityPage, template IndexPage + CatalogPage |
| setup-card | `.migration/setup-card.md` | none (old asChild was latently broken — see report) |
| status-pill | `.migration/status-pill.md` | none (same latent Slot bug — see report) |
| sidebar | `.migration/sidebar.md` | nav-main.tsx (render={<NavLink/>}); stale `data-[state=open]` trigger markers → `data-popup-open` |
| reasoning (hook) | `.migration/reasoning-use-controllable-state.md` | local `src/hooks/use-controllable-state.ts` replaces `@radix-ui/react-use-controllable-state`, no new dependency |

## Whole-project sweep results (final)

| Sweep | Result |
|---|---|
| `grep -rn "radix-ui\|@radix-ui" src/` | **0 matches** |
| `grep -rn "asChild" src/` | **0 matches** (all wrappers now expose `render`) |
| `grep -rn -- "--radix" src/` | **0 matches** |
| `grep -rn "data-\[state=" src/` | 4 matches, all justified: `data-table.tsx:107` (self-set `data-state="sorted"`), `drawer.tsx:30` (vaul emits data-state — third-party, hands off), `table.tsx:46` (TanStack row-selection convention `data-state="selected"`), `sidebar.tsx:307` (our own aside sets `data-state=expanded\|collapsed`) |
| Consumer tokens (`delayDuration`, `skipDelayDuration`, `onValueCommit`, `rovingFocus`, `disableHoverableContent`, `activationMode`) | **0 matches** |
| Prose mentions of "radix" | 15 ui wrappers + a few docs carry explanatory comments ("radix did X, Base UI does Y") from earlier batches — provenance notes, intentionally kept, no code references |

Sweep-driven fixes in this closing pass (stale radix-era selectors in already-migrated files):

- `src/components/ui/field.tsx:111` — `has-data-[state=checked]:*` → `has-data-checked:*` (Base UI checkbox/radio/switch emit `data-checked`, not `data-state=checked`; the checked-card highlight was dead CSS)
- `src/client/modules/chat/components/MessageRenderer.tsx:440` — chevron `group-data-[state=open]/collapsible:rotate-180` → `in-data-panel-open:rotate-180` (no element declared `group/collapsible`, so this was dead even pre-migration; Base UI CollapsibleTrigger emits `data-panel-open`, verified in the package source)
- `src/components/ui/capability-chip.tsx` — doc comment referencing Radix `asChild`/Slot reworded for the render-prop era

## Final verification

- `pnpm type-check` — **pass**
- `pnpm build` — **pass** (chunk-size warning on the mermaid chunk is pre-existing, present in the pre-migration baseline)
- Migration state derived from disk per the skill: `src/components/ui/` contains **zero** files importing `radix-ui`/`@radix-ui` → **0 wrappers remain on Radix**.
