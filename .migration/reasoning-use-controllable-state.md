# reasoning (use-controllable-state)

2026-07-16, transformation engine (utility-hook replacement, no primitive involved). Verdict: clean; dependency-free local hook with identical semantics.

## Changed

- `src/hooks/use-controllable-state.ts` (new) — small local `useControllableState<T>({ prop, defaultProp, onChange })` replicating `@radix-ui/react-use-controllable-state@1.2.2` semantics, verified against the installed package source before writing:
  - controlled when `prop !== undefined`; setter resolves updaters against `prop` and fires `onChange` only when the value differs, never writing internal state
  - uncontrolled: `useState(defaultProp)`; `onChange` fires post-commit via prev-value ref (no call on mount)
  - setter accepts value or updater fn; `onChange` held in a ref (updated via `useInsertionEffect`) so inline callbacks don't invalidate the setter
  - the dev-only controlled/uncontrolled-switch console warning was NOT replicated (dev ergonomics only, not behavior)
- `src/components/ai-elements/reasoning.tsx:3` — import swapped from `@radix-ui/react-use-controllable-state` to `@/hooks/use-controllable-state`. Both call sites (`isOpen` boolean with `onOpenChange`, `duration` number|undefined without onChange) type-check against the local hook unchanged.

Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ai-elements/reasoning.tsx src/hooks/use-controllable-state.ts` → no matches.

## Left alone

- Everything else in reasoning.tsx — it already composes the Base UI Collapsible wrappers (migrated batch 2) and already uses `data-starting-style`/`data-ending-style` classes.

## Behavior changes

None. Auto-open on streaming, auto-close after 1s, duration tracking, and controlled `open`/`onOpenChange` passthrough all behave identically.

## Verify by hand

- Trigger a chat reply on a reasoning model: the Reasoning block auto-opens while streaming, shows the rotating thinking verb, auto-closes ~1s after the stream ends, and reports "Thought for N seconds".
- Manually toggling the trigger after auto-close keeps working (no re-auto-close loop).
