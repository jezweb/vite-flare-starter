# Vite Flare Starter — Exhaustive UX Audit

**Date**: 2026-04-16
**Auditor**: Claude (UX audit skill)
**Build**: main @ 69b95f7 (test-agent.sh fix)
**Environment**: local dev server at http://localhost:5173, fresh signup `test@example.com`
**Browser**: playwright-cli, Chrome
**Viewports tested**: 375x812 (mobile), 768x1024 (tablet), 1440x900 (desktop)

Screenshots: `.jez/screenshots/ux-audit/` (32 captures)

---

## TL;DR — The big-impact findings

| # | Severity | Area | Finding |
|---|---|---|---|
| 1 | **Bug — Critical** | Admin | `/api/admin/users` returns **500 Invalid time value** because Drizzle declares `createdAt` as `integer({mode: 'timestamp'})` but better-auth writes ISO strings (TEXT). Whole admin user list is broken. |
| 2 | **Bug — Critical** | Auth/Sidebar | Session API never exposes `user.role`. The sidebar `minRole` filter always defaults to `'user'`, so admin-only nav items would never render — even for real admins. |
| 3 | **Bug — High** | Activity | `activity_logs` table is **never written to** anywhere in the codebase. The Activity page will permanently show "No Activity Yet" until writers are added. |
| 4 | **Bug — High** | Onboarding | A fresh clone with no `.dev.vars` returns `{emailLoginEnabled: false, emailSignupEnabled: false, googleEnabled: false}` and silently leaves the sign-in page broken. No on-screen warning. |
| 5 | **Bug — High** | Chat | After sending a message, the user's own prompt is **scroll-anchored above the sticky header** and partly hidden. In dark mode it's almost invisible (`bg-secondary` ≈ `bg-background`). |
| 6 | **Bug — Medium** | Mobile | Chat suggestion pills overflow the viewport horizontally on 375px (no wrapping). Settings tab strip wraps to two un-styled rows. |
| 7 | **UX — High** | Dashboard | Sidebar has no Settings link — users only reach Settings via avatar menu. Settings is the most-visited utility page; deserves a sidebar entry. |
| 8 | **UX — Medium** | Email verify banner | Resend/dismiss banner reappears on every navigation (per-page state, not per-session). In dev with no email service, this is a permanent annoyance. |
| 9 | **Bug — Medium** | Sessions | Settings → Sessions shows "No other active sessions" but never lists the *current* session. Users want to see "this device" + history of others. |
| 10 | **UX — Medium** | Sign-in | No "Don't have an account? Sign up" link, no logo, no branding card, no `Sign in — App Name` page title, no password show/hide, no Google OAuth fallback hint. |
| 11 | **UX — Medium** | Sign-up | No password strength meter, no inline confirm-password validation, no Terms/Privacy checkbox, no welcome toast on success. |
| 12 | **UX — Low** | Dashboard cards | 3 cards have CTAs (AI Chat, Extract, Settings) and 8 don't. Inconsistent — pick one pattern. |
| 13 | **UX — Low** | Settings tabs | Last tab is named "Settings" inside the Settings page. Should be "Preferences" or "Appearance". |
| 14 | **UX — Low** | Notifications | Bell dropdown shows "No notifications" but no link to notification preferences or "View all". |
| 15 | **UX — Low** | Tokens cost | A trivial "What is 2+2?" used **15,005 tokens** because the system prompt loads every tool schema. Worth surfacing this so users see the cost. |

---

## Priority Recommendations

### Must-fix before shipping (Critical)

1. **Fix the timestamp/Drizzle mismatch** (`src/server/modules/auth/db/schema.ts:28-29` and friends).
   - Either change Drizzle to `text('createdAt')` with custom parsers, or change the manual better-auth migration to use `INTEGER` columns.
   - Test by hitting `/api/admin/users` with any signed-up user — it should not return 500.
   - Also review: `lastActiveAt` (line 210), `updatedAt` (line 208), and `getUser` (line 263).

2. **Expose `user.role` in the better-auth session.**
   - Add `additionalFields` to better-auth config so `role` is included in `/api/auth/get-session` responses.
   - `src/components/app-sidebar.tsx:46` reads `session.user.role` but the cookie/API never includes it.
   - Without this, `minRole` in `nav.ts` is non-functional.

3. **Add a `logActivity()` helper and call it from key handlers.**
   - `src/server/modules/activity` has the schema and read routes but zero writers.
   - Wire it into: signup, login, chat send, conversation create/delete, file upload/delete, settings update, API token create/revoke.
   - A Hono middleware that logs `${method} ${path}` for authenticated `/api/*` requests would cover most of it.

4. **Fix the no-`.dev.vars` cold-start experience.**
   - When `emailLoginEnabled=false && googleEnabled=false`, render an on-page warning: "No auth method is configured. Set `ENABLE_EMAIL_LOGIN=true` in `.dev.vars` or configure Google OAuth."
   - Better yet: ship `.dev.vars.example` populated with `ENABLE_EMAIL_LOGIN=true` so first-run works out of the box for local dev.

### High-impact UX fixes

5. **Chat scroll anchoring**: When a new AI response arrives, scroll so the *user prompt* aligns to the top of the message viewport (`scrollIntoView({block: 'start'})` on the latest user message), not the bottom of the AI reply. This is how ChatGPT/Claude.ai handle it.

6. **User-message bubble contrast in dark mode**: `bg-secondary` is `oklch(~0.205 0 0)` against a `bg-background` of `oklch(~0.145 0 0)` — too close. Bump `bg-secondary` to ~0.27 or add a 1px border on user bubbles.

7. **Add Settings to the sidebar** (`src/shared/config/nav.ts`). It's a top-3 nav target everywhere else this stack is used.

8. **Persist email-verification banner dismissal per session** (sessionStorage) so it doesn't reappear on every page transition.

9. **Mobile chat pills**: in `src/client/modules/chat/components/EmptyState.tsx` (or wherever the suggestion pills live), set `whitespace-normal text-left h-auto py-2` so long suggestions wrap instead of overflow.

10. **Settings → Sessions list the current session** with a "this device" badge — better-auth can identify it via the active token.

### Polish

11. **Sign-in page**: add logo (link to `/`), "Don't have an account? Sign up" link, password show/hide toggle, page title.

12. **Sign-up page**: add password strength meter (zxcvbn), inline match validation, optional Terms checkbox toggleable via env (`REQUIRE_TERMS_ACCEPT=true`).

13. **Settings tab "Settings"**: rename to "Preferences".

14. **Dashboard feature cards**: either add CTA buttons to all 8 lower cards (linking to docs / examples) or remove the "feature description" cards entirely and keep the 3 action cards.

15. **Token usage**: when a chat completes, surface the token count more prominently, perhaps a per-conversation "tokens this conversation" total in the sidebar — relevant for cost-conscious users.

16. **`?` keyboard shortcut for shortcuts panel** appears not to work on the dashboard. Check the listener registration in `src/client/components/KeyboardShortcuts.tsx`.

17. **Notification dropdown** could use a "Notification preferences" footer link and an icon for "mark all read" even when empty (disabled state).

18. **Style Guide page** is missing the consistent `Heading + Tagline` pattern that every other page uses. Adds friction when navigating between dev pages.

19. **Components page** is missing the icon-prefix in its heading (other pages have icons).

---

## Phase-by-Phase Findings

### Phase 1 — Landing & Auth

#### Landing page (`/`)
- **Good**: Dark-mode default respects system, hero copy is punchy, feature grid has 9 well-organised cards, footer is minimal.
- **Hardcoded GitHub URL**: per CLAUDE.md the GitHub button should be configurable via `VITE_GITHUB_URL`, but the button is hardcoded. A blank env var should hide the button entirely. (Screenshot 01)
- **No interactive demo**: The "Try the Demo" CTA goes to sign-up. Consider a public demo account or a sandbox account.
- **No social proof**: 3 trust badges (MIT/TS/CF), no testimonials, no "used by" logos, no GitHub star count.
- **No screenshots/GIFs**: 9 feature cards with text-only descriptions. A short GIF in any one card would dramatically improve conversion.

#### Sign-in page (`/sign-in`)
- **Missing branding**: No logo, no link back to `/`, no header card image. Feels like a lost form.
- **Missing sign-up link**: The card has no "Don't have an account?" link. Sign-up has the inverse. Easy fix.
- **Page title** identical to landing ("Vite Flare Starter"). Should set a per-route title.
- **Placeholder** `m@example.com` is abbreviated. `you@company.com` reads more naturally.
- **No password show/hide toggle**.
- **No Google OAuth button** (correct — disabled in env), but no helper text explaining why.

#### Sign-up page (`/sign-up`)
- **Closed state** (when `ENABLE_EMAIL_SIGNUP=false`) is well-done: clean message + sign-in fallback. (Screenshot 03)
- **Open form**: Full Name + Email + Password + Confirm Password.
- **No password strength meter** — users don't see strength feedback.
- **No inline validation** — email format and password match only validate on submit.
- **No Terms/Privacy checkbox** — legal risk for production deployments.
- **Auto-redirect to `/dashboard` on success** — no welcome toast / no onboarding tour.

#### Cold-start experience
- Fresh clone → no `.dev.vars` → `/api/auth/config` returns all-disabled. Sign-in page renders email/password form when login *should* be disabled too. Form submission silently fails.
- Recommendation: in `App.tsx` or sign-in route, check the auth config and render a `<Card>` saying "No auth method configured. See README to set up `.dev.vars`."

### Phase 2 — Dashboard & Navigation

#### Dashboard home (`/dashboard`)
- **Welcome message** uses first word of name. Edge-case: works for "Mary-Jane" but breaks for "Mary Jane Smith" (becomes "Mary").
- **Feature card inconsistency**: Top row (AI Chat, Extract, Settings) has CTAs. Lower cards (60+ Agent Tools, Image Processing, etc.) are info-only — confusing affordance.
- **Settings missing from sidebar**: Hidden behind avatar dropdown only. Should be in sidebar.
- **No Admin section** even with `ADMIN_EMAILS=test@example.com` set:
  - Admin role only promotes on first hit to `/api/admin/*` middleware.
  - Even after promotion, sidebar can't see role because session API omits it.
  - Net effect: admin nav links never render for any user.
- **Top bar**: only has Sidebar toggle + bell + theme. No global search, breadcrumbs, or page title. Feels empty at desktop widths.

#### Sidebar
- Logo-only mode triggers when sidebar collapses (good auto-collapse on narrow widths).
- Theme contrast in dark mode is OK (`zinc-900` sidebar vs near-black main) but reads as low-contrast in screenshots.
- No keyboard navigation indicators.

#### Command palette (Cmd+K)
- Triggers correctly (Screenshot 05).
- Lists nav items but nothing else — no "Recent", no "Actions", no quick "New chat", no "Toggle theme".
- Missing items: Settings, Style Guide (cut off without scroll).

#### Keyboard shortcuts (`?`)
- Pressing `?` (Shift+/) does **not** open a shortcuts panel. Either the listener isn't bound, focus traps it, or the binding is wrong key. Worth checking in `src/client/components/KeyboardShortcuts.tsx`.

#### Theme toggle
- Cycles light → dark on click (good).
- No system option visible in this control (Style Guide → Display Mode has 3-state toggle: Light / Dark / System).
- Inconsistency: top bar = 2-state, Style Guide = 3-state. Use one pattern.

### Phase 3 — AI Chat

#### Empty state
- Friendly heading "What can I help with?", 4 sample prompts, model picker. (Screenshot 08)
- Pills don't wrap on mobile (overflow).

#### Sending a message
- Tool calls render nicely — the `calculate` tool shows Parameters + Result in clean code blocks. (Screenshot 10)
- "Thought for a few seconds" reasoning appears twice (before tool, before final answer) — could be consolidated under one collapsible.
- Footer shows model id + token count + duration — useful but the "15,005 tokens" for "What is 2+2?" looks alarming.
- **User message visibility bug**: After streaming completes, the chat auto-scrolls to the AI response, leaving the user prompt above the sticky "AI Chat" header. The bubble has `bg-secondary` which in dark mode blends into the background. (Screenshots 13-16)

#### Conversations sidebar
- Hidden by default; reveals via Show conversations icon. (Screenshot 09)
- Empty state "No conversations yet" — clean.
- After sending message, conversation appears with auto-generated title from first prompt. ✓
- "Today" group label, "just now" / "5m ago" relative timestamps. ✓

#### Model picker
- Categorised (FREE · WORKERS AI). Default is Kimi K2.5. (Screenshot 12)
- Dropdown shows ~3 free models above the fold; rest require scroll.
- Currently selected model has a checkmark — good affordance.

#### Edit message
- "Edit message" pencil button on hover/focus shows inline editor with "Cancel" + "Save & regenerate". (Screenshot 17)

#### Regenerate / Copy
- Both buttons present in the message footer.
- Copy probably works (didn't verify clipboard).

#### New chat
- "New chat" button only appears when there's content. (Screenshot 18)
- Clicking it returns to empty state, conversation persists in sidebar with timestamp.

#### Export
- Download icon in chat header → "Export as Markdown".
- Conditional rendering: only appears when conversation has messages.

### Phase 4 — Files

- Stats cards (Total Files / Storage Used / Folders) — all 0 for new user. (Screenshot 20)
- Empty state "No files yet — Upload your first file to get started" — clean.
- Filter dropdown "All Folders" with 0 folders is misleading.
- "Folders" stat is not clickable — affordance mismatch with the visual treatment of a card.
- No drag-and-drop zone in the main area; users must use Upload button.
- No storage quota / limit indicator.

### Phase 5 — Activity & Notifications

#### Activity page (`/dashboard/activity`)
- 3 stats cards (Total / Today / This Week) all 0. (Screenshot 21)
- Empty state "No Activity Yet" — clean copy.
- **But it's permanent** — see Critical bug #3.

#### Notifications bell
- Click reveals dropdown "No notifications". (Screenshot 23)
- Dropdown lacks "Mark all read", "View all", or "Notification preferences" footer.
- Bell icon has no unread badge state shown (not testable since 0 notifs).

### Phase 6 — Settings & Admin

#### Settings page (`/dashboard/settings`)
- Tabs: Profile, Organization, Security, Sessions, API Tokens, **Settings** (← rename to Preferences).

##### Profile tab (Screenshot 24)
- Avatar + Upload + Display Name + Email Address + Export Your Data.
- Save button is disabled when nothing's changed — good affordance.
- Email change has clear "verification link will be sent" copy.

##### Organization tab (Screenshot 25-organization)
- Business Name / Website / Email / Phone + Address + State + Postcode + Country (default Australia).
- Sensible Australian defaults. ✓

##### Security tab (Screenshot 25-security)
- Change Password (Current / New / Confirm).
- "min 8 characters" placeholder is helpful.
- No password strength meter.
- No show/hide toggles.
- **Danger Zone** with red border + "Delete Account" red button — appropriate.

##### Sessions tab (Screenshot 25-sessions)
- "No other active sessions" — but doesn't list current session. Users want to verify "I'm signed in here" + see history.

##### API Tokens tab (Screenshot 25-api-tokens)
- "No API tokens created yet" + New Token button.
- Documentation block "Using API Tokens" with `Authorization: Bearer vfs_your_token_here` example. ✓
- Per CLAUDE.md, `vfs_` prefix is the default and should be configurable via `VITE_TOKEN_PREFIX`.

##### Settings (Preferences) tab (Screenshot 26)
- Color Theme: 8 themes + Custom card.
- Display Mode: Light / Dark / System (3-state).
- Why this isn't named "Preferences" or "Appearance" is a mystery — the page is already Settings.

#### Admin page (`/dashboard/admin`) (Screenshot 27, 28)
- Loads stats cards (Total Users, Active Sessions, New 7d, New 30d). ✓
- Tabs: Users, Features, API Tokens.
- **User list 500-errors** — see Critical bug #1.
- Skeleton loaders display correctly during fetch (Screenshot 27).
- Once error returns: "Failed to load users. Please try again." — good error message but no retry button visible.

### Phase 7 — Dev tools

#### Components (`/dashboard/components`) (Screenshot 29)
- Tabs: Buttons / Inputs / Display / Feedback / Overlay / Custom.
- Button Variants, Sizes, States demos.
- Page heading missing icon (other pages have icons).

#### Style Guide (`/dashboard/style-guide`) (Screenshot 30)
- Theme Preview at top with all 8 themes + display mode toggle.
- Below: UI Component Library showcase.
- **Missing top header**: every other page uses `<icon> <heading> + <tagline>` pattern. Style Guide jumps straight into "Theme Preview". Inconsistent.

### Phase 8 — Responsive

#### Mobile (375x812)
- **Landing**: "Vite Flare Starter" logo wraps to 2 lines in the header. Use shorter logo or icon-only on mobile.
- **Dashboard**: Sidebar correctly auto-collapses to icon-only. Cards stack. Email verify banner wraps OK.
- **Chat**: Suggestion pills overflow horizontally — text gets cut off mid-word. (Screenshot resp-mobile_dashboard_chat)
- **Settings tabs**: 6 tabs wrap to 2 rows. Second row is unstyled (no border/highlight). Should use a `<select>` or stacked vertical tabs on mobile.

#### Tablet (768x1024)
- **Dashboard**: 3-column action card row → "AI Chat" wraps to 2 lines. Lower info cards 2-column. Otherwise OK.
- **Chat**: One suggestion pill ("Show me a table comparing the top 5 programming languages") expands to full width while others remain pill-shaped — flex layout inconsistency. (Screenshot resp-tablet_dashboard_chat)

#### Desktop (1440x900)
- All pages render as designed. ✓

---

## Console errors observed

| Page | Errors |
|---|---|
| `/dashboard/admin` | 4× `500` from `/api/admin/users` — see Critical bug #1 |

No client-side React errors or warnings were observed during the audit.

---

## Server log highlights

```
[mo0gx63x-lpaxqp] Error: Invalid time value RangeError: Invalid time value
    at Date.toISOString (<anonymous>)
    at /Users/jez/Documents/vite-flare-starter/src/server/modules/admin/routes.ts:207:31
```

Repeated 4× — TanStack Query retries.

---

## Suggested follow-up work

1. **Open GitHub issues** for the 4 critical bugs above (timestamp, role-in-session, activity-writer, cold-start).
2. **Add a README "Quickstart" snippet** showing the minimal `.dev.vars` content needed for local dev.
3. **Add a Playwright E2E test** that covers signup → chat → settings → admin to catch regressions.
4. **Run an accessibility audit** with axe-core (not done in this UX pass).
5. **Add `loadActivityFromHonoMiddleware()`** so writers don't leak across modules.

---

## Files referenced

- `src/server/modules/auth/db/schema.ts:28` — bad `integer({mode:'timestamp'})`
- `src/server/modules/admin/routes.ts:207` — `toISOString()` crash
- `src/server/middleware/admin.ts:48` — `ADMIN_EMAILS` parsing
- `src/components/app-sidebar.tsx:46` — `session.user.role` reads `undefined`
- `src/shared/config/nav.ts:35` — `minRole` defined but never effective
- `src/client/components/KeyboardShortcuts.tsx` — `?` listener may be broken
- `src/client/modules/chat/components/EmptyState.tsx` — pill overflow on mobile
- `.dev.vars.example:46` — keep `ENABLE_EMAIL_LOGIN=true` uncommented for first-run

---

*End of report.*
