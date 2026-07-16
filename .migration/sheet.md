# sheet

2026-07-16, transformation engine (legacy style `new-york`, classification only — file is CUSTOMIZED: `showCloseButton`, formatting). Verdict: radix Dialog composition rewired to Base UI dialog primitives; full-slide tw-animate classes kept, rekeyed to `data-open:`/`data-closed:`; 3 consumer files fixed.

## Changed

- `src/components/ui/sheet.tsx` — import `Dialog as SheetPrimitive` from `radix-ui` → `@base-ui/react/dialog`. Part rewires: `Overlay` → `Backdrop`, `Content` → `Popup` (edge-anchored via our own fixed/inset classes — no Positioner; dialogs don't use one). Prop types moved to `SheetPrimitive.Part.Props`. Class rewrites: `data-[state=open]:` → `data-open:`, `data-[state=closed]:` → `data-closed:` throughout, including the per-side slide classes (`data-closed:slide-out-to-right data-open:slide-in-from-right` etc.) and the asymmetric durations (`data-closed:duration-300 data-open:duration-500`). We deliberately KEPT the full off-screen slide look rather than adopting the base-nova golden's 2.5rem-translate + fade transition idiom — legacy-style rule: their look stays theirs. tw-animate keyed on presence attrs works because Base UI holds the popup mounted until exit animations finish (same idiom the base-nova dialog golden uses).
- `src/client/modules/spaces/pages/SpacePage.tsx:132` — `SheetTrigger asChild` + plain `<button>` child folded into the Trigger itself (className/aria-label/children moved onto `SheetTrigger`, which renders a native button).
- `SheetTrigger asChild` → `render` at: `src/client/pages/ComponentsPage.tsx:602`, `src/client/pages/StyleGuidePage.tsx:1103`.

Leftover scan: `grep -n "radix-ui\|@radix-ui"` clean on sheet.tsx, SpacePage.tsx, ComponentsPage.tsx, StyleGuidePage.tsx. `sidebar.tsx:6` still imports `Slot` from radix-ui — that is sidebar's own asChild machinery, later batch, intentionally untouched.

## Left alone

- `src/components/ui/sidebar.tsx` — later batch. Its mobile branch consumes `Sheet`/`SheetContent` with compatible props (`open`, `onOpenChange` single-arg setter, our `side` prop) — compiles and behaves unchanged, no call-site edit needed.
- `drawer.tsx` (vaul) — not radix; untouched.

## Behavior changes

- `onOpenChange` gains `(open, eventDetails)` — all consumers (incl. sidebar `setOpenMobile`) use single-arg setters; type-safe.
- Built-in close button's `data-open:bg-secondary` is inert (Close carries no presence attr in Base UI) — was equally inert under radix; kept.
- Base UI Portal renders a wrapping `<div>` (radix portalled children directly); `[&>button]:hidden` in sidebar's SheetContent still works — it targets children of the Popup, not the portal.

## Verify by hand

1. Narrow the viewport (<md), open the sidebar via the hamburger: sheet slides fully in from the side, overlay fades; close slides fully out (300ms out / 500ms in feel preserved).
2. Space page on mobile: members button (Users icon) opens the right-hand members sheet; styling of the icon button unchanged.
3. StyleGuide → Sheet demo: opens from the right, ESC and overlay click both close, focus returns to the trigger.
