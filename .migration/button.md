# button

2026-07-16, transformation engine (legacy style `new-york` — classification only, no golden replay; file was CUSTOMIZED vs golden: extra `xs`/`icon-*` sizes, `data-variant`/`data-size` attrs, form-submit `type` fix). Verdict: migrated to the real `@base-ui/react/button` primitive; all `asChild` call sites swept to `render`.

## Changed

- `src/components/ui/button.tsx` — `Slot` from `radix-ui` replaced with `Button as ButtonPrimitive` from `@base-ui/react/button` (hard rule: real primitive, not a hand-rolled useRender wrapper). `asChild` prop removed; `render` passes through. The hand-rolled `resolvedType` fix is deleted because Base UI's `useButton` already defaults `type="button"` on native buttons (verified in `node_modules/@base-ui/react/internals/use-button/useButton.js`, `mergeProps({...}, { type: 'button' })`) — explicit `type="submit"` still overrides. Wrapper infers `nativeButton={render === undefined}` so link renders don't hit Base UI's dev-mode "expected a native button" error; pass `nativeButton` explicitly when `render` is a real `<button>`. cva class string unchanged (Button stays a native `<button>`, so `disabled:*` variants stay live).
- Consumer sweep, `asChild` → `render` (children hoisted to Button children, bare element into `render`):
  - `src/client/layouts/PublicLayout.tsx` (2), `src/client/layouts/PublicAppLayout.tsx` (2)
  - `src/client/modules/settings/components/SecuritySection.tsx` (1, external `<a>`)
  - `src/client/modules/_template/pages/CatalogPage.tsx` (1), `src/client/modules/_template/pages/IndexPage.tsx` (1)
  - `src/client/modules/auth/VerifyEmailPage.tsx` (1)
  - `src/client/modules/projects/pages/ProjectPage.tsx` (2)
  - `src/client/modules/admin/pages/AdminPage.tsx` (2)
  - `src/client/modules/agents/pages/AgentsPage.tsx` (1)
  - `src/client/modules/routines/pages/NewRoutinePage.tsx` (1), `src/client/modules/routines/pages/RoutinesPage.tsx` (1)
  - `src/client/modules/knowledge/pages/KnowledgePage.tsx` (1)
  - `src/client/modules/jobs/pages/JobDetailPage.tsx` (1)
  - `src/client/modules/skills/pages/SkillDetailPage.tsx` (2)
  - `src/client/modules/help/pages/HelpPage.tsx` (1)
  - `src/client/pages/LandingPage.tsx` (4, two `<Link>`, two external `<a>`), `NotFoundPage.tsx` (2), `AcceptInvitationPage.tsx` (2), `DashboardPage.tsx` (2)
  - `src/components/ui/alert-dialog.tsx:137-167` — AlertDialogAction/Cancel used `<Button asChild>` around radix primitives; rewired to `render={<AlertDialogPrimitive.Action|Cancel/>}` + `nativeButton` (they render real buttons). Only the Button call site changed; alert-dialog's radix primitives untouched (later batch).
  - `src/components/ui/combobox.tsx:66-76` — InputGroupButton (a Button wrapper) used `asChild` around `<ComboboxTrigger/>`; rewired to `render` + `nativeButton`.
  - `src/components/ai-elements/prompt-input.tsx:1138` — `handleClick` param retyped to the Button `onClick` param type (Base UI augments the event with `preventBaseUIHandler`), so `onClick?.(e)` type-checks.

Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/button.tsx` → no matches.

## Left alone

- `src/components/ui/alert-dialog.tsx`, `src/components/ui/combobox.tsx` — their own primitives (radix alert-dialog; combobox is already Base UI) untouched; only Button call sites edited.
- `SidebarMenuButton asChild` / `ListRow asChild` / all `*Trigger asChild` usages — different components (sidebar, list-row, dialogs, dropdowns…), later batches.
- `buttonVariants` consumers that only use the class string (no primitive involvement) — unchanged by design.

## Behavior changes

- **Links styled as buttons gain `role="button"` + Space-key activation.** Base UI's non-native button handling (`nativeButton={false}`, inferred for all `render` call sites) adds `role="button"` and activates on Space; radix `Slot` kept pure link semantics. Enter still performs native link navigation (Base special-cases valid `<a href>`). Screen readers will announce these links as buttons.
- `type="button"` defaulting moved from wrapper code into the primitive — same net behavior (accidental form submits still prevented; explicit `type` wins).
- Disabled native buttons behave the same; Base additionally supports `focusableWhenDisabled` (default false = radix behavior).

## Verify by hand

1. Landing page: click "Try it live" (Link render) and "View on GitHub" (anchor render) — both navigate; Enter and Space both activate them from keyboard.
2. Open any confirm dialog (e.g. delete a skill) — Action/Cancel buttons still close the dialog and keep their variant styling.
3. In chat, the PromptInput submit button still submits, and clicking while streaming stops generation (type="button" default — no accidental form submit/page reload on "New chat").
4. Combobox (e.g. routine pickers): the chevron trigger opens the popup and hides when the clear button shows.
