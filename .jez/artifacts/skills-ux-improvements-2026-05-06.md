---
date: 2026-05-06
status: draft — ideas for discussion
owner: jez+claude
context: After landing F1+M1+M2+M3+L1+L2 + edit-from-Overview, what else?
---

# Skills editor — what could make it sharper

Bucketed by effort × impact. Skim the top, pick what resonates.

## Tier 1 — quick wins (~30 min each)

### 1.1 Token cost + reading time below the editor
**What**: replace the existing `chars / lines` footer with `~N tokens · adds N tokens to every chat that uses this skill · reads in ~N seconds`. Token estimate via a 4-chars-per-token heuristic (or an exact tiktoken if it's not too big a dep).

**Why it matters**: skills bloat the system prompt. Users currently have no signal that one skill is 200 tokens and another is 2,000. The token-cost stat lets them self-edit length.

**Where**: `SkillEditor.tsx` line ~422, `{draft.length.toLocaleString()} chars · {draft.split('\n').length} lines`.

### 1.2 Cmd+S saves
**What**: keyboard shortcut to trigger Save. Today you have to mouse to the button.

**Why it matters**: every editor in the world has Cmd+S; absence is jarring.

**Where**: add a `keymap` extension to `MarkdownCodeEditor` that calls a passed-in `onSave` callback.

### 1.3 Frontmatter at the top, body below — visually separated
**What**: in the Source view, render the YAML frontmatter as a small structured form (Name, Description, optional flags) above the body editor. Body editor stops at the `---` close. Saving rebuilds the SKILL.md from form + body.

**Why it matters**: today users have to know YAML to edit Name/Description without breaking the parser. The linter catches errors but doesn't prevent them. A typed form removes a class of mistakes.

**Risk**: harder for power users to edit frontmatter freely (e.g. add experimental fields). Mitigation: add a "raw YAML" toggle.

### 1.4 "Test in chat" button in the editor card
**What**: button next to AI Sparkle / Save labelled "Test in chat" → opens `/dashboard/chat?new=1&q=/skill-name` in a new tab so you can verify the skill works without losing the editor state.

**Why it matters**: the test loop right now is "save → switch tabs → start new chat → type slash → wait → see if it worked". Faster loop = more iteration.

**Where**: same row as AI Sparkle.

### 1.5 Auto-save draft to localStorage
**What**: every keystroke beyond the first writes to `localStorage[`skill-draft:${name}`] = draft`. On mount, if local draft exists and differs from canonical, show a banner: "You have unsaved changes from [time ago]. Restore? Discard?".

**Why it matters**: Cmd+W or accidental tab close currently loses work. The `useBeforeUnload` warning helps but doesn't recover state if dismissed.

**Risk**: stale drafts. Auto-clear on Save success.

## Tier 2 — bigger ideas (~2-4 hours)

### 2.1 Live "what changed" plain-English summary on save
**What**: when the user clicks Save, before showing the diff, show a 1-2 sentence AI-generated summary of the change ("You added a step about asking the user's preferred review depth before starting; rewrote step 4 to be more specific."). Then the diff.

**Why it matters**: diffs are precise but hard to grok. A plain-English summary helps the user catch unintended changes (especially after AI Sparkle).

**Implementation**: client-side LLM call before showing the modal. Workers AI Kimi is fine + free.

### 2.2 Side-by-side preview when typing in Source
**What**: Source view becomes a 2-column layout — editor on the left, rendered markdown on the right. Cursor position scrolls the preview. Typing in the editor live-updates the preview.

**Why it matters**: today you tab between Source (typing) and Overview (verifying). Side-by-side removes the mental context switch.

**Risk**: cramped on narrow viewports. Show side-by-side only ≥1024px; below that, keep the tab toggle.

### 2.3 Recent invocation log per skill
**What**: in History tab, alongside config-diff proposals, show "Recent uses" — last N times this skill fired in chat. Each row: timestamp, conversation link, succeeded/failed marker.

**Why it matters**: closes the loop between authoring and observed behaviour. "Did anyone actually use this skill last week?" is unanswerable today.

**Backend lift**: `aiToolCalls` table already logs `load_skill` invocations; just needs a `name` filter and a UI surface.

### 2.4 Smarter AI Sparkle — chips for common asks
**What**: above the textarea in the Sparkle popover, show 4-6 quick-pick chips: "Make it shorter", "Add Australian context", "Make it more conversational", "Fix the structure", "Add an example". Click a chip → fills the textarea so the user can edit before submitting.

**Why it matters**: discoverability. New users don't know what to ask.

### 2.5 Skill grouping in the listing
**What**: skill listing groups by category. Categories inferred from skill metadata (`tags: [writing, code, research]` in frontmatter), with sensible defaults from the bundled skills.

**Why it matters**: 24 skills in a flat grid is a lot. Categories help scanning. Particularly important once forks add their own.

## Tier 3 — nice-to-have / longer-term

### 3.1 Test prompts + expected behaviour per skill
Each skill can declare 2-3 test prompts that demonstrate the intended behaviour. A "Run tests" button replays them in a sandbox chat and shows pass/fail. Helps with regression testing during edits.

### 3.2 Skill version history + rollback
Per-skill version log (not per-proposal), with one-click revert to any prior version. The proposal table is already an audit trail; this is a UX-readable surface on top.

### 3.3 Comments on diff sections during review
When approving a config-diff proposal, allow the reviewer to add a comment per hunk. Useful for team workflows where one user proposes and another approves.

### 3.4 Token-budget visualisation across all enabled skills
On the listing page, a small banner: "Your enabled skills add ~3,400 tokens to every chat. The 5 biggest contributors are: morning-brief (650) · ...". One-click "disable unused" suggestion.

### 3.5 Shareable skill URL with read-only preview
For a skill the user has authored, a public read-only URL (`/s/:share-id`) so they can share it with a colleague or post in chat. Server-rendered, no auth, scoped read-only token.

## Tier 4 — wider Skills v2 (separate project scope)

- **Forking workflow**: open a bundled skill, "Fork to my collection", get a personal copy with provenance link to the original.
- **Marketplace / community library**: browse + install skills from a registry. Cloudflare-hosted index, MCP-style discovery.
- **Cross-agent skill sharing**: skills owned by an organisation, available to all members.
- **Multi-step skill chaining**: a skill that delegates to other skills based on input. Closer to a routine than a procedure.

## Recommendation

If you want a focused next session, **Tier 1.1 + 1.2 + 1.4** = ~90 min total and cover the three most-asked-for missing affordances (token cost visibility, save shortcut, fast test loop).

**Tier 2.2 (side-by-side preview)** is the single biggest UX win available — high effort, high impact, but worth 3-4 hours one day.

The Tier 3-4 items are roadmap-grade — flag if any catch your eye, otherwise leave them as a parking lot.
