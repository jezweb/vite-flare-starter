# alert-dialog

2026-07-16, transformation engine (legacy style `new-york`, classification only — file is CUSTOMIZED: `size` variant, `AlertDialogMedia`, Button-composed Action/Cancel from the batch-1 button migration). Verdict: Overlay→Backdrop, Content→Popup, Cancel→Close; Action composed on Close to preserve radix auto-close; 3 consumer files fixed.

## Changed

- `src/components/ui/alert-dialog.tsx` — import `radix-ui` → `@base-ui/react/alert-dialog`. Part rewires: `Overlay` → `Backdrop`, `Content` → `Popup` (centered modal, no Positioner), `Cancel` → `Close`. Prop types moved to `AlertDialogPrimitive.Part.Props`. Class rewrites: `data-[state=open/closed]:` → `data-open:`/`data-closed:` on Backdrop + Popup (tw-animate idiom keyed on presence attrs, matching the base-nova golden). All `size`/Media/group-data classes kept verbatim.
  - `AlertDialogCancel` — now `<AlertDialogPrimitive.Close render={<Button variant size/>} />` (golden shape; replaces the batch-1 `Button render={<Cancel/>}` inversion).
  - `AlertDialogAction` — Base UI has NO Action primitive. **Deliberate divergence from the base-nova golden** (which ships Action as a plain non-closing Button): we compose `AlertDialogPrimitive.Close` with `data-slot="alert-dialog-action"` so radix's "Action closes the dialog after onClick" survives — `SessionsSection` uses an uncontrolled AlertDialog that relies on it. Sanctioned shape per overlays.md ("reuse AlertDialog.Close with action semantics in the wrapper"). Rationale comment left in the file.
- `AlertDialogTrigger asChild` → `render` at: `src/client/modules/settings/components/SessionsSection.tsx:197`, `src/client/pages/ComponentsPage.tsx:552`, `src/client/pages/StyleGuidePage.tsx:1311`.

Leftover scan clean: `grep -n "radix-ui\|@radix-ui"` on all files above plus `confirm-dialog.tsx` → no matches.

## Left alone

- `src/components/ui/confirm-dialog.tsx` — composition over the public alert-dialog wrappers; controlled `open` + `onOpenChange`, no radix-only props. Works unchanged.
- Other AlertDialog consumers (ConversationSidebar, UserList, FileList, SkillDetailPage, connectors panels/pages) — controlled dialogs using AlertDialogAction/Cancel with onClick handlers only; type-safe and behavior-preserved via the Close-composed Action.

## Behavior changes

- **Initial focus**: radix alert-dialog focuses the Cancel button on open; Base UI focuses the first tabbable element in the popup (usually Cancel anyway given footer order, but not guaranteed — e.g. a dialog with an input focuses the input). Flagged, not patched; pass `initialFocus={cancelRef}` per-dialog if the radix behavior is wanted.
- **Action semantics**: kept radix auto-close (see above) — this intentionally does NOT match the base registry's plain-Button Action. If a future consumer wants "action that keeps the dialog open", use a plain `<Button>` in the footer instead of `AlertDialogAction`.
- Base UI AlertDialog is always modal and never closes on outside press — same as radix. ESC still closes.
- `onOpenChange` gains `(open, eventDetails)` — all consumers use single-arg handlers; type-safe.

## Verify by hand

1. Settings → Sessions → "Log Out of All Other Sessions": dialog opens, Cancel closes, Action runs the revoke and closes the dialog afterwards (uncontrolled auto-close path).
2. Any ConfirmDialog flow (delete a file / conversation): spinner state on Action, dialog closes when the parent flips `open`.
3. Tab order on open: note which element gets focus (first tabbable, not necessarily Cancel).
4. Click outside the dialog: nothing happens (alert dialogs don't dismiss on outside press); ESC closes.
