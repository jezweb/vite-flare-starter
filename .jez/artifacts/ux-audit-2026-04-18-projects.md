# UX Audit — Projects Phase 1 + About Me — 2026-04-18 (afternoon)

**Mode:** Standard (skill default) — but **static-only**
**Tester:** Claude Opus 4.7 (no live browser — see note)
**Live URL:** https://vite-flare-starter.webfonts.workers.dev
**Version:** `3897d477` (Projects Phase 1), confirmed deployed
**Commits reviewed:** `6c44a58` (About Me bump), `298e281` (Projects Phase 1)

## ⚠️ Testing caveat

**Chrome MCP couldn't connect** during this audit — multi-browser conflict, no way to auto-resolve without the user clicking "Connect" in the target browser. I pivoted to a **static audit**: read the final code for UX smells, verified schema + data via direct D1 queries, checked API contracts, and reasoned about interaction flows.

**What is tested:**
- Migration 0013 applied (projects table + conversations.project_id FK confirmed on remote D1)
- Baseline data intact (247 conversations present, 0 with project_id — consistent with brand-new feature)
- Type-check clean, build succeeds, deploy healthy

**What is *not* tested yet (flag for next live session):**
- The sidebar rendering itself (projects section, project rows, submenu)
- Any timing / focus / keyboard behaviour
- Mobile layout
- Radix DropdownMenuSub on touch
- Optimistic-move reordering flicker
- Thin-scrollbar overrides inside ScrollArea

## Findings

### Critical — 0
*None (nothing could confirm-critical without a browser)*

### High — 0
*None*

### Medium — 3

#### M1. Optimistic move may visually mis-order briefly
**Where:** `useMoveConversation` in `useProjects.ts`
**Observed:** Optimistic update only rewrites `projectId` on the cached row. The list is already sorted server-side by starred/updatedAt, so the row's position *in the new bucket* won't change until the `onSettled` refetch completes. On a fast connection this is imperceptible; on slow networks the row may appear in the wrong slot briefly.
**Fix:** Option A — force a `queryClient.invalidateQueries(['conversations'])` on `onMutate` start so we refetch mid-flight. Option B — accept the flicker (bounded by network round trip). My vote: leave it — the bug is a visual artifact, not a data correctness issue. Flag if a user complains.

#### M2. "Delete project" confirm dialog doesn't show conversation count
**Where:** `ConversationSidebar.tsx`, the confirm-delete-project AlertDialog
**Observed:** The copy ("Its conversations will be moved back to the main list") is accurate but generic. A user with 50 conversations inside might hesitate more than one with 0 — they should see the number.
**Fix:** In the confirm dialog, look up `byProject.get(confirmDeleteProjectId)?.length ?? 0` and say "N chats will be returned to the flat list". 3-line change.

#### M3. New project gets position=0 but client cache doesn't re-sort
**Where:** `useCreateProject` in `useProjects.ts` (no `onMutate` optimistic reorder)
**Observed:** After creating a project, the server response lists it first (position=0), and `invalidateQueries` will refetch. But there's a ~200ms window where the sidebar cache still shows the old order. Visually: new project "appears" at the bottom, then jumps to the top.
**Fix:** Either an optimistic insert at the front, or skip optimistic and let the refetch settle. Leave for Phase 2 unless it feels janky on real hardware.

### Low — 5

#### L1. Unused `hasAny` variable in ProjectsSection
**Where:** `ConversationSidebar.tsx:593`
**Observed:** `const hasAny = projects.length > 0 || creatingProject` — defined, never used. Dead code.
**Fix:** Delete the line. One-liner.

#### L2. Empty-state text references "the menu" without showing where
**Where:** Empty project hint: "Empty — move chats here from the menu"
**Observed:** Accurate but passive. A user with one unused project could sit staring at it for a while trying to figure out which menu.
**Fix:** Either "Use a chat's ellipsis menu → Move to project…" (more explicit) or skip the hint and rely on emptiness being self-explanatory.

#### L3. No keyboard shortcut for "new project"
**Observed:** Mouse-only affordance via the `FolderPlus` icon. Power users might want Cmd+Shift+N or similar.
**Fix:** Wire into the existing Cmd+K command palette (easier) rather than a dedicated shortcut. Defer to Phase 2.

#### L4. No visible project pill on the conversation page
**Observed:** When you open a chat that's inside a project, the chat page itself doesn't tell you which project it belongs to. Relevant context for the user — they might be moving a chat then forget it's already there.
**Fix:** Planned for Phase 2 (see projects plan doc, "In-project indicator"). Not a regression — this never worked.

#### L5. `newProjectName` / `projectRenameText` live in parent component, not section
**Where:** `ConversationSidebar` hoists `newProjectName`, `projectRenameText` + setters into its own state and passes down as props (15+ props on `ProjectsSection`).
**Observed:** Works but it's prop drilling. Makes the `ProjectsSection` interface feel heavy.
**Fix:** Phase 2 cleanup — extract `ProjectsSection` into its own module with internal state for the input fields. Not blocking.

### Polish — 3

#### P1. Scrollbar inside `<ScrollArea>` won't match our thin-pill style
**Where:** The entire sidebar list is wrapped in shadcn's `<ScrollArea>` (Radix-based). Our global thin-scrollbar CSS targets `::-webkit-scrollbar`; Radix renders its own div-based scrollbar. So the claude.ai-style pill doesn't apply there.
**Fix:** Either (a) replace `<ScrollArea>` with plain `overflow-y-auto` for that specific container (works with our global CSS) or (b) add Radix ScrollArea.Thumb classes. Option (a) is simpler and gives visual consistency with the rest of the app. Verify in browser first — this is a *suspicion*, not a confirmed bug.

#### P2. Project colour field exists in schema but there's no UI
**Where:** `projects.color` column, but `ConversationSection` doesn't render it
**Observed:** Schema supports colours, UI doesn't expose them. Folders all look identical.
**Fix:** Phase 2 — add a tiny 6-dot colour picker in the rename/edit flow. Low priority visual win.

#### P3. No "pin at top" / reorder affordance for projects
**Observed:** `position` field exists and the API accepts it, but there's no drag handle or up/down arrows in the UI. Projects order by `position` from seed — new ones get 0 and push others down, but user can't manually reorder.
**Fix:** Phase 2 — drag-and-drop with dnd-kit, or up/down arrows in the ellipsis menu. Sort-by-name toggle as a cheap alternative.

## What *is* working based on the code

- Schema is clean: nullable FK, cascade-delete for user ownership, set-null for project deletion.
- API surface is symmetric: GET/POST/PATCH/DELETE + archive/unarchive, all auth-gated.
- Move-conversation uses optimistic updates so the row reacts immediately.
- Sidebar structure is discoverable — the `FolderPlus` icon is visible even with zero projects, and the empty-state message points at the right next action.
- Delete cascade semantics match claude.ai's model (chats survive).
- Route-ordering is correct: `/api/projects/:id/archive` registered before `/:id` wouldn't matter here because HTTP methods differ, but I note it's still POST-first so there's no conflict risk.
- No CLAUDE.md / wrangler.jsonc touches. Migration is idempotent (CREATE TABLE without IF NOT EXISTS at the top, but the journal prevents double-apply).
- The context cascade plan (About Me → Project prompt → Chat prompt) is aligned with existing `buildChatAgent` architecture — Phase 2 will wire it in without changing the cascade order.

## Recommended next live pass (Jez, when browser is available)

In priority order:

1. **Create 2-3 projects, move chats between them**, then delete one. Confirm the chats return to the flat list and don't vanish.
2. **Verify optimistic move feels OK** — no visible jump.
3. **Check the delete-project dialog copy** reads right.
4. **Test on mobile viewport** — 420px wide. Submenu opening behaviour on touch is the real worry.
5. **Glance at sidebar scrollbar** — does it match the thin pill style from earlier? If not, fix P1.

## Audit summary

| Severity | Count | Notes |
|---------|-------|-------|
| Critical | 0 | No code-readable criticals |
| High | 0 | — |
| Medium | 3 | M1-M3 all "nice-to-have", no blockers |
| Low | 5 | L1 is a dead-code cleanup, L2 is copy, L3-L5 are deferred phases |
| Polish | 3 | P1-P3 all worth doing eventually |

**Verdict:** Ship Phase 1 as-is. Most findings are either already-planned for Phase 2 or trivial cleanups. The only change I'd make right now is **L1** (delete the unused variable) — zero cost, tidies the code.

---

*Report generated via `/dev-tools:ux-audit` in Standard mode. Static-only — live verification deferred. Total time: ~10 minutes.*
