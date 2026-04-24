# Plan: Config-Diff Primitive + Skills Editor + AI Sparkle

**Date**: 2026-04-24
**Status**: Draft — awaiting user sign-off
**Rule alignment**: Phase 0 first (per `think-in-contracts-not-code.md`)

---

## Goal

One shared "propose a change, preview as a diff, approve or reject" primitive that drives:

1. **Skills editor** — user edits their own SKILL.md with raw + preview modes; AI sparkle rewrites from an NL instruction; diff preview before save.
2. **Main chat agent** — can propose edits to skills (and later: system prompts, settings, connector toggles) via a `propose_patch` tool; diff renders inline in chat; user approves or rejects.

Both flows share the same backend primitive and the same React diff-card component. No duplicate work.

---

## The contract (Phase 0)

### Shape

```ts
// src/shared/config/diff-proposal.ts
export interface ConfigDiffProposal {
  id: string                              // uuid, for approval callback
  resource: {
    kind: 'skill' | 'system-prompt' | 'setting' | 'connector-tool-policy'
    id: string                            // e.g. skill name
    label: string                         // human label for the card
  }
  before: string                          // full prior content
  after: string                           // full proposed content
  summary: string                         // 1-sentence "why this change"
  reason?: string                         // longer rationale (markdown ok)
  format: 'markdown' | 'json' | 'yaml' | 'plain'
  createdBy: { type: 'user' | 'agent' | 'ai-sparkle'; userId: string }
  createdAt: number
  status: 'pending' | 'applied' | 'rejected'
}
```

### Server primitive

```ts
// src/server/modules/config-diff/
//   routes.ts      — POST /proposals, GET /proposals/:id, POST /proposals/:id/apply, /reject
//   storage.ts     — D1-backed; proposals table
//   apply.ts       — switch on resource.kind, delegates to domain module
```

One D1 table `config_diff_proposals` with frontmatter above. Apply route looks up `kind`, calls the matching handler (skills, prompts, ...). Each handler is a thin function in the owning module — keeps concerns where they belong.

### Shared renderer

```tsx
// src/client/components/ConfigDiffCard.tsx
<ConfigDiffCard proposal={p} onApprove={...} onReject={...} />
```

Renders:
- Resource label + kind chip ("Skill: morning-brief")
- Summary line
- Unified diff with line-level +/- colouring (Tailwind green-600/red-600 backgrounds, 15% alpha)
- Collapsible "Full rationale" if `reason` present
- Approve + Reject buttons (or read-only if status ≠ pending)

Diff rendering via `diff` npm package (Myers, ~16KB, no deps). Split the `diffLines()` output into a simple array of `{ added, removed, value }` rows and style with Tailwind — no heavy viewer dependency.

---

## Skills editor upgrades

### Current state

`SkillsPage.tsx` (454 LOC) has:
- List + toggle + delete
- Import: paste / GitHub URL / zip upload
- NO in-page edit of an existing skill body
- Textarea-only when uploading, no preview

### Target

Split the page. Keep the list on the left. Click a skill → detail pane on the right with:

**Tabs**:
- **Source** — monospace Textarea editing the raw SKILL.md (frontmatter + body together; validated on save against the schema we already have)
- **Preview** — read-only rendered view. Frontmatter as a small metadata card (name, description), body via `ReactMarkdown` (already in deps)
- **History** — list of `ConfigDiffProposal` rows scoped to this skill (applied ones become an audit trail; also lets users revert)

**Toolbar buttons**:
- `Save` — validates, creates a `ConfigDiffProposal` from current vs saved, shows `ConfigDiffCard` in a modal, user confirms → applied
- `AI Sparkle` (Sparkles icon, top-right of editor) — opens a small prompt popover: "What should I change?" → calls a server endpoint that uses the chat agent to rewrite the body → returns proposal → shows `ConfigDiffCard` → user approves

### AI-sparkle server endpoint

```
POST /api/skills/:name/ai-edit
body: { instruction: "make this shorter and mention Australian context" }
response: ConfigDiffProposal (pending)
```

Handler builds a one-shot `generateText` call with Kimi K2.6 (or Haiku 4.5 if the user has OpenRouter set) using a system prompt like:

> You edit user skill files. Output ONLY the full new SKILL.md — no commentary, no code fences. Preserve YAML frontmatter shape. Follow the user's instruction faithfully.

Then wraps in a `ConfigDiffProposal` and persists as pending. UI polls / receives the ID and shows the card.

No streaming needed — these rewrites are short (SKILL.md is typically <5KB).

---

## Chat agent: `propose_patch` tool

Single tool, works for any `kind`:

```ts
propose_patch: {
  description: "Propose a change to a user-configurable resource (skill, system prompt, setting). User reviews the diff and approves or rejects before anything is applied.",
  inputSchema: z.object({
    kind: z.enum(['skill', 'system-prompt', 'setting']),
    id: z.string(),
    after: z.string(),          // full new content
    summary: z.string(),
    reason: z.string().optional(),
  }),
  // `before` is looked up server-side from the current state — model doesn't need to fetch it
  execute: async (input, ctx) => {
    const before = await fetchCurrentContent(ctx.env, ctx.userId, input.kind, input.id)
    const proposal = await createProposal({ ...input, before, createdBy: { type: 'agent', userId: ctx.userId } })
    return { proposalId: proposal.id, status: 'pending' }
  },
  needsApproval: false,  // the proposal itself isn't the action — apply is
  render: {
    icon: FileDiff,
    displayName: 'Propose change',
    // Custom renderer: loads the proposal by ID and renders ConfigDiffCard inline
    expanded: ({ output }) => <ConfigDiffCardByProposalId id={output.proposalId} />,
  },
}
```

Key property: the agent never mutates state directly. It only proposes. The user's Approve click is the mutation.

This also maps nicely to AI SDK's `experimental_repairToolCall` / approval flow — if we later want the model to auto-retry on reject-with-reason.

---

## Phase breakdown

| Phase | Work | Output | Rough effort |
|-------|------|--------|--------------|
| **0** | `ConfigDiffProposal` contract, D1 table, CRUD routes, `ConfigDiffCard` component with Tailwind diff rendering, `diff` package install | Primitive usable by anyone | 0.5 day |
| **1** | Skills editor: split page into list+detail, Source/Preview/History tabs, Save flow going through proposal | Users can edit skills with diff preview | 0.5 day |
| **2** | AI-sparkle endpoint + popover UI | Users can ask AI to rewrite skills | 0.25 day |
| **3** | `propose_patch` tool + chat renderer + skills apply handler | Main agent can propose skill edits in chat | 0.25 day |
| **4** (later) | Extend apply handlers to system-prompt + settings | Same UX works for other resource kinds | 0.25 day per kind |

Total to ship skills end-to-end: ~1.5 days. Each later resource kind: ~0.25 day.

---

## Open questions for Jez

1. **Editor width** — Skills detail pane: side-by-side with the list, or full-width replacing it? I lean side-by-side on desktop (list 320px, detail fluid), stacks on mobile.
2. **Diff granularity** — Line diff (simple, good enough for markdown) or word-level within changed lines (prettier for small tweaks)? I lean line-only for v1; word-level is easy to add if it feels coarse.
3. **History retention** — Keep all applied proposals forever (audit trail) or prune to last N per resource? I lean keep-all with pagination.
4. **Bundled skills** — Should users be able to edit bundled skills (shipped in `skills/<name>/SKILL.md`)? Current behaviour: bundled ones read from Vite glob at build time, user uploads/GitHub imports go to D1. Two options: (a) editing a bundled skill creates a D1 override that shadows the bundled one; (b) editing bundled is disallowed, user must fork/duplicate first. I lean (a) — it's less surprising.
5. **AI-sparkle model** — Use whatever the user's current chat model is, or always pick a fast/cheap one? I lean "user's current" so the rewrite voice matches what they're used to.

---

## What this does NOT include (explicitly out of scope v1)

- Real-time collaborative editing (CRDT / Y.js)
- Markdown WYSIWYG / contenteditable rich editor — raw + preview tabs only
- Inline-accept-per-hunk diff (like GitHub PR reviews) — whole-file approve/reject only
- Auto-merge or conflict resolution if two pending proposals exist for the same resource — second proposal errors with "already has pending change, resolve that first"
- Undo / rollback UI beyond "re-apply a historical proposal" via the History tab

Any of these can come later on top of the primitive.
