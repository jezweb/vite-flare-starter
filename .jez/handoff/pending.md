# Pending work snapshot — 2026-04-20

Captured for handoff to `ivy-vite-flare-starter`. State of the backlog at the moment the dedicated specialist takes over.

---

## Currently open (good first-week items)

### M6 — Components showcase has no code snippets

- **Source**: `.jez/artifacts/ux-audit-2026-04-19-pt2.md` finding M6
- **Observation**: The Components page shows live component examples but no corresponding code snippet, so a fork author sees "what it looks like" without "how to use it."
- **Scope**: Add a collapsible code block under each component example with the exact JSX/TSX snippet. Pattern after shadcn's own docs site.
- **Effort**: Medium (1-2 days). New `<CodeBlock>` component, highlight.js or shiki for syntax, copy button.
- **Start here**: `src/client/pages/ComponentsPage.tsx` — the Button cards updated in Phase 4 (2026-04-19) already have labelled cells; extend with snippet blocks.

### M7 — Milkdown and DataTable missing from Components showcase

- **Source**: `.jez/artifacts/ux-audit-2026-04-19-pt2.md` finding M7
- **Observation**: Two primitives bundled in the starter (Milkdown markdown editor, DataTable with sort/filter) are not showcased on `/dashboard/components`, so a fork author can't discover them without grepping.
- **Scope**: Add two new tabs to the Components page. Wire a minimal working instance of each.
- **Effort**: Medium (0.5-1 day each).
- **Depends on M6** implicitly — if the snippet pattern isn't in place first, these tabs inherit the same gap.

### Model catalogue refresh

- Run `pnpm models:refresh` to pull the latest from `https://models.flared.au/llms.txt`.
- Cross-check against `rules/llm-patterns.md` (global rule on Jez's Mac) — known-current Claude, GPT, Gemini IDs.
- If Claude 4.7 1M context isn't in the catalogue yet, add it manually per existing model entry shape.

### CLAUDE.md doc sync

Recent additions not reflected in the CLAUDE.md module table or pattern examples:

- Dynamic `document.title` via DashboardLayout (Phase 5, 2026-04-19)
- AdminStats error-banner pattern (Phase 5, 2026-04-19)
- Full feature-flag seed (chat / files / activity / notifications / apiTokens / themePicker / devTools / styleGuide / components) (Phase 3, 2026-04-19)
- Components page variant/size captions pattern (Phase 4, 2026-04-19)
- NotFoundPage inside dashboard shell (Phase 1, 2026-04-19)
- Conversation-not-found branch in ChatPage (Phase 1, 2026-04-19)

---

## Medium-term (weeks 2-4)

### FORKING.md freshness audit

Written 2026-01-05, last real touch then. Three months of changes haven't been reflected. To validate properly, dogfood a full fork from scratch on the Mac mini:

1. Clone to a fresh path
2. Follow FORKING.md step-by-step
3. Note what's outdated or missing
4. Update inline

Likely stale: wrangler command syntax, AI SDK v6 migration (FORKING probably still references v5), feature-flag seed step missing.

### AI SDK v7 readiness

v7 is in beta per CLAUDE.md. Migration scope is documented there (~30 minutes, 4 files, no architectural changes). When v7 goes stable:

1. Read release notes, check for changes not in CLAUDE.md's projected migration
2. Test in a branch
3. Dogfood the chat module end-to-end (tool calling, reasoning, structured output, MCP)
4. Document any surprises in `.jez/artifacts/ai-sdk-v7-migration-notes.md`
5. Merge when clean, bump in CLAUDE.md

### Fork registry kickoff

Per `ivy-vite-flare-starter` proposal: create `virtual-team/shared/vfs-forks.md` with one line per known fork (slug, commit-of-origin, diverged-at-date). Jez seeds, Ivy maintains. Helps answer "did my pattern land downstream" questions.

---

## Deferred (explicitly not now)

### Projects module UI (session 2026-04-18)

The Projects feature (chat organisation via project tags) was being worked on but hit UX dead-ends. See `.jez/artifacts/projects-plan-2026-04-18.md` for the state. One small fix landed (`30a6534 fix(chat): preserve project context on navigation`), bigger rework deferred pending a clearer mental model.

### Agent layer next steps

See `project_agent_layer_next.md` in memory-seed — open questions on how the agent layer evolves (more tools, smarter delegation, skills system maturity). Not urgent; comes up organically as forks need capabilities.

### Artifact + document tools

See `project_artifact_tools_deferred.md` in memory-seed. Word / Excel / PowerPoint generation was explored for a ClawHQ-adjacent use case but deferred because it needs Cloudflare Containers. The v1.2 alternative is `run_python` in the sandbox — good enough for most cases.

---

## Abandoned (don't revisit without reason)

### Table-based audit log UI

Tried a fancier audit-log view with sortable columns; settled on the current list-with-filter because D1 pagination + sort across a growing table didn't feel worth the complexity for a reference implementation. Current filter trimmed to reality (`all / create / delete`) on 2026-04-19.

### Sidebar collapse persistence via localStorage

Briefly considered remembering per-section collapse state across sessions. Radix's SidebarProvider doesn't expose that cleanly and the UX value was minor. Skipped.

---

## Open questions the specialist will hit

1. **Should the demo site self-deploy on git push, or only via explicit `wrangler deploy`?** Currently explicit. Auto-deploy would catch more bugs earlier but also publish half-baked changes.
2. **Is there a CHANGELOG?** No. One probably should exist now that forks are real. Good first-month task: start one, seed from git log since 2026-01-01.
3. **Model pricing in the catalogue** — `models.ts` stores pricing. Is it worth surfacing somewhere in the UI? A small "pricing for selected model" footnote below the picker might be a nice reference pattern.
4. **Accessibility audit** — the last audits were UX-focused. A dedicated a11y pass (axe-core or Lighthouse) hasn't happened since January. Worth scheduling.

---

**Last Updated**: 2026-04-20
