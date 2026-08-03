# Upgrading a fork

Fork-facing notes for pulling upstream releases (`git pull upstream main`).
Newest first. Each entry lists only what can **break or silently change
your code** — the CHANGELOG has the full feature story.

**Release practice:** security fixes ship as their own patch/minor
*before* any big breaking release, so a fork can stay patched without
adopting a re-skin. If you're behind, take the security tags first, then
decide about the rest at your own pace.

---

## Unreleased — What's New feed (additive)

Nothing breaks. The feature is inert in a fork that ignores it: with no
entries published the nav item does not render and the routes sit
unused. Three things to know if you *do* want it.

### 1. Run the migration

`20260803015122_changelog_entries.sql` adds one table. Timestamp
prefix, so it will not collide with your own migrations:

```bash
pnpm db:migrate:remote
```

### 2. `src/shared/config/nav.ts` is the one likely conflict

This is the file FORKING.md tells you to rewrite, so most forks have
diverged and `git pull` will conflict here. Take **your** version and
paste this item wherever it suits your sidebar:

```ts
{ to: '/dashboard/updates', label: "What's new", icon: Megaphone, badgeSource: 'updates' },
```

`Megaphone` comes from `@phosphor-icons/react`. `badgeSource` is new on
`NavItem`: the config stays plain serialisable data, and
`src/client/lib/nav-badges.ts` resolves the name to a hook inside the
sidebar renderer. That indirection is deliberate — the CommandPalette
reads `nav.ts` directly, so it must not grow hooks or components.

If you skip the nav entry entirely, `/dashboard/updates` still works as
a direct link.

### 3. Posting entries needs an admin-owned token

`pnpm changelog:post` wants `APP_URL` + `CHANGELOG_TOKEN`. The token
needs the new `updates:write` scope **and** must belong to a user with
the `admin` role — API tokens are deny-by-default in this starter, and
`adminMiddleware` runs on top of the scope check. A token with the scope
but a non-admin owner gets a 403, which is the intended behaviour, not a
bug.

Deliberately not wired into `pnpm deploy`: posting on every deploy fills
the feed with entries nobody wrote well.

---

## v2.1.0 — platform migrations + agents adoption (2026-07-19)

Additive features (display kit, agents-as-tools, pilots) won't touch
fork code. Five migrations will:

### 1. `react-router-dom` → `react-router` (build break)

The dep is gone (`react-router-dom` is terminal at 7.x). Every fork
import needs the swap — it's mechanical:

```bash
grep -rl "from 'react-router-dom'" src | xargs sed -i '' "s/from 'react-router-dom'/from 'react-router'/g"
```

`BrowserRouter`, `Link`, `useNavigate` etc. all live in the main
`react-router` export; only `RouterProvider` needs `react-router/dom`.

### 2. `@cloudflare/workers-types` → generated `wrangler types` (build break)

The package is removed. `pnpm type-check` now chains `wrangler types`
(generates the gitignored `worker-configuration.d.ts`), and
`tsconfig.json` includes it. In your fork:

- Delete any `import type { … } from '@cloudflare/workers-types'` lines
  — the runtime types are ambient now.
- **Make every module-level `Env` interface `extends Cloudflare.Env`.**
  This is the trap: without it, the agents SDK's
  `Env extends Cloudflare.Env` generic constraint silently collapses
  `getAgentByName`/`runAgentTool` stub inference to base `Agent` and you
  get dozens of confusing type errors far from the cause.
- If a generated binding member conflicts with a fork-optional one
  (TS2430), match the generated optionality — the generated file wins.

### 3. DO declarative `exports` — ONE-WAY (deploy behaviour)

`wrangler.jsonc` replaces the `migrations` array with a top-level
`"exports"` map. **Once you deploy with exports you cannot return to
migrations.** Fork checklist:

- Your own DO classes: add
  `"YourClass": { "type": "durable-object", "storage": "sqlite" }`
  (`new_classes`-era KV DOs use `"storage": "legacy-kv"`).
- Keeping BOTH `migrations` and `exports` fails validation — the pull
  will conflict on this block; take upstream's shape and fold your
  classes in.
- Data carries over automatically. `wrangler versions upload` (gradual
  deployments) doesn't support exports yet — use plain `deploy`.

### 4. compatibility_date 2026-07-10 + the workerd coupling

Bumping further breaks `vitest-pool-workers` with
`MiniflareCoreError [ERR_RUNTIME_FAILURE]`: the locally bundled workerd
binary rejects dates newer than itself (production accepts them — the
failure is local-only, which makes it confusing). Rule: compat date ≤
your installed workerd version's date (`1.20260710.1` → `2026-07-10`).

### 5. TypeScript 7 + biome 2.5.4 (low risk)

`tsc` is now the Go-native compiler (~6× faster, zero new diagnostics
here). If your fork added biome rules, run `npx biome migrate --write`
once; the new `useIterableCallbackReturn` rule flags `forEach` arrows
that implicitly return values — give them braces.

---

## v2.0.1 — security batch (2026-07-17)

Remaining #95 highs. One breaking change:

### Webhook agent URLs changed (external senders break)

`POST /api/webhooks/agent/:class/:slug` now expects an HMAC-signed
handle instead of a bare slug, and agent DOs are namespaced per user
(`userId:slug`) — closing slug-squatting and cross-user collisions.
Old bare-slug URLs return 401. Fix: re-fetch
`GET /api/webhooks/agent/:class/:slug/info` and paste the new URL into
each external sender. Secrets are per-DO; the namespaced DO is new, so
also re-copy the secret from the same `/info` response.

Silent-but-good changes (no action): `install_skill` now installs into
the calling user's namespace (was: shared, visible to all users);
MCP-connector OAuth state binds the initiating user; chat D1 projection
verifies conversation membership; Space agents drop the owner's
connected-account (MCP) tools when a different space member triggers
the run.

---

## v2.0.0 — design reboot (2026-07-16)

The UI foundation changed: Radix → Base UI, lucide → Phosphor,
Recharts → Kumo ECharts, tokens rebuilt on `light-dark()`. Fork code
that imports the old libraries breaks at build; some component behaviour
changed without breaking the build. Expect ~10 minutes with the tools
below, not an hour of surprises.

### 1. `lucide-react` imports → `@phosphor-icons/react` (build break)

The dependency is gone. Don't hand-map icons — run the same AST codemod
the upstream migration used, against your fork's own files:

```bash
node .jez/scripts/lucide-to-phosphor.mjs <files-or-globs>
```

It renames imports AND identifier usages from the validated 103-name
mapping (`.jez/data/lucide-phosphor-map-2026-07-16.txt`, e.g.
`AlertCircle=WarningCircle`, `Sparkles=Sparkle`, `Mail=Envelope`).
Two manual checks afterwards:

- lucide's `fill-current` stroke-fill idiom → Phosphor `weight="fill"`
  (Phosphor glyphs are fill-based; the class silently stops toggling)
- dynamic `icons[name]` namespace lookups defeat tree-shaking and pull
  the whole ~5 MB icon library into your bundle — convert to explicit
  icon maps (see `ConnectorsPage` upstream for the shape)

### 2. `recharts` imports → Kumo ECharts (build break)

Charts now use `Chart`/`TimeseriesChart` from
`@cloudflare/kumo/components/chart` with the shared `echarts` instance +
`useChartTheme` from `@/client/lib/echarts` (canvas can't read CSS
variables — colours resolve to hex at render). Port per-chart; keep
chart imports inside route-lazy pages. `AgentObservabilityPage` is the
worked example.

### 3. Radix → Base UI (behaviour deltas, no build break)

The shadcn wrappers keep their import paths, so your pages compile — but
Base UI behaves differently in places. Per-component notes live in
[`.migration/`](./.migration/). The ones that bite:

| Change | If you relied on the old behaviour |
|---|---|
| `asChild` → `render` prop | `<Trigger asChild><X/>` becomes `<Trigger render={<X/>} />` |
| Tabs keyboard activation is now **manual** | restore with `<TabsList activateOnFocus>` |
| Menu checkbox/radio items no longer close on click | wrap `onClick` with your own close if needed |
| `PromptInputActionAddScreenshot` | `onSelect` → `onClick` |

### 4. Tokens: `light-dark()` single-source (silent visual drift)

Every colour token declares both modes in `src/index.css`; `.dark` only
flips `color-scheme`. Any fork-added `.dark { --token: … }` blocks or
`dark:` colour variants now fight the system — delete them and declare
both modes in the token. See [`DESIGN.md`](./DESIGN.md).

### 5. AGENTS.md slimmed

If your fork's tooling pointed at the old 400-line AGENTS.md, it's now a
compact pointer file; deep context lives in `CLAUDE.md` (unchanged path).

---

## Older releases

v1.x upgrades carried no fork-breaking changes beyond normal dependency
bumps — see `CHANGELOG.md`.
