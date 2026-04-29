# Next Primitives Sweep — 2026-04-29

Audit of `src/client/modules/` to find the next layer of patterns that
deserve to be lifted into the design-system contract. Investigation
spent ~90% on patterns repeated 3+ times. Citations are file:line.

## Ranked recommendations

| # | Primitive / Contract | Replaces | Priority | Effort | Files affected |
|---|---|---|---|---|---|
| 1 | **`<Spinner>` adoption sweep** (replaces all hand-rolled `Loader2 animate-spin`) | 145 raw `<Loader2 .. animate-spin />` instances across 30+ files | **P0** | M (1-2 hrs, mostly mechanical) | ~30 modules |
| 2 | **`<StatusPill kind=… label=…>`** primitive | Two private `StatusBadge` impls + ~20 inline `text-[10px]` variant=`outline` badges | P0 | S (1 hr) | connectors, approvals, organizations, settings, routines |
| 3 | **`formatDateTime` family in `shared/format/datetime.ts`** + `<Time>` component | 3 private `formatTime` / `formatDate` helpers + 13 files importing `formatDistanceToNow` directly + 8 raw `toLocaleDateString` | P0 | M (2 hrs incl. component + adopt) | activity, admin, settings, organizations, comments, inbox, chat |
| 4 | **`<CopyButton value=… label?=…>`** primitive + global `useCopy()` hook | 12 `navigator.clipboard.writeText` + 7 different toast strings + 3 different "copied" state machines | P1 | S (1 hr) | invitations, settings, chat, spaces, admin, files, projects |
| 5 | **`<IdentityRow user|org|member size>`** (avatar + name + email/role) | 4 hand-rolled Avatar+name+email blocks (each its own initials function) | P1 | M (2 hrs) | members, comments, admin, switcher |
| 6 | **`<SearchInput>`** primitive (icon + input + optional clear) | 9 different absolute-positioned Search-icon-in-Input recipes with drift in icon size (h-4 w-4 vs size-3.5 vs size-4 vs h-4 w-4) | P1 | S (45 min) | admin, projects, artifacts, spaces, chat sidebar, routines pickers, connectors |
| 7 | **`<ActionPagination page totalPages onPrev onNext>`** | Hand-rolled prev/next button pair in admin + activity (different copy, different layout) | P2 | S (30 min) | admin/UsersTabContent, activity/ActivityPage |
| 8 | **Confirm-dialog contract** ("use `<ConfirmDialog>` for binary destructive — never raw `<AlertDialog>` or hand-rolled state") | 4 `ConfirmDialog` imports + 4 hand-rolled `AlertDialog`+`useState` re-implementations | P2 | XS (rule + 4 conversions) | connectors, organizations, chat |
| 9 | **Toast copy contract** + `toastSuccess.copied / toastError.copyFailed` helpers | "Copy failed — long-press" vs "Could not copy — long-press the link" vs silent vs window.prompt | P2 | XS (rule + helper) | (rolls into #4) |
| 10 | **Status-color contract** ("never raw `bg-amber-500/10 text-amber-700 dark:text-amber-400` — use `STATUS_SOFT_BG.warning`") | ~15 inline raw amber/red/emerald patterns despite STATUS_SOFT_BG existing | P2 | XS (rule + sweep) | inbox, gmail/docs renderers, activity, files, approvals |
| 11 | **`<ButtonSpinner>` slot inside Button** ("loading prop" pattern) | ~50 buttons with `{isPending ? <Loader2 .. /> : 'Save'}` ternaries with drift in icon size + spacing | P2 | S | connectors, organizations, projects, spaces, admin |
| 12 | **`<MetricChip>`** for inline "23 tokens" / "12 chars" counts | 11 inline `tabular-nums` spans with drift in font-size + position | P3 | XS | chat, projects, notifications, settings |

---

## Findings — primitives to add

### 1. `<Spinner>` is the biggest single drift in the codebase

`src/components/ui/spinner.tsx` exists and exports a `<Spinner>` that
wraps Loader2Icon with `size-4 animate-spin` defaults. **It is imported
zero times outside the primitives folder.**

Meanwhile, `Loader2 .. animate-spin` is hand-rolled **145 times** across
30+ files, with size drift across the whole scale:

| Size | Examples |
|---|---|
| `size-3` | `OrgSwitcher.tsx:181`, `InvitationsList.tsx:28`, `RoutinesPage.tsx:101` |
| `size-3.5` | `CreateOrganizationDialog.tsx:130`, `InviteMemberDialog.tsx:140`, many more |
| `size-4`/`h-4 w-4` | `OrganizationSection.tsx:409`, `StubConnectorPanel.tsx:193`, `ConnectionDetail.tsx:218` |
| `size-5`/`h-5 w-5` | `MembersList.tsx:54`, `ConnectionDetail.tsx:146`, `ConnectorsPage.tsx:187` |
| `size-6` | `OrganizationPage.tsx:58` |
| `h-3.5 w-3.5` | `ConnectionDetail.tsx:463` |

**Proposed shape**:
```tsx
<Spinner size="sm" />        // size-3.5 (in-button)
<Spinner size="md" />        // size-4 (default; in-row)
<Spinner size="lg" />        // size-5 (page-blocking)
<Spinner aria-label="Loading conversations" />
```

`size-3.5` is the most-used single value (60+ instances), so make it
the default. Add `<ButtonSpinner>` as a thin wrapper that exports
`size="sm"` + `mr-1.5` for the in-button case (see #11).

### 2. `<StatusPill>` — two parallel implementations + inline drift

Two distinct `StatusBadge` private functions:

- `src/client/modules/connectors/pages/ConnectorsPage.tsx:326-333` —
  uses `STATUS_SOFT_BG.success` for connected, raw `outline` for pending,
  raw `destructive` for error
- `src/client/modules/approvals/pages/ApprovalsPage.tsx:455-470` — uses
  raw amber/blue/emerald hex maps with icon prefixes

Plus inline status-pill patterns:
- `RoutinesPage.tsx:154` — `<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 leading-3">Disabled</Badge>`
- `RoutineDetailPage.tsx:95` — `<Badge variant="outline">Disabled</Badge>`
- `MicrosoftWorkspacePanel.tsx:148`, `StubConnectorPanel.tsx:134` —
  identical "Connected" badge with `bg-green-500/10 text-green-700 dark:text-green-400`
- `OrganizationPage.tsx:117`, `MembersList.tsx:117` — outline role badge

**Proposed shape**:
```tsx
<StatusPill kind="success" label="Connected" icon={<CheckIcon />} />
<StatusPill kind="warning" label="Pending" />
<StatusPill kind="danger" label="Failed" />
<StatusPill kind="neutral" label="Disabled" />
<StatusPill kind="info" label="Approved" />
```

Internally maps `kind` to `STATUS_SOFT_BG[…]` plus a sensible icon
default. Standardises on `text-[10px] px-1.5 py-0 gap-1` size — that's
already what 80% of inline pills use.

### 3. Date / time / duration formatting has no single source of truth

Three private `formatTime` / `formatDate` functions:

- `ApiTokensSection.tsx:38-46` — `toLocaleDateString('en-US', {...})`
- `ActivityPage.tsx:81-87` — `formatDistanceToNow` wrapped with try/catch
- `ToolErrorsTabContent.tsx:35` — same pattern as Activity
- `_shared.tsx:241-255` — `formatToolDate` with smart short-form
  (today=time, this-week=weekday, else=month/day) — the most useful
  but only used in tool-renderers

13 files import `formatDistanceToNow` directly. 8+ files call
`toLocaleDateString` / `toLocaleTimeString` inline.

Cite the worst:
- `ConversationSidebar.tsx:53-58` — bespoke "X minutes ago" calculation
- `MembersList.tsx:121` + `parseDate(m.createdAt)` (handles both ISO + epoch sec)
- `InvitationsList.tsx:75` — "Expires {formatDistanceToNow(...)}"
- `SessionsSection.tsx:155` — "Last active {formatDistanceToNow(...)}"
- `CommentsList.tsx:86` — naked `formatDistanceToNow`
- `inbox/InboxPage.tsx:200,253` — multiplies by 1000 for epoch-sec

**Proposed shape** — `src/shared/format/datetime.ts`:
```ts
export function formatRelative(input: Date | string | number): string  // "5 minutes ago"
export function formatShort(input: ...): string         // "Apr 24" or "10:42 am" or "Mon"
export function formatAbsolute(input: ...): string      // "24 Apr 2026, 10:42 am"
export function formatDuration(ms: number): string      // "2h 13m" or "3.4s"
export function parseTimestamp(raw: number | string): Date  // handles epoch-sec, epoch-ms, ISO
```

Plus a `<Time value display="relative|short|absolute" />` component
that renders with `<time>` semantics + `title=` tooltip showing the
absolute. That removes the 8+ occurrences of `tabular-nums` formatting
under timestamps and gives screen readers a clean DOM contract.

### 4. `<CopyButton>` + `useCopy()` — 12 instances, 7 different toast strings

Citations: `InvitationsList.tsx:38`, `InviteMemberDialog.tsx:78`,
`ApiTokensSection.tsx:126`, `PreferencesSection.tsx:312`,
`MessageRenderer.tsx:84`, `ArtifactViewer.tsx:79`, `ExtractPage.tsx:113`,
`SpaceHeaderMenu.tsx:79`, `MessageMoreMenu.tsx:65`, `UserList.tsx:158`,
`FileList.tsx:131`, `ConnectionDetail.tsx` (email copy in error path).

Drift inventory:
- **Success copy**: "Link copied", "Token copied to clipboard",
  "Email copied", "Shareable link copied to clipboard", silent
- **Error copy**: "Copy failed — long-press to copy manually",
  "Could not copy — long-press the link to copy manually",
  "Clipboard blocked", silent, `window.prompt` fallback
- **Visual feedback**: most use `setCopied(true)` + 2s timeout +
  Check↔Copy icon swap. Some don't.

**Proposed shape**:
```tsx
<CopyButton value={url} successMessage="Link copied" size="sm" />
// or
const { copy, copied } = useCopy()
<Button onClick={() => copy(url, { successMessage: 'Email copied' })}>
  {copied ? <Check ... /> : <Copy ... />} Copy
</Button>
```

Default success message is "Copied". Default error message is "Copy
failed". Helper handles the icon flip automatically.

### 5. `<IdentityRow>` — avatar + name + email/role

Four hand-rolled implementations of "circular initials avatar + name
line + secondary line":

- `OrgSwitcher.tsx:195-211` — `Avatar({ name, size })` private fn,
  `(name?.trim()?.[0] ?? '?').toUpperCase()`
- `MembersList.tsx:197-200` — `Avatar({ member })` private fn,
  `member.user.name ?? member.user.email).trim()[0]?.toUpperCase()`
- `CommentsList.tsx:78-82` — `<Avatar className="size-7 shrink-0">` +
  `comment.userId.slice(0, 2).toUpperCase()` (different initial logic!)
- `UserList.tsx` (admin) — uses shadcn Avatar directly

Each computes initials differently — Comments uses **userId** prefix
which is essentially garbage to the user.

**Proposed shape**:
```tsx
<IdentityRow
  name={user.name}
  secondary={user.email}
  imageUrl={user.image}
  size="sm" | "md" | "lg"
  rightSlot={<RoleBadge role={...} />}
/>
```

Standardises initials calculation to first letter of name (fallback
email, fallback "?"), enforces shadcn Avatar component, gives one
spot for image-loading fallback behaviour.

### 6. `<SearchInput>` — 9 hand-rolled icon-in-input recipes

The CSS recipe `relative` + `absolute left-3 top-1/2 -translate-y-1/2`
+ `<Input className="pl-9">` is repeated everywhere with subtle drift:

| File:line | Icon size | Input padding | Color |
|---|---|---|---|
| `admin/UsersTabContent.tsx:110` | `h-4 w-4` | `pl-9` | `text-muted-foreground` |
| `connectors/ManageToolsDialog.tsx:154` | `h-4 w-4` | `pl-9` | `text-muted-foreground` |
| `chat/ConversationSidebar.tsx:407` | `size-3.5` | `pl-7` | `text-muted-foreground/50` |
| `chat/ArtifactsPage.tsx:86` | `size-4` | (separate input) | `text-muted-foreground pointer-events-none` |
| `projects/ProjectsIndexPage.tsx:66` | `size-4` | (separate input) | `text-muted-foreground pointer-events-none` |
| `routines/RoutinePickers.tsx:145,308` | `size-3.5` | `pl-7` | `text-muted-foreground` |
| `spaces/SpacesIndexPage.tsx:90` | `size-4` | (separate input) | (slightly different) |
| `spaces/SearchInSpacePane.tsx:39` | `size-4` | (none — flex) | (none) |

Plus `connectors/ConnectorsPage.tsx:414` uses `placeholder="Search…"` raw.

**Proposed shape**:
```tsx
<SearchInput
  value={search}
  onChange={setSearch}
  placeholder="Search projects…"
  size="sm" | "md"        // sm = h-7, md = h-9
  showClearButton          // adds × button when value is non-empty
/>
```

### 7. `<ActionPagination>` — two prev/next implementations

- `admin/UsersTabContent.tsx:157-184` — "Page 1 of 3" + Previous/Next
  buttons with `<ChevronLeft className="h-4 w-4" />`, `border-t pt-4`
- `activity/ActivityPage.tsx:251-272` — "Page 1" only (no total) +
  Previous/Next buttons, different layout

The shadcn `pagination.tsx` primitive exists in `components/ui/` but
it's the page-number variant — overkill for these two cases.

**Proposed shape**:
```tsx
<ActionPagination
  page={page}
  totalPages={totalPages}    // optional — falls back to "Page N" only
  hasMore={hasMore}          // optional — alternate to totalPages
  onPrev={() => setPage(p => p - 1)}
  onNext={() => setPage(p => p + 1)}
/>
```

---

## Findings — contracts to document

### A. Confirm vs AlertDialog contract

**Rule**: For destructive binary confirmations ("Are you sure you want
to remove X?"), use `<ConfirmDialog>`. Never re-invent with
`<AlertDialog>` + `useState` boilerplate.

Drift evidence:
- ✅ Adopted: `MembersList.tsx:173` (ConfirmDialog), `OrganizationPage.tsx:180` (ConfirmDialog)
- ❌ Hand-rolled: `GoogleWorkspacePanel.tsx:55,250-258` (AlertDialog + `confirmOpen` state),
  `MicrosoftWorkspacePanel.tsx` (same), `StubConnectorPanel.tsx` (same),
  `ConnectorsPage.tsx:319-321` (AlertDialog inline at end of card)

**Recommended location**: `docs/PRIMITIVES.md` "Anti-primitives" table +
add row to PAGE_GRAMMAR.md decision tree ("Are you confirming destructive
work? → ConfirmDialog").

### B. Toast microcopy contract

**Rule**: Standardise the verb-tense and the "manual fallback" hint.

Drift evidence (toast strings):
- "Copy failed — long-press to copy manually" vs "Could not copy — long-press the link to copy manually"
- "Connect failed" vs "Connection failed" vs "Connect failed" (with description)
- "Disconnected" vs "Microsoft 365 disconnected" — inconsistent on whether to name the provider
- "Could not create project. Please try again." vs "Could not create project from template. Please try again." — inconsistent (long-form sentences) versus the 2-3 word style used everywhere else

**Recommended shape**: Add `src/client/lib/toast-helpers.ts`:
```ts
export const toastCopySuccess = (label = 'Copied') => toast.success(label)
export const toastCopyFailed = () => toast.error('Copy failed — long-press to copy manually')
export const toastSavedX = (x: string) => toast.success(`${x} saved`)
export const toastDeletedX = (x: string) => toast.success(`${x} deleted`)
export const toastFailedToX = (verb: string, err?: unknown) =>
  toast.error(`Failed to ${verb}`, { description: errorMessage(err) })
```

Plus document the rule in `docs/VOCABULARY.md` (a microcopy section).
Two-word toasts default. Provider-named toasts only when the action
is provider-specific from outside its own surface.

### C. Status colour contract — never raw amber-500/10

**Rule**: For semantic status indicators, use `STATUS_SOFT_BG[kind]`,
`STATUS_TEXT[kind]`, or `STATUS_SOLID[kind]` from `client/lib/status-colors.ts`.
Never raw `bg-amber-500/10 text-amber-700 dark:text-amber-400`.

Drift evidence (raw colors that should be helpers):
- `inbox/InboxPage.tsx:288` — `medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40'`
- `chat/tool-renderers/gmail.tsx:253` — inline amber container
- `chat/tool-renderers/docs.tsx:105` — inline amber container
- `chat/ChatPage.tsx:1168` — inline amber banner
- `chat/ToolApproval.tsx:24,26` — inline amber border + container
- `activity/ActivityPage.tsx:69-78` — full amber/red/emerald/indigo/etc map
- `files/FileList.tsx:189-191` — inline red + amber maps
- `approvals/ApprovalsPage.tsx:209` — inline amber pill
- `spaces/CreateSpaceModal.tsx:280` — inline emerald

**Recommended location**: Add to `docs/PRIMITIVES.md` "Anti-primitives"
+ add a verification grep recipe.

### D. Button-size + icon-size contracts

**Rule**: Buttons use shadcn `size="default" | "sm" | "icon"` + icons
inside use `size-3.5` (for sm/icon) or `size-4` (for default). Do not
hand-roll heights via `className="h-7 px-2 text-xs"`.

Drift evidence:
- `MembersList.tsx:129` — `className="h-7 w-7 shrink-0"` for icon button
- `comments/CommentsList.tsx:101,106` — `size="sm" className="h-7 gap-1 text-xs"`
- `InvitationsList.tsx:82` — `className="gap-1 h-7"` instead of `size="sm"`
- `connectors/ConnectionDetail.tsx:606` — `className="h-7 text-xs font-mono"` (input not button, but same drift pattern)
- `ManageToolsDialog.tsx:145` — `className="h-7 text-xs"`
- `chat/ChatPage.tsx:989` — `className="h-7 shrink-0 ..."`

The h-7 pattern wants a `size="xs"` button. shadcn doesn't ship one;
this is a real gap. **Add `size="xs"` to button variants** (h-7 px-2.5 text-xs).

**Recommended location**: Document in PRIMITIVES.md + add `xs` to button
variants. After that, anti-pattern rule "no className h-7 on Button".

### E. Icon size contract

**Rule**: Three icon sizes only — `size-3.5` (in compact rows / button
content), `size-4` (default body / card), `size-5` (page-loading / hero).
Never `size-3`, `h-4 w-4` (mixed style), or `size-6`.

Drift evidence: 145 spinner instances + ~80 non-spinner Lucide icons
mixing `h-4 w-4` and `size-4` — same value, two syntaxes.

**Recommended location**: `docs/VOCABULARY.md` icon size section + grep
recipe `grep -rn 'h-3.5 w-3.5\|h-4 w-4\|h-5 w-5' src/client/modules/`
should be near zero.

---

## Findings — visual drift (small wins)

### Card padding inconsistency
- `MembersList.tsx:102` — `px-3 py-2.5` for list rows
- `connectors/ConnectorsPage.tsx` — Card with various paddings
- Routines pages — Cards with `p-3` and `p-4` mixed

ListRow already enforces this; the wins come from migrating list-shaped
content into ListRow.

### Heading hierarchy in SubSections
`<CardTitle className="text-sm">` (`InvitationsList.tsx:57`) vs
`<h3 className="text-sm font-medium">` vs `<Section title="Pending"`).
Already covered by `<Section>` primitive — these are pages that haven't
adopted yet.

### Inline `text-[10px]` and `text-[11px]` (223 occurrences)
Most are legitimate metadata text. But this is way over-used:
- Badges: `text-[10px] px-1.5 py-0` — should be StatusPill default
- Member meta: `text-[11px] text-muted-foreground` — should be
  `<MetaText>` or just `<small>`
- Add to VOCABULARY.md: arbitrary text sizes are a flag — prefer
  `text-xs` (12px) or `text-[11px]` only for dense tables.

### `<details>` outside HelpDisclosure
- `routines/RoutineDetailPage.tsx:194` — uses `<details>` with bespoke styling
- `approvals/ApprovalsPage.tsx:223` — `<details className="group">`
- `chat/_shared.tsx:191,201` — `<details className="group">` (tool-renderers)
- `chat/ChatMessage.tsx:56` — `<details key={i}`
- `video/VideoInputExamplePage.tsx:243` — `<details className="mt-4">`

PRIMITIVES.md already says HelpDisclosure is canonical. These are
candidates to migrate or to extend HelpDisclosure with a `nested` /
`compact` variant.

---

## What we DON'T need yet

These showed up in the sweep but only hit 1-2 places. Flag for later;
not worth lifting now.

| Pattern | Where | Why defer |
|---|---|---|
| **Breadcrumbs** | Imported in `client/components/Breadcrumbs.tsx` but not used anywhere in `modules/` | DetailHeader is doing the back-link job. Breadcrumbs only matter when there's deep nesting; we don't have that. |
| **Drag-drop file zone** | Only `files/FileUploader.tsx` and `chat/ChatInput.tsx` (via dropzone) | Adopt the shared FileUploader if a third site needs it. |
| **PasswordStrengthMeter** | One usage in auth | Single-purpose, fine as-is. |
| **InlineEdit** | One Card title in projects | Single use; lift only if a 2nd surface adopts. |
| **Empty/EmptyState dual primitives** | Two Empty primitives exist (`components/ui/empty-state.tsx` + `client/components/EmptyState.tsx`) | PRIMITIVES.md already calls this out. Sweep candidate but already documented. |
| **Tag groups** | Only `chat/tool-renderers/memory.tsx:57` (`tags.map`) | Single occurrence. Don't lift. |
| **Pagination (page numbers)** | Existing shadcn `pagination.tsx`, never used | Skip — we use `ActionPagination` (#7) instead. |
| **Cmd palette / KeyboardShortcuts** | Already global, used app-wide | Already lifted. |

---

## Suggested execution order

If acted on as a single sprint, do in this order — each builds on
the prior and doesn't conflict:

1. **#1 Spinner sweep** — pure mechanical replacement, biggest visual win
2. **#3 datetime helpers** — drop in `shared/format/datetime.ts`,
   migrate ad-hoc `formatTime`/`formatDate` to imports, leave
   `formatToolDate` in `_shared.tsx` (chat-specific compact form)
3. **#2 StatusPill** — small primitive, replaces 2 private functions + drift
4. **#4 CopyButton + useCopy** — encapsulates the toast-copy contract (#9)
5. **#6 SearchInput** — pulls 9 sites onto one shape
6. **#5 IdentityRow** — bigger component; do after StatusPill so the
   role badge slot is the canonical primitive
7. **#11 Button loading prop** — extension of Spinner
8. **#7 ActionPagination** — small, late
9. Document contracts (B, C, D) in PRIMITIVES.md after the helpers exist

Total estimate: 1.5-2 days of focused work. Cuts ~600 lines of
duplicate boilerplate, removes 145 hand-rolled spinner declarations,
and stops the tail-of-time formatting drift in one go.
