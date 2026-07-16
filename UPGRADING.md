# Upgrading a fork

Fork-facing notes for pulling upstream releases (`git pull upstream main`).
Newest first. Each entry lists only what can **break or silently change
your code** — the CHANGELOG has the full feature story.

**Release practice:** security fixes ship as their own patch/minor
*before* any big breaking release, so a fork can stay patched without
adopting a re-skin. If you're behind, take the security tags first, then
decide about the rest at your own pace.

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
