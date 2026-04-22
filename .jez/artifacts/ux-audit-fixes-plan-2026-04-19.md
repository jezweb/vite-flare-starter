# UX Audit Fixes — Plan — 2026-04-19

Source audit: `.jez/artifacts/ux-audit-2026-04-19.md`
Scope: all 13 open findings (3 Medium, 10 Low). No responsive sweep, no destructive-flows pass — those are deferred.

Four phases, ordered by effort/risk so we ship value fast and keep each PR small.

---

## Phase 1 — Trivial copy / label wins (~30 min total)

One focused pass. No logic changes. Safe to batch into a single commit.

### F1.1 — Rename the "Settings → Settings" tab to "Preferences" (L9)
- **File:** `src/client/modules/settings/pages/SettingsPage.tsx` — the tablist where the 7 tabs are defined.
- **Change:** `{ value: 'settings', label: 'Settings' }` → `{ value: 'preferences', label: 'Preferences' }`.
- **Follow-up:** update the query param handling (`?tab=preferences`) and any internal router fallback; keep the component that renders the body (`PreferencesSection.tsx`) as-is.
- **No backward-compat alias** — private/early repo, nobody bookmarked `?tab=settings`.

### F1.2 — Remove duplicate "Get Started" CTA from the public header (L2)
- **File:** `src/client/layouts/PublicLayout.tsx`
- **Change:** keep only "Sign In" in the header. Hero retains its single "Get Started" button. (Combined with M2 fix in Phase 2, the header will swap to "Open Dashboard" when signed in.)

### F1.3 — Add `aria-label` to the Export button (L5 part 1)
- **File:** `src/client/modules/chat/pages/ChatPage.tsx` (or wherever the download icon button sits in the chat header).
- **Change:** add `aria-label="Export conversation as Markdown"`. Keep `title` too — both play well together.
- **JSON/Markdown dropdown is out of scope for Phase 1** — deferred to Phase 4 (F4.2).

### F1.4 — Reconcile model count copy (L6)
- **Files:** `CLAUDE.md` (line ~210, "16 models across 8 providers") + `src/client/pages/LandingPage.tsx` (wherever the number appears).
- **Check:** count models in `src/shared/config/models.ts` — it's **16** (4 Workers AI + 12 OpenRouter). I saw 15 in the picker during the audit — that's the bug to investigate.
- **Action:** open the model picker with DevTools, count the rendered list, and find the dropped model. Likely a filter in `ModelSelector.tsx` hiding one based on capability flags. If the filter is intentional, change the copy to "15" and keep the 16th model in config for capability comparison. Otherwise, fix the filter.

**Commit message:** `chore(ux): rename settings tab, header CTA cleanup, export aria-label (L2/L5/L6/L9)`

---

## Phase 2 — Small functional wins (~2-3 hr total)

Six small changes, each under 30 min of real work. Each is independently testable.

### F2.1 — `PublicOnlyRoute` wrapper for `/sign-in` and `/sign-up` (M1)
- **New file:** `src/client/components/PublicOnlyRoute.tsx`
  ```tsx
  import { Navigate } from 'react-router'
  import { useSession } from '@/client/lib/auth-client'

  export function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
    const { data, isPending } = useSession()
    if (isPending) return null
    if (data?.user) return <Navigate to="/dashboard" replace />
    return <>{children}</>
  }
  ```
- **File:** `src/client/App.tsx` — wrap the two routes.
- **Covers:** M1 (sign-in / sign-up redirect) and the wrong-turn scenario.

### F2.2 — Auth-aware landing CTAs (M2)
- **Files:** `src/client/layouts/PublicLayout.tsx` (header), `src/client/pages/LandingPage.tsx` (hero + "Ready to build?" section).
- **Change:** read `useSession()` at each CTA location. If a user exists, render one "Open Dashboard →" link in place of "Sign In / Get Started".
- **Keep:** "View on GitHub" / "Star on GitHub" as-is — always useful.

### F2.3 — One-at-a-time modal policy (M5)
- **Approach:** simplest fix — each global hotkey handler closes sibling modals before opening its own.
  - `src/client/components/KeyboardShortcuts.tsx` — when `?` triggers, also call the command palette's `setOpen(false)`.
  - `src/client/components/CommandPalette.tsx` — when `Cmd+K` triggers, also close the shortcuts dialog.
- **Cleaner alternative (preferred if time):** lift modal state into a `useGlobalModal()` context so only one key can be "active" at a time. Each dialog subscribes via `isOpen = active === 'shortcuts'`. Opening any modal sets `active`, closing sets `null`.

### F2.4 — Conversation title in the chat header (L3)
- **File:** wherever the chat header is rendered inside `src/client/modules/chat/pages/ChatPage.tsx`.
- **Change:** `<h1>{conversation?.title ?? 'AI Chat'}</h1>` — falls back gracefully during streaming before auto-title lands.
- **Data source:** `useConversation(conversationId)` hook or equivalent; should already exist since the sidebar displays titles.

### F2.5 — "Current session" pill + disable Revoke on current row (L8)
- **File:** `src/client/modules/settings/components/SessionsSection.tsx`
- **Change:**
  - Fetch current session token via `useSession()` (better-auth exposes `data.session.token`).
  - On the matching row: render a `<Badge>This device</Badge>` and swap the `Revoke` button for a disabled state with a tooltip ("To end this session, use Sign Out").

### F2.6 — Collapse user dropdown rows (L1)
- **File:** `src/client/layouts/DashboardLayout.tsx`
- **Change:** replace the four separate rows (Profile / Security / Settings / Notifications) with a single "Settings" entry that navigates to `/dashboard/settings?tab=profile`. Keep "Admin Panel" (min-role gated) and "Sign out" as their own rows with `DropdownMenuSeparator`.
- **Side effect:** the "Notifications" entry in the dropdown is redundant with the bell icon in the header — dropping it is fine. If there's a concrete deep-link intent (e.g. mark-all-read page), leave a single "Notifications" link alongside Settings.

**Commit message:** `feat(ux): auth-aware routes + landing, chat header title, session pill (M1/M2/M5/L1/L3/L8)`

---

## Phase 3 — Server-side + medium (~3-4 hr total)

Real backend work. Each of these touches a D1 column, a hook, or the session pipeline — individually shippable but deserves its own PR.

### F3.1 — OAuth-aware Security tab (M3)
- **Server surface:** ensure there's an endpoint or existing payload that tells the client whether the user has a `credential` account row. Most likely already there via `session.user`, but better-auth stores the password on the `account` table (providerId='credential'). Options:
  - **A** — Extend `GET /api/auth/get-session` or add `GET /api/settings/account-providers` returning `['google']` or `['google', 'credential']`.
  - **B** — Inspect `session.providerId` on the current session only. Less correct (a user might have both).
  - **Recommended:** A. Add a small `/api/settings/auth-providers` route that selects distinct `providerId` from `account` for the logged-in user.
- **Client change:** `src/client/modules/settings/components/SecuritySection.tsx`
  - If providers include `credential` → render existing form.
  - If not → render a read-only card: "You signed in with Google. Manage your password at your [Google Account security page](https://myaccount.google.com/security)."
  - Leave the "Delete Account" section alone — that's provider-agnostic.
- **Optional follow-up:** "Create a password" flow for OAuth-only users who want to add email/password as a second factor. Out of scope for this pass.

### F3.2 — Capture and render session IPs (M4)
Two sub-tasks, both needed:

**F3.2a — Capture IP on session create.**
- **File:** wherever the better-auth session hook is wired — probably `src/server/modules/auth/index.ts` via `databaseHooks.session.create.before`.
- **Change:** read `c.req.header('cf-connecting-ip')` or equivalent from request context, write it to the `session.ipAddress` column (better-auth already declares this column in its schema).
- **Optional enrichment:** also capture `request.cf.country` + `request.cf.city` and store as `ipLabel = 'Sydney, AU · 124.171.x.x'` (would need a new column or stuff it into `userAgent` — better to add `ipLabel TEXT NULL` via migration).

**F3.2b — Render IP + label.**
- **File:** `src/client/modules/settings/components/SessionsSection.tsx`
- **Change:** replace "Unknown IP" with `{session.ipLabel ?? session.ipAddress ?? 'Unknown'}`. If the three fallback states could coexist, use a tri-state.
- **Historical sessions:** existing rows have no IP. That's fine — show "Unknown" for those and the backfill happens as users naturally sign in fresh. No migration backfill needed.

### F3.3 — Activity rows link to their resource (L10)
- **File:** `src/client/modules/activity/components/ActivityList.tsx` (or equivalent row component).
- **Change:** derive a link from `entityType` + `entityId`:
  ```ts
  const linkFor = (type: string, id: string): string | null => {
    if (type === 'conversation') return `/dashboard/chat/${id}`
    if (type === 'file') return `/dashboard/files?file=${id}`
    return null
  }
  ```
  Render the row as `<Link>` when the link is non-null, otherwise a `<div>`.
- **Server side:** confirm the `activity_log` table captures `entityType` + `entityId`. If not, the change is moot — document and close.

### F3.4 — Dashboard info cards: link or visually demote (L11)
- **File:** `src/client/pages/DashboardPage.tsx` (or wherever the home cards are rendered).
- **Recommendation:** **link them.** Each capability should anchor to one of:
  - A demo page in-app (`/dashboard/image-demo`, `/dashboard/files`, `/dashboard/admin` etc.).
  - An AI-Chat starter prompt that exercises the capability (e.g. "Image Processing" card → opens `/dashboard/chat?prompt=resize this image to 1024x1024`).
  - The relevant `CLAUDE.md` section as a `?docs=...` deep link.
- **Alternative (less work):** visually distinguish info cards — remove hover state, smaller type, lighter border, subtitle "Documentation reference".
- **Decide at implementation time** based on how much work the demo pages would be. Linking all 8 cards to starter prompts is probably the highest ROI option.

### F3.5 — Dashboard Image/Video wording (L12)
- **Same file:** `src/client/pages/DashboardPage.tsx`
- **Change:** for cards that represent tool-only capabilities (Image Processing, Video Processing, Semantic Search), reword to make the discoverability path obvious:
  - Before: **"Image Processing** · Resize, crop, format convert, AI background removal..."
  - After: **"Image Processing** · Available as AI tools — ask AI Chat to resize, crop, or remove backgrounds."
- **Or, paired with F3.4** — link each card to a pre-canned AI-Chat prompt that demonstrates the tool.

**Commit message:** `feat(settings,activity,dashboard): OAuth-aware security, session IPs, clickable activity, dashboard links (M3/M4/L10/L11/L12)`

---

## Phase 4 — Larger + optional polish (~2-4 hr)

These are higher-effort and not blockers. Ship when convenient.

### F4.1 — Anthropic/OpenRouter prompt caching (L4)
- **File:** `src/server/lib/ai/agent.ts` and `src/server/lib/ai/providers.ts`.
- **Change:** on the Anthropic and OpenRouter-Anthropic paths, attach `cache_control: { type: 'ephemeral' }` to:
  - The system prompt block.
  - The tool definitions block (tools are static and huge — biggest cache win).
- **Verification:** after a deploy, run two chats:
  - Chat A: first turn, log response `usage.cache_creation_input_tokens` and `cache_read_input_tokens`.
  - Chat A: second turn, log same metrics. Expect cache reads to dominate.
- **Reference metric:** CLAUDE.md + the chat UI already show token counts — use those to confirm post-fix cache usage.
- **OpenRouter caveat:** OpenRouter passes `cache_control` through for Anthropic models. Confirm the current provider routing — if we route to Anthropic directly via `@ai-sdk/anthropic`, good. If we route via OpenRouter, we need to verify the shape.
- **Workers AI models:** no cache support and no cost anyway — leave unchanged.

### F4.2 — Export format dropdown (L5 part 2)
- **File:** chat header export button → `src/client/modules/chat/pages/ChatPage.tsx`.
- **Change:** swap single button for a shadcn `DropdownMenu` with "Markdown", "JSON", "JSON with tool traces".
- **Server side:** confirm `/api/conversations/:id/export` accepts `?format=json|markdown|json-full` — CLAUDE.md says both JSON and Markdown are supported, verify the endpoint shape. Add `json-full` if missing.

### F4.3 — Polish pass — catch-alls worth bundling
- **"Current session" tooltip copy** — refine during F2.5 if rough.
- **Empty "Unknown IP" rows** — once F3.2 is live, check all pre-existing sessions render cleanly.
- **Confirm `?tab=preferences` URL doesn't break after F1.1 rename** — dogfood walk.

---

## Verification checklist (per productive-work-loop rule)

After any phase is deployed:

1. **Chrome MCP dogfood pass** against `https://vite-flare-starter.webfonts.workers.dev` as Jeremy (signed-in).
2. **Three-detectors script** (the phantom-scrollbar / non-semantic-clickables / missing-aria script) re-run.
3. **Settings tabs walked** — confirm the rename, the conditional Security tab, the Sessions IP rendering, the Current Session pill.
4. **Keyboard-only pass** — `?` and `Cmd+K` don't stack; `Escape` closes the active modal; tabbing into the settings tablist works.
5. **Signed-out + signed-in landing walks** — CTAs adapt correctly in both states.

Only then mark the finding resolved in the audit report.

---

## What I intentionally skip

- **"Create a password" flow for OAuth-only users** (adjacent to M3) — out of scope, treat as a future feature.
- **Admin Security audit** — not part of today's findings.
- **Extract module / Components page / Admin page** — not walked today, not planned here.
- **Responsive sweep** — carrying forward until we have a device-resize tool path.
- **Destructive-flows pass (delete account, revoke session, delete token)** — needs a throwaway account before touching.

---

## Execution cadence

- **Session 1 (this one):** Phase 1 — ship a single copy/label commit.
- **Session 2:** Phase 2 — six small functional wins in one commit, or split into two if PR review matters.
- **Session 3:** Phase 3 — server-side changes in one feature commit (M3/M4 bundled, L10/L11/L12 bundled).
- **Session 4 (optional):** Phase 4 — caching + export dropdown + polish.

Each phase is its own commit (or PR), small and reviewable. All changes land on `main` since this is a private starter repo with no protected branches.
