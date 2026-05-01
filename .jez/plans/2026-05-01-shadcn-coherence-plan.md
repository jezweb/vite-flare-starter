# shadcn coherence — exploration + plan

**Date**: 2026-05-01
**Status**: Survey done, plan drafted, awaiting Jez's pick of which slices to ship
**Linked issue**: none yet (this could become one)

---

## TL;DR

Full shadcn catalog (59 primitives) is now installed after the
2026-04-30 layout-primitives ship. The interesting question becomes:
**where are we hand-rolling things that an installed primitive could
replace, and which installed primitives are sitting unused?**

The audit found:

- **6 primitives 100% unused** in app code (Carousel, HoverCard,
  AspectRatio, InputOTP, ContextMenu, Menubar)
- **1 showcase-only** (Slider — only in StyleGuide / Components page)
- **23 files have hand-rolled `<Label htmlFor + Input>` blocks** that
  could collapse into the shadcn `Field` family (already installed)
- **Sheet under-used** — 5 places, vs 26 Dialog uses; several Dialogs
  are inherently "edit settings without leaving page" tasks where a
  Sheet gives a better workflow
- **Skeleton coverage thin** — 19 files use Skeleton/PageLoading vs
  55 with bare spinners; many list-loading states could be Skeletons
- **Settings page horizontal tabs** at 8 tabs is too tight; vertical
  tabs are the convergent SaaS pattern (Linear / GitHub / Vercel)

This plan is organised by **value × effort**, not by primitive. Each
phase ships independently.

---

## Phases (ordered by ROI)

### Phase A — Field migration sweep (HIGH value, MEDIUM effort, ~60m)

**Goal**: replace hand-rolled `<Label htmlFor="x" /> <Input id="x" />`
blocks with shadcn Field family throughout dialogs + form sections.

**Wins**:
- One canonical pattern instead of 23 variations
- Free description / error slots that we keep adding ad-hoc
- Easier RHF integration when a fork starts using react-hook-form

**Files to migrate** (sample — full list 23):
- `connectors/components/ManageToolsDialog.tsx`
- `organizations/components/CreateOrganizationDialog.tsx`
- `organizations/components/InviteMemberDialog.tsx`
- `projects/components/CreateProjectModal.tsx`
- `projects/components/ShareProjectDialog.tsx`
- `spaces/components/CreateSpaceModal.tsx`
- `spaces/components/SpaceSettingsModal.tsx`
- `admin/components/UserEditDialog.tsx`
- `settings/components/ApiTokensSection.tsx`
- `settings/components/PreferencesSection.tsx`
- `settings/components/SecuritySection.tsx`
- `chat/components/ConversationSidebar.tsx`
- `skills/pages/SkillsPage.tsx` (install dialog only)

**Pattern**:
```tsx
// Before
<div className="space-y-2">
  <Label htmlFor="name">Name</Label>
  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
  <p className="text-xs text-muted-foreground">Used as the display name.</p>
</div>

// After
<Field>
  <FieldLabel htmlFor="name">Name</FieldLabel>
  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
  <FieldDescription>Used as the display name.</FieldDescription>
</Field>
```

**Anti-primitive entry to add to PRIMITIVES.md**:
| Hand-rolled `<Label htmlFor> + <Input>` block | Three different gap sizes drifted across 23 files | Wrap in `<Field>` with `<FieldLabel> + <FieldDescription> + <FieldError>` |

**Verify**: `pnpm type-check` clean. Live: open every migrated dialog +
form, confirm visual rhythm is identical or tighter.

---

### Phase B — Sheet for edit-in-place workflows (HIGH value, LOW effort, ~30m)

**Goal**: convert 3-4 Dialogs that are "edit something complex without
leaving the page" into Sheets (slide-in side panels).

**Why**: Dialogs steal focus aggressively (overlay dim + centre pop-in)
which is right for *confirmations* and *quick decisions*. They're wrong
for *editing tasks* where the user wants to reference the underlying
page. claude.ai uses a Sheet for the "Customize" panel for exactly
this reason — you keep the chat visible while configuring.

**Candidate Dialogs to convert**:
- `ManageToolsDialog` — 30+ tool toggles, user wants to see the
  connection card behind it
- `SpaceSettingsModal` — settings tabs inside a modal feels cramped
- `ShareProjectDialog` — moderate complexity (member list, role
  selector); a Sheet keeps the project structure visible
- `UserEditDialog` (admin) — user metadata + role dropdown

**Keep as Dialog**: `CreateProjectModal`, `CreateSpaceModal`,
`InviteMemberDialog`, `CreateOrganizationDialog` — these are quick
single-decision flows, modal is correct.

**Pattern**:
```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="right" className="sm:max-w-md">
    <SheetHeader>
      <SheetTitle>…</SheetTitle>
      <SheetDescription>…</SheetDescription>
    </SheetHeader>
    {/* body */}
    <SheetFooter>…</SheetFooter>
  </SheetContent>
</Sheet>
```

**Decision rule for CLAUDE.md**:
> Dialog for confirmations + quick single decisions. Sheet for edit
> tasks where the user wants to reference the underlying page.

---

### Phase C — Vertical tabs on Settings (MEDIUM value, LOW effort, ~20m)

**Goal**: convert Settings page's horizontal 8-tab strip to vertical
tabs on `lg:` and up.

**Why**: 8 tabs in a horizontal strip get cramped; the labels are
already truncating awkwardly on tablet. Linear / GitHub / Vercel /
Notion all settled on vertical tabs for settings pages with > 4
sections — and we already have the responsive pattern (NativeSelect on
mobile, tabs on tablet+).

**Implementation**:
```tsx
<Tabs orientation="vertical" value={tab} onValueChange={handleTabChange}>
  <div className="flex gap-6 lg:flex-row flex-col">
    <TabsList className="lg:flex-col h-auto lg:w-48 lg:items-stretch">
      {tabOptions.map((opt) => (
        <TabsTrigger key={opt.value} value={opt.value} className="lg:justify-start">
          {opt.label}
        </TabsTrigger>
      ))}
    </TabsList>
    <div className="flex-1 min-w-0">
      <TabsContent value="profile">…</TabsContent>
      …
    </div>
  </div>
</Tabs>
```

Leave the mobile NativeSelect path unchanged — it already works.

---

### Phase D — Skeleton sweep (MEDIUM value, MEDIUM effort, ~45m)

**Goal**: replace bare spinner-while-loading patterns with Skeletons
that match the loaded shape on list/table pages.

**Audit data**: 55 files use Spinner / Loader2; 19 use Skeleton or
PageLoading. The ratio is wrong — most "loading a list" cases should
show Skeleton rows so the layout doesn't shift when data lands.

**Triage** (don't migrate everything — just list-loading states):
- Inbox / Activity / Notifications — replace centre-spinner with
  Skeleton list-rows (`PageLoading variant="list"` already exists, use
  it more)
- Projects / Spaces index — replace centre-spinner with Skeleton card
  grid
- Skills page — list/cards loading state already uses 3 muted bars,
  could use shadcn Skeleton for theme-token consistency
- Settings tabs — leave as-is (forms render fast, spinner is fine)
- Chat / agents — leave as-is (streaming UX, not list loading)

**Anti-primitive entry to add**:
| Centre `<Spinner>` while a list is loading | Layout shifts when data lands; feels slower than it is | `<PageLoading variant="list" count={4} />` or shape-matching Skeleton rows |

---

### Phase E — HoverCard for entity references (MEDIUM value, MEDIUM effort, ~40m)

**Goal**: add hover preview to entity mentions in chat + activity
feeds. Currently bare links → no preview. claude.ai shows a HoverCard
preview on @-mentions, project links, conversation links.

**Targets**:
- `@user` mentions in spaces messages
- Project links (chat references `/dashboard/projects/:id`)
- Skill `/slash-name` chips in chat
- Conversation links in command palette

**Pattern**:
```tsx
<HoverCard openDelay={250} closeDelay={100}>
  <HoverCardTrigger asChild>
    <Link to={`/dashboard/projects/${id}`}>{name}</Link>
  </HoverCardTrigger>
  <HoverCardContent className="w-80">
    <ProjectPreviewCard projectId={id} />
  </HoverCardContent>
</HoverCard>
```

**Risk**: lazy-loaded preview content can flicker on hover-out before
load. Use the `openDelay` to dampen.

---

### Phase F — ContextMenu on rows (MEDIUM value, LOW effort, ~30m)

**Goal**: add right-click context menus to scannable list rows for
power-user bulk actions without cluttering the row UI.

**Targets**:
- Inbox rows — Mark as read / Pin / Archive / Delete / Open in new tab
- Files rows — Download / Rename / Share / Delete
- Conversations sidebar — Pin / Rename / Export / Delete
- Skills cards — Toggle / Edit / Revert / Copy slash form

**Why this beats DropdownMenu kebab**: kebab adds a button per row.
ContextMenu reuses the row itself as the trigger — zero visual weight.
Most Mac/Linux/Windows users right-click reflexively.

**Don't replace** the kebab everywhere — keep it for users who don't
think to right-click. ContextMenu is *additive*.

**Pattern**:
```tsx
<ContextMenu>
  <ContextMenuTrigger asChild>
    <ListRow asChild>
      <Link to={`/inbox/${item.id}`}>…</Link>
    </ListRow>
  </ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem onSelect={() => markRead(item.id)}>Mark as read</ContextMenuItem>
    <ContextMenuItem onSelect={() => pin(item.id)}>Pin</ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem className="text-destructive" onSelect={() => archive(item.id)}>Archive</ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

---

### Phase G — Worked examples for unused primitives (LOW value, LOW effort, ~30m total)

**Goal**: each installed-but-unused primitive gets at least ONE worked
example in app code (not just the StyleGuide page) so future fork
sessions discover it organically.

| Primitive | Where to demo |
|---|---|
| **InputOTP** | Add a 6-digit "verify a token" field on the API tokens "regenerate" flow OR reserve for future 2FA setup screen. Pick easier of the two. |
| **AspectRatio** | Wrap embedded image previews in chat attachments (currently raw `<img>` with implicit aspect ratio shifts when loading) |
| **Carousel** | Add to project files "image gallery" card when a project has 3+ image attachments |
| **Slider** | Settings → Chat preferences → temperature / max tokens slider (currently NumberInput) |

**Defer**: Menubar (no SaaS use case fits).

---

### Phase H — Remove genuinely-unused primitives (LOW value, LOW effort, ~10m)

After Phase G, anything still 100% unused after worked examples land:

- **Menubar** — IDE-style File/Edit/View bar. No SaaS surface needs
  this. Remove from `src/components/ui/`.

Don't remove the others until 30+ days have passed without a use case
landing.

---

## Open decisions for Jez

1. **All phases or pick a subset?** A + B + C + D would be one focused
   week of work. E + F are delight features. G + H are housekeeping.
2. **Field migration scope** — full 23-file sweep or just dialogs (10
   files)?
3. **Should this become a gh issue** like #59 was, so the trail is
   public?
4. **Order preference** — by ROI (as written) or by least-disruption-
   first (B + C + D before A's larger sweep)?

---

## Resume instructions (fresh session)

Read this plan end-to-end (5 min). Pick the phase or phases the user
agreed to. Each is independently committable. Update PRIMITIVES.md
anti-pattern table as you go (pattern listed under each phase).

If wrangler auth is expired when verifying live, ship code + commit +
note "live verification deferred" in the commit body.

---

**Last Updated**: 2026-05-01
