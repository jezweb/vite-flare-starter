# Vite Flare Starter — agent guide

Pattern library + production starter for Cloudflare Workers apps.
React 19 + Vite, Hono, D1 (Drizzle), R2, better-auth, AI SDK v6 with
the Cloudflare agents SDK. Modules are **reference implementations** —
read the closest existing module before building a new one, and disable
unwanted modules with `VITE_FEATURE_*` flags instead of deleting them.

> This file is deliberately compact. `CLAUDE.md` is the canonical deep
> context (module map, AI stack, auth model) and stays current — read it
> next. This file only carries what every coding agent needs on turn one.

## Commands

```bash
pnpm dev                    # dev server (Docker must run — sandbox container builds)
pnpm build                  # production build
pnpm run deploy             # build + deploy (NEVER bare `wrangler deploy` — stale dist)
pnpm test                   # unit tests (Vitest, Workers pool)
pnpm test:e2e               # Playwright killer flows (against live deploy)
pnpm type-check             # tsc --noEmit
pnpm db:generate:named "x"  # create migration
pnpm db:migrate:local       # apply migrations locally
pnpm db:migrate:remote      # apply migrations to production
pnpm doctor:auth            # diagnose better-auth setup issues
pnpm doctor:models          # check Workers AI model ids against live catalogue
```

## Conventions that bite if missed

- **Design tokens only** — semantic classes (`bg-background`, `border-hairline`),
  never raw palette classes or `.dark {}` overrides. See [DESIGN.md](./DESIGN.md).
- **Tenancy**: scope reads AND write-guards with `scopeUser()`
  (`src/server/lib/tenancy.ts`); polymorphic lookups go through
  `canAccessEntity()`. R2 keys gate on `isOwnedR2Key()`.
- **New agent tools** follow the one-file `ToolDefinition` contract
  (`.claude/rules/one-file-tool-definitions.md`) — server execute +
  client render metadata in one object.
- **New DO/agent classes** must declare an `AGENT_ACCESS_POLICY` entry in
  `src/server/index.ts` (fail-closed) and be exported for wrangler.
- shadcn components are **Base UI** (`render` prop, not `asChild`);
  icons are **Phosphor**; charts are Kumo ECharts.

## Where to look

| Need | Read |
|---|---|
| Orientation | `docs/ONBOARDING.md` |
| Full module map + conventions | `CLAUDE.md` |
| CRUD/table/hook patterns | `docs/PATTERNS.md` |
| Agents / routines / tools | `docs/AGENTS.md`, `docs/ROUTINES.md`, `docs/AGENT_TOOLKIT.md` |
| Security model + pre-deploy checklist | `docs/SECURITY.md` |
| Forking this starter | `FORKING.md` |
