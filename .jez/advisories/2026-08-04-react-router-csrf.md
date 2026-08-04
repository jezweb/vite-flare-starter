---
date: 2026-08-04
status: active
owner: claude (viteflare-maint)
audience: every fork of vite-flare-starter (and any Jezweb app pinning react-router 7.12+/8.x)
---

# Fleet advisory: bump react-router to ≥8.3.0 (CSRF fix, GHSA-qwww-vcr4-c8h2)

**TL;DR for a fork maintainer:** change `"react-router"` in package.json to
`"8.3.0"`, run `pnpm install && pnpm test`, ship. Two-minute change, no code
edits — 8.2.0 → 8.3.0 broke nothing in the starter's 291-test suite or build.

## What

Dependabot flags react-router `>=7.12.0 <8.3.0` **high** (GHSA-qwww-vcr4-c8h2):
an RSC-mode CSRF bypass that lets actions execute before the 400 response.
The starter pins `react-router: 8.2.0`, so every fork that hasn't diverged
inherits the flagged version.

## Honest exposure assessment

**Low for the starter family, as far as we can determine.** The advisory
is specific to React Router's RSC/actions mode; the starter (and forks that
kept its routing) uses plain `<BrowserRouter>` SPA routing with no RSC and no
router actions — mutations go through TanStack Query against `/api/*` with
better-auth session cookies. We have not attempted to prove exploitability
either way. Bump anyway: it's free, it clears the alert noise that hides real
ones, and forks that later adopt router actions won't remember this footnote.

## How

```bash
# in your fork
sed -i '' 's/"react-router": "8.2.0"/"react-router": "8.3.0"/' package.json
pnpm install && pnpm test && pnpm type-check
```

If your fork tracks upstream: `git pull upstream main` picks this up once
upstream PR #122 merges (which also clears 17 other audit findings via an
in-range refresh + undici overrides — see the PR for the full list).

## Related, same PR, worth copying even before you pull

- **pnpm ≥10.28 deprecates the package.json `pnpm` field.** If your fork
  carries overrides there (the starter did), move them to
  `pnpm-workspace.yaml` — they still work today but a future pnpm drops them
  silently.
- **If you bump `@cloudflare/sandbox`, bump the `Dockerfile` base tag with it**
  (must match the npm version) — easy to miss in a deps PR.

Questions → issue on jezweb/vite-flare-starter or ping viteflare-maint via hq.
