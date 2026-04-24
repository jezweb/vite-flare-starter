# Load-bearing decisions for vite-flare-starter

Captured 2026-04-20 for handoff to `ivy-vite-flare-starter`. These are the non-obvious calls the current session has made (or inherited from Jez) that a fresh reader of the repo would otherwise get wrong.

---

## Philosophy

### 1. Pattern library, not a demo

The starter's job is to **teach patterns**, not be a feature-complete app. When a module seems unused or redundant, the instinct is wrong — it stays. To hide it from the sidebar, flip the feature flag in `src/shared/config/features.ts`. Module code stays in `src/server/modules/` and `src/client/modules/` as reference material for future forks.

**Never delete a module.** If a new Jezweb product asks "how do we add X?", the answer should be "look at module Y in VFS." If we delete modules, that pipe breaks.

Source: `feedback_starter_as_pattern_library.md` in memory-seed.

### 2. Modules are the unit of teaching

Each module demonstrates one pattern — see the table in `CLAUDE.md` under "What Each Module Demonstrates." When proposing a new module, the first question is: "what pattern does this teach that isn't already demonstrated?" If the answer is "none," it doesn't belong.

### 3. Feature flags exist at two layers

- **Build-time**: `VITE_FEATURE_*` env vars + `src/shared/config/features.ts` → hide modules in specific forks
- **Runtime**: D1 `feature_flags` table + admin panel → toggle for A/B or ops

Both must stay in sync. When you add a new module, add it to both. The Phase 3 fix on 2026-04-19 closed a drift: the DB was missing 6 of the 9 flags. Don't let it drift again.

### 4. AI SDK imports concentrated in one place

All AI SDK v6 imports live in `src/server/lib/ai/` (4 files). This makes the v7 migration cheap — see the "AI SDK v7 Migration" section of CLAUDE.md. Don't scatter `ai` imports through feature code.

---

## Architectural calls

### 5. ChatStorage interface is D1-first, DO-ready

`src/server/modules/conversations/storage.ts` defines an interface that D1 implements today but is shaped for a future Durable Objects swap (Cloudflare Agents SDK). Don't inline D1 queries into chat routes — always go through the interface. Source: CLAUDE.md Pattern 4b.

### 6. ToolLoopAgent is the chat primitive

Tool calling, reasoning extraction, usage logging, structured output all flow through `buildChatAgent()` in `src/server/lib/ai/agent.ts`. If you're adding an AI capability to the chat module, extend the agent factory — don't write a parallel streaming path.

### 7. Tool modules are bind-aware

In `src/server/modules/chat/tools/`, each module's `buildXxxTools(ctx)` factory checks for env bindings and either provides the tool or returns a setup message. This means tools auto-enable based on which Cloudflare services are configured. When adding a new tool, follow the pattern — don't throw on missing bindings.

### 8. Better-auth uses the D1 native adapter

NOT the Drizzle adapter. The Drizzle adapter silently breaks on Cloudflare Workers (JSON parse errors on `/api/auth/sign-in/email`). See `better-auth-cloudflare.md` global rule. Don't "improve" this.

### 9. Skills system is Claude-Agent-Skill compatible

12 bundled SKILL.md files in `skills/`. Same format as Claude Code, Hermes, Cursor. When adding a bundled skill, follow the existing format — don't invent a new one. Skills load lazily via the `load_skill` tool.

### 10. Models list is curated, not dynamic

`src/shared/config/models.ts` is a bundled snapshot from https://models.flared.au. Refresh manually via `pnpm models:refresh`. Don't hit a remote API at runtime to decide which models are available — the list is build-time. The catalogue needs refreshing when new Claude/GPT/Gemini models ship.

---

## UX conventions

### 11. Cmd/Ctrl+K is the command palette

Don't bind Cmd+K to anything else. Tests suggest it's already being intercepted by the harness in some browser sessions (Chrome MCP specifically) — if testing Cmd+K manually doesn't work, that's probably why, not a code bug.

### 12. Nav is config-driven — don't modify layouts

`src/shared/config/nav.ts` is the source of truth for the sidebar. Add nav items here, not in `DashboardLayout.tsx`. Role and feature gating happen in the renderer (`app-sidebar.tsx`).

### 13. Static routes before parameterised

`/dashboard/admin`, `/dashboard/settings`, `/dashboard/components` are all static. `/dashboard/chat/:conversationId` is parameterised. In `App.tsx`, static routes are declared first. Keep it that way — React Router matches top-to-bottom. (See `hono-route-ordering.md` for the server analogue.)

### 14. 404s stay inside the dashboard shell

Since the 2026-04-19 Phase 1 fix, unmatched dashboard routes render `NotFoundPage` inside the shell (sidebar + header visible). Don't revert to `<Navigate to="/" replace />` — that was confusing users with stale bookmarks.

### 15. Dynamic document.title via layout

`DashboardLayout.tsx` now derives `document.title` from the current nav entry (Phase 5 on 2026-04-19). If adding a page outside the nav config, it'll default to the app name — add the page to nav so titles work.

### 16. Placeholders must be dimmed

Per the global placeholder-styling rule. Check that the `::placeholder` CSS in the global stylesheet uses `hsl(var(--muted-foreground) / 0.25)`. Jez finds bright placeholders annoying — this has been flagged more than once.

---

## Cloudflare / deployment calls

### 17. D1 bulk inserts must be batched

Max ~10 rows per INSERT on D1 (parameter limit). See `cloudflare-d1.md` rule. Don't try to insert 30 rows in one `db.insert().values([...])` — it fails silently.

### 18. Workers observability is always on

`wrangler.jsonc` has `observability.enabled: true`. Keep it there. Structured JSON logging (`console.log(JSON.stringify({event, ...}))`) makes filtering in the dashboard useful. Don't remove observability to "clean up config."

### 19. Vectorize binding is ready but commented

`wrangler.jsonc` has a Vectorize binding line commented out with instructions. When a fork needs semantic search, uncomment + create the index + add metadata indexes BEFORE inserting vectors. Metadata indexes are NOT retroactive. (See `cloudflare-vectorize.md` rule.)

### 20. Deploy to `vite-flare-starter.webfonts.workers.dev`

That's the Ivy specialist's demo URL. Dogfood-verify in Chrome before every deploy per `feature-done-verification.md`. Type-check passing ≠ works. A build succeeding ≠ works. Only "I watched it work end-to-end" counts.

---

## Testing conventions

### 21. Chrome MCP for logged-in views

Playwright-cli bounces to sign-in because it has no session cookies. Jez's Chrome has the session. Use Chrome MCP (`mcp__claude-in-chrome__*`) for anything requiring an authenticated view. Source: `feedback_chrome_for_logged_in_views.md`.

### 22. Multi-account testing is mandatory for ownership bugs

Access-control bugs only surface when you test with a different user. When changing anything that filters by `userId`, test with at least two accounts. Source: `feedback_multi_account_testing.md`.

### 23. Test existing features before building new ones

"Done" means watched it work, not "code exists." Before starting a new feature, dogfood the adjacent existing one — catches regressions before they stack. Source: `feedback_test_before_new_features.md`.

---

## Commit / release discipline

### 24. Phase commits, not task commits

When shipping audit fixes, commit at phase boundaries (all of Phase 1 in one commit), not per task. Makes the git log readable. Subject: `feat(area): Phase N <theme>`. Body: what shipped, what's next.

### 25. Co-authored with Claude Opus 4.7 (1M)

Commit messages ending with:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
per Jez's global convention. When the Ivy specialist spins up, swap to its plus-addressed identity for its own commits.

### 26. Deploys after every phase

Don't batch phases. Build + deploy after each one, dogfood-verify, then proceed. Bundles the verification into the rhythm instead of leaving it to the end.

---

**Last Updated**: 2026-04-20
