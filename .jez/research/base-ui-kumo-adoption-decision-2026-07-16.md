---
date: 2026-07-16
status: active
owner: jez+claude
topic: Adopt Base UI (shadcn default since Jul 2026) + Kumo design language — decision + plan
---

# Base UI + Kumo adoption — verified facts and plan

## Verified facts (2026-07-16, live)

### shadcn/ui × Base UI
- **Base UI is the DEFAULT for new shadcn projects since July 2026**
  (https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default). `shadcn init` defaults to Base;
  docs open on the Base tab. Radix remains fully supported (`-b radix`); no forced migration —
  "If your app works, keep shipping."
- Why: Base UI 1.6 stable, shadcn team uses it internally, `shadcn create` users chose Base 2:1.
  Background: original Radix engineers left WorkOS→MUI and built Base UI — effectively "Radix v2
  by the original authors".
- components.json encodes the choice in `style` as `{library}-{style}` (e.g. `base-vega` vs
  `radix-nova`). Parallel registry namespaces `/docs/components/{base|radix}/<name>`.
- **Official migration path is an AI skill**: `pnpm dlx skills add shadcn/ui`, then ask the agent
  to migrate component-by-component. Both libraries coexist mid-migration; one commit per
  component; reports to `.migration/`. Real-world: 60+ components ≈ 25 min, ~10k tokens/component.
- Wrapper APIs are designed identical; breakage lives where app code leaks below the wrapper:
  - `asChild` (Radix) → `render` prop (Base UI)
  - `data-[state=…]` selectors / `.radix-…` CSS
  - popups (dropdown/select/popover/tooltip/hover-card) gain a `Positioner` wrapper; side/align move there
  - drawer: Base variant drops vaul; form: `Form/FormField` → new `Field` family
  - command stays cmdk in both; sonner stays

### Our exposure (measured in repo)
- 37/77 ui components import `radix-ui`; satellites: cmdk, vaul, sonner, embla, dnd-kit, rhf.
- `asChild`: 141 total (85 in app code). `data-[state=`: 7 outside ui/. `FormField`: 4 files.
  Drawer consumers: 0. zod already v4.

### Kumo (@cloudflare/kumo 2.8.0)
- Base UI + Tailwind v4 + Phosphor icons + ECharts (Chart peer) + motion + shiki. zod ^4 peer ✓.
- 48 components + blocks (page-header, resource-list, delete-resource) via CLI
  (`npx @cloudflare/kumo ls` / `doc <Name>`); AI-facing registry.
- Same primitive layer as post-migration shadcn → mixing Kumo components/blocks into a Base-UI
  shadcn app is clean (one primitives lib, one a11y/positioning stack).

## Decision (recommended)

1. **Migrate shadcn Radix → Base UI** using the official skill, component-by-component on a branch.
   Aligns with the new default (forks scaffold-fresh get Base anyway), gets us the same primitive
   layer as Kumo, and future new shadcn components/blocks land Base-first.
2. **Adopt Kumo's design language as the skin**: Inter, semantic surface tokens
   (canvas/base/elevated/recessed + line/hairline borders) via `light-dark()`, density pass
   (13px data text, tabular-nums), blue primary / neutral ramp.
3. **Cherry-pick Kumo pieces** where they beat ours (Banner, Meter, Empty, ClipboardText,
   sensitive-input) rather than wholesale replacement — keep our 15 app-primitives.
4. **Keep lucide + Recharts** by default (255 files import lucide; Kumo Chart's ECharts peer is
   heavy). Revisit Phosphor/ECharts only as a deliberate later step. [pending Jez call]

## Order of operations

Phase A — Base UI migration (branch `feat/base-ui-migration`): skill-driven, per-component
commits, e2e killer flows + visual pass at the end. Update .claude/rules that reference Radix
specifics; PATCHES.md note for forks.
Phase B — Kumo-token reskin: new token layer in index.css, Inter via fontsource, density pass,
style-guide page update, placeholder/scrollbar rules keep working.
Phase C — Kumo cherry-picks + nav-philosophy tweaks (task-named nav labels, Insights
consolidation already done).

Related: cloudflare-dashboard-design-kumo-2026-07-16.md, cloudflare-platform-state-2026-07-16.md
