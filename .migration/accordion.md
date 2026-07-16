# accordion

2026-07-16, transformation engine (legacy style `new-york`, classification only). Verdict: Content → Panel, height animation restated as Base UI transition idiom, 1 consumer call-site fixed.

## Changed

- `src/components/ui/accordion.tsx` — import `radix-ui` → `@base-ui/react/accordion`; types to `AccordionPrimitive.{Root,Item,Trigger,Panel}.Props`.
  - `AccordionTrigger`: chevron-rotation hook `[&[data-state=open]>svg]` → `[&[data-panel-open]>svg]` (Base UI trigger emits `data-panel-open`, not `data-open`). Added `aria-disabled:pointer-events-none aria-disabled:opacity-50` alongside kept `disabled:*` (Base UI accordion trigger surfaces disabled as `aria-disabled`).
  - `AccordionContent`: `AccordionPrimitive.Content` → `AccordionPrimitive.Panel`. Animation restated: `data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down` (tw-animate keyframes that read `--radix-accordion-content-height`, which Base UI never sets) → `h-(--accordion-panel-height) transition-[height] duration-200 ease-out data-starting-style:h-0 data-ending-style:h-0` per class-mapping.md's animation idiom. **Deliberate deviation from wrapper-shapes.md**: those classes are on the Panel itself, not the inner div — Base UI emits `data-starting-style`/`data-ending-style`/`--accordion-panel-height` only on the Panel element (verified in `AccordionPanelDataAttributes.d.ts`); on the inner div the selectors could never match. Padding stays on the inner div so the height measurement doesn't jump (same split as radix shadcn).
- `src/client/pages/ComponentsPage.tsx:432` — `<Accordion type="single" collapsible>` → `<Accordion>` (Base UI single mode is the default and always collapsible; `type`/`collapsible` props no longer exist).

Consumer sweep: ComponentsPage is the only consumer. No `value`/`defaultValue`/`onValueChange` used anywhere (so the always-array value model change has zero call-site impact). No `type="multiple"` usage.

Leftover scan: `grep -n "radix-ui\|@radix-ui"` clean on accordion.tsx and ComponentsPage.tsx.

## Left alone

- tw-animate's `animate-accordion-down/up` utilities remain in the CSS layer (used by nothing now in this repo for accordion; collapsible keeps its own vars — collapsible was migrated in batch 1 separately).

## Behavior changes

- Radix `collapsible={true}` (the consumer set it) → Base UI single mode is always collapsible: identical behavior here. Forks that relied on radix's default `collapsible={false}` (can't close the last item) would need to control `value` — not used in this repo.
- Animation is now a CSS height transition (200ms ease-out) instead of keyframes (0.2s ease-out) — visually equivalent.
- Roving arrow-key focus between triggers was removed by Base UI (APG guidance change); Home/End/arrow navigation across accordion headers no longer moves focus. Flagged, not patched.
- `value`/`onValueChange`, if adopted later, are always arrays in Base UI (even single mode).

## Verify by hand

1. `/dashboard/components` → Accordion card: click "Is it accessible?" — panel slides open smoothly (height transition), chevron rotates 180°.
2. Open item 2 — item 1 closes (single mode); click item 2's trigger again — it closes (collapsible parity).
3. Keyboard: Tab to a trigger, Enter/Space toggles. Arrow keys no longer move between triggers (expected Base UI behavior).
