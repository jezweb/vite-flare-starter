# collapsible

2026-07-16, transformation engine (legacy style `new-york`, classification only; wrapper matched golden apart from formatting). Verdict: Content → Panel rename in the wrapper; five consumer files swept (asChild trigger, animation classes, trigger-state chevron).

## Changed

- `src/components/ui/collapsible.tsx` — import swapped to `@base-ui/react/collapsible`; `CollapsiblePrimitive.CollapsibleTrigger` → `.Trigger`, `CollapsiblePrimitive.CollapsibleContent` → `.Panel`. Exported names (`Collapsible`/`CollapsibleTrigger`/`CollapsibleContent`) and `data-slot` attrs unchanged for consumers.
- Consumer sweep:
  - `src/components/nav-main.tsx:134` — `<CollapsibleTrigger asChild><button …>` → `render={<button type="button" …/>}` with children hoisted; manual `aria-expanded` dropped (Base UI sets it on the trigger itself).
  - `src/components/ai-elements/tool.tsx` — trigger gains `group` class; chevron `group-data-[state=open]:rotate-180` → `group-data-panel-open:rotate-180` (Base puts NO state attr on Root, so the old Root-`group` hook is dead; the trigger's `data-panel-open` is the correct hook). Content animate-in/out classes restated as transitions (see below).
  - `src/components/ai-elements/sources.tsx`, `src/components/ai-elements/reasoning.tsx`, `src/client/modules/chat/components/tool-renderers/_shared.tsx` — `data-[state=open]:animate-in data-[state=closed]:animate-out fade/slide-*` keyframe utilities → `transition-all duration-150 data-starting-style:opacity-0 data-starting-style:-translate-y-2 data-ending-style:opacity-0 [data-ending-style:-translate-y-2 where the original slid out]` per the class-mapping animation idiom (intent restated as transitions, not translated 1:1).

Leftover scan: wrapper + sources/tool/_shared/nav-main clean. `reasoning.tsx:3` still imports `@radix-ui/react-use-controllable-state` — a state **utility**, not a UI primitive; intentionally left for the dependency-removal batch (flagged, not migrated).

## Left alone

- `reasoning.tsx` `useControllableState` import (see above).
- `nav-main.tsx` `SidebarMenuButton asChild` (sidebar is a later batch).
- Root-level `group` class on `tool.tsx`'s Collapsible — kept (harmless; other styles may rely on it).

## Behavior changes

- Exit animation now runs as a CSS transition; Base UI keeps the panel mounted until the transition ends (`data-ending-style`), where radix + tw-animate used keyframes. Feel is equivalent at 150ms but not frame-identical.
- Base UI Collapsible Root renders a plain `<div>` with no open/closed data attribute — any future styling must target the Trigger (`data-panel-open`) or Panel (`data-open`/`data-closed`), not Root.

## Verify by hand

1. Sidebar collapsed sections (e.g. Admin group): label click expands/collapses; chevron rotates; keyboard Tab + Enter works on the section trigger.
2. Chat: expand a tool call card — content slides/fades in; chevron flips while open; collapse animates out.
3. Chat reasoning block ("Thought for …"): opens during streaming, closes after; trigger chevron reflects state.
4. Sources footer on a web-search answer: "Used N sources" expands the list.
