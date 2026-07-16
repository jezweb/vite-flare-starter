# navigation-menu

2026-07-16, transformation engine (legacy style `new-york`, classification only) with heavy anatomy guidance from the base-nova golden. Verdict: Viewport → Portal>Positioner>Popup>Viewport, Indicator → Icon, `viewport` boolean dropped; zero consumers in the app (pattern-library-only wrapper).

## Changed

- `src/components/ui/navigation-menu.tsx` — import `radix-ui` → `@base-ui/react/navigation-menu`.
  - `NavigationMenu` (root): the `viewport?: boolean` prop is GONE (with it the `data-viewport` attr and the `group-data-[viewport=false]` inline-content mode); root now accepts `align` (forwarded to the auto-rendered `NavigationMenuPositioner`). Base UI's Positioner model replaces both radix modes.
  - New `NavigationMenuPositioner` export — Portal > Positioner (`isolate z-50`, sizing off `--positioner-width/height`/`--available-width`, `data-instant:transition-none`; `sideOffset=6` matches the old `mt-1.5`) > Popup (our border/bg-popover/shadow/rounded-md look, sized by `--popup-width/height`, scale+fade via `data-starting-style`/`data-ending-style` transitions replacing the radix zoom-in-90/out-95 keyframes) > Viewport (`relative size-full overflow-hidden`). **`NavigationMenuViewport` export removed** (replaced by Positioner) — safe: no consumer anywhere in src/.
  - `navigationMenuTriggerStyle` cva: `data-[state=open]:*` → both `data-popup-open:*` and `data-open:*` (golden's belt-and-braces); chevron rotation → `group-data-popup-open:rotate-180 group-data-open:rotate-180`.
  - `NavigationMenuContent`: kept our `data-[motion=…]` classes (Base UI does not emit `data-motion` — inert, retained for golden parity) and added the working equivalents: `transition-[opacity,transform,translate]` + `data-starting-style:opacity-0 data-ending-style:opacity-0`. Dropped the `group-data-[viewport=false]` class block (its trigger attribute no longer exists).
  - `NavigationMenuLink`: `data-[active=true]:*` → `data-active:*` (presence attribute).
  - `NavigationMenuIndicator`: now Base UI `Icon` with a doc comment — see behavior changes.

Leftover scan: `grep -n "radix-ui|@radix-ui"` clean.

## Left alone

- No app consumers to sweep — `navigationMenuTriggerStyle`, `NavigationMenu*` are exported for forks only (verified via repo-wide grep).

## Behavior changes

- **Hover-open delay**: radix `delayDuration` default 200ms → Base UI `delay` default 50ms; menus open noticeably faster on hover. Base adds `closeDelay` (50ms); radix's `skipDelayDuration` window concept is gone. Flagged, not patched — set `delay` on the root per surface if the fast-open feels twitchy.
- **Indicator role change**: radix's Indicator tracked the active trigger along the list (moving arrow); Base UI's `Icon` is a static per-trigger marker exposing only `data-popup-open`. The moving-arrow pattern has no Base UI equivalent — forks using `NavigationMenuIndicator` get a static element.
- Radix `viewport={false}` inline-content mode removed with the prop.
- Popup gains real collision-aware anchored positioning (radix nav-menu had none) — long menus near the viewport edge now flip/shift.
- Directional slide between items: radix `data-motion` is gone; Base UI exposes `data-activation-direction` for forks that want to restore per-direction animation.

## Verify by hand

(No live surface in this app — verify in a fork or scratch page.)
1. Two triggers + contents: hover opens after ~50ms; moving between triggers swaps content inside one shared popup that resizes smoothly.
2. Keyboard: Tab to trigger, Enter opens, arrows move, Escape closes and returns focus.
3. `NavigationMenuLink render={<Link/>}` navigation works and `data-active` styling shows on the current route.
