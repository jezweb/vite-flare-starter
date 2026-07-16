# tabs

2026-07-16, transformation engine (legacy style `new-york`, classification only — file is CUSTOMIZED: `line` variant, orientation groups, after-underline styling). Verdict: Trigger → Tab, Content → Panel, `data-[state=active]:` → `data-active:`; zero consumer prop changes needed.

## Changed

- `src/components/ui/tabs.tsx` — import `radix-ui` → `@base-ui/react/tabs`; types to `TabsPrimitive.{Root,List,Tab,Panel}.Props`.
  - `TabsTrigger`: `TabsPrimitive.Trigger` → `TabsPrimitive.Tab`. All `data-[state=active]:` selectors rekeyed `data-active:` (Base UI presence attribute). Added `aria-disabled:pointer-events-none aria-disabled:opacity-50` alongside the kept `disabled:*` variants (Base UI Tab can surface disabled state as `aria-disabled`).
  - `TabsContent`: `TabsPrimitive.Content` → `TabsPrimitive.Panel`.
  - Root keeps our manual `data-orientation={orientation}` + the `group-data-[orientation=…]/tabs` selectors — Base UI Tabs still emits `data-orientation` on all parts, so these selectors survive unchanged.
  - `tabsListVariants` export kept (public API unchanged).

Consumer sweep: 16 consumer files (SettingsPage, InboxPage, AdminPage, page-filters.tsx, SkillEditor, modals, StyleGuidePage, ComponentsPage, …) — all use string `value`/`defaultValue` + single-arg `onValueChange`, which stay type-safe (Base UI value widens to `any`; callbacks gain an optional second `eventDetails` arg). No `activationMode`, no `asChild`, no `forceMount`, no consumer class strings keyed on `data-[state=active]` outside the wrapper. Zero call-site edits required.

Leftover scan: `grep -n "radix-ui\|@radix-ui"` clean on tabs.tsx.

## Left alone

- `src/components/ui/page-filters.tsx` — Tabs consumer inside ui/; its `(v: string) => void` handler type remains assignable, no edit needed.

## Behavior changes

- **Keyboard activation mode** (flagged, not patched): Radix defaults to AUTOMATIC activation (arrow-key focus activates the tab); Base UI 1.x defaults to MANUAL (arrow keys move focus, Enter/Space activates). The base shadcn registry accepts the manual default, so we match it. Opt-in restore: `<TabsList activateOnFocus>` per surface if anyone complains.
- Base UI has a default active tab (first tab, value `0`) when no `value`/`defaultValue` is set; Radix had none. All our surfaces pass value/defaultValue explicitly, so no visible change.
- Hidden panels: Radix marked active state (`data-state=active`); Base UI marks hidden state (`data-hidden`). No consumer styled on the old attribute.
- `onValueChange` gains `(value, eventDetails)` — all consumers are single-arg, unaffected.

## Verify by hand

1. `/dashboard/settings`: click between tabs — active pill styling + line-variant underline render as before.
2. Focus the tab list, press ArrowRight: focus moves but the panel should NOT switch until Enter/Space (new manual activation — confirm it feels acceptable).
3. Inbox page filter tabs (PageFilterTabs) still filter rows on click.
4. Vertical tabs (if any surface uses orientation="vertical") keep the right-edge underline.
