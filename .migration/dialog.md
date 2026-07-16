# dialog

2026-07-16, transformation engine (legacy style `new-york`, classification only against the radix golden — file is CUSTOMIZED: DialogFooter `showCloseButton`, formatting). Verdict: Overlay→Backdrop, Content→Popup (centered modal, no Positioner), tw-animate classes rekeyed to `data-open:`/`data-closed:`; 8 consumer files fixed.

## Changed

- `src/components/ui/dialog.tsx` — import `radix-ui` → `@base-ui/react/dialog`. Part rewires: `Overlay` → `Backdrop` (exported name stays `DialogOverlay`), `Content` → `Popup` (no Positioner — centered modal). Prop types moved to `DialogPrimitive.Part.Props`. Class rewrites per class-mapping: `data-[state=open]:` → `data-open:`, `data-[state=closed]:` → `data-closed:` on Backdrop, Popup, and the built-in close button (the base-nova golden keeps the tw-animate `animate-in/out` idiom keyed on `data-open`/`data-closed`, so our exact animation classes survive). DialogFooter's `<Close asChild><Button/></Close>` → `<Close render={<Button variant="outline" />}>Close</Close>` (matches golden shape).
- `src/components/ui/command.tsx` (cmdk wrapper — pure call-site typing fix only) — `CommandDialog` children type narrowed to `React.ReactNode` via `Omit<..., 'children'>` because Base UI `Dialog.Root.Props['children']` widens to allow a payload render function, which broke passing `children` into `<Command>`.
- `src/client/modules/chat/components/ArtifactSidebar.tsx:473` — `onOpenAutoFocus={(e) => e.preventDefault()}` → `initialFocus={false}` on DialogContent (Base UI Popup prop; passes through the wrapper's `...props`).
- `DialogTrigger asChild` → `render` at: `src/client/modules/admin/components/EmailLogsTabContent.tsx:273`, `src/client/modules/files/pages/FilesPage.tsx:50`, `src/client/modules/settings/components/ApiTokensSection.tsx:235`, `src/client/modules/settings/components/SecuritySection.tsx:245`, `src/client/pages/ComponentsPage.tsx:529`, `src/client/pages/StyleGuidePage.tsx:1076`.
- `src/client/modules/settings/components/PreferencesSection.tsx:486` — `asChild` + plain `<button className=...>` child folded into the Trigger itself (Base UI Trigger renders a native `<button>`; className/children moved onto `DialogTrigger` directly).

Leftover scan clean: `grep -n "radix-ui\|@radix-ui"` on all files above → no matches.

## Left alone

- `src/components/ai-elements/model-selector.tsx` — re-exports `DialogTrigger` without `asChild`; type flows through unchanged, no edit needed.
- `src/components/ui/confirm-dialog.tsx` — uses alert-dialog, covered in that component's migration.
- `drawer.tsx` (vaul), `command.tsx` cmdk internals, `sonner` — not radix; untouched beyond the CommandDialog typing fix above.

## Behavior changes

- `onOpenChange` now receives `(open, eventDetails)`; all existing consumers use single-arg handlers (`setOpen`), which stay type-safe.
- Focus return on close: Base UI returns focus to the trigger like radix, but the mechanism is `finalFocus` (not `onCloseAutoFocus`); no consumer used `onCloseAutoFocus`. Flagged: subtle focus-return timing differences between the libraries are possible; not patched.
- `initialFocus={false}` (ArtifactSidebar lightbox) is the Base UI equivalent of preventing radix's open-auto-focus; radix left focus on the previously-focused element, Base does the same with `false`. Feel should match; verify by hand.
- The built-in close button's `data-open:bg-accent data-open:text-muted-foreground` classes are inert (Close gets no `data-open` in Base UI) — they were equally inert under radix (`Close` never carried `data-state`); kept for upstream diffability.
- `modal` prop widened (`boolean | 'trap-focus'`) — unused by consumers.
- CommandDialog renders `DialogTitle`/`DialogDescription` (sr-only) OUTSIDE `DialogContent`, directly under Root — same placement as before; Base UI parts only require Root context, so this still wires aria ids. Verified by type-check + build; worth a runtime glance (command palette opens with no console warning).

## Verify by hand

1. Open any dialog (Settings → API Tokens → New Token): fade/zoom-in plays, ESC closes with fade-out, focus returns to the trigger button.
2. Settings → Appearance → Custom theme card still looks identical (trigger is now the button element itself) and opens the dialog.
3. Chat → open an artifact lightbox: focus does NOT jump into the dialog on open; ESC still closes.
4. Cmd+K command palette opens/closes normally, no console warnings.
