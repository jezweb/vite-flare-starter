# Dogfood Audit — 2026-04-24

Scope: `ConfigDiffProposal` primitive, Skills editor, `MarkdownCodeEditor`,
`propose_patch` chat tool, `ConfigDiffCard`, chat scroll fixes, font-size
fix. Recent commits on `main` since 2026-04-24 morning session.

Build: `pnpm type-check` passes cleanly. `pnpm build` passes from a clean
state. Observed intermittent `TS6133` errors on `MicrosoftWorkspacePanel` /
`GoogleWorkspacePanel` / `StubConnectorPanel` that disappear on subsequent
runs — see L3 below.

---

## Critical

### C1 — Skills table is global, not per-user, but UI claims "personal override"

**Files**: `src/server/lib/ai/skills/registry.ts:542-583`,
`src/server/modules/skills/db/schema.ts:14-29`,
`src/client/modules/skills/components/SkillEditor.tsx:205-211`

**Observation**: `skills` table has NO `userId` column; `uploadSkillToR2()`
writes to a single R2 key (`${name}/SKILL.md`) and updates the single row.
The `ConfigDiffProposal` correctly scopes `userId`, but `applyProposal()`
forwards to `uploadSkillToR2()` which mutates GLOBALLY for all users.

Meanwhile the SkillEditor shows an amber Badge on bundled skills saying
"Bundled — edits create a personal override" (line 208-210) — this is a
false promise. Any logged-in user can flip a bundled skill to `r2` for
every other user.

Impact: multi-user deployments are a footgun. A user proposes + applies an
edit to `/morning-brief`, and every other user now gets that version.
Combined with the chat `propose_patch` tool (no admin check), this is
effectively "any authenticated user can mutate the global skills registry."

**Recommendation**: Either (a) add `userId` to `skills` + R2 key
(`${userId}/${name}/SKILL.md`) and rewrite `loadSkill` to prefer
user-scoped overrides, or (b) restrict `POST /skills/:name/ai-edit`,
`POST /:id/apply`, and the `propose_patch` tool to admins only until
per-user overrides land. Update the Badge copy to match whichever ships.

### C2 — Drizzle journal is broken: migrations 0019, 0020, 0021 are orphans

**Files**: `drizzle/meta/_journal.json`, `drizzle/0019_*.sql`,
`drizzle/0020_*.sql`, `drizzle/0021_*.sql`

**Observation**: `_journal.json` jumps from `idx: 18` directly to
`idx: 22`. The intervening SQL migrations (`0019_microsoft_workspace_tokens`,
`0020_user_connector_settings`, `0021_stub_connector_tokens`) exist on
disk but have NO journal entry and NO `meta/0019_snapshot.json` /
`0020_snapshot.json` / `0021_snapshot.json`. `git log -- drizzle/meta/_journal.json`
confirms the journal was only updated in `965d77c` (config-diff commit);
the three Microsoft/connector commits (`118fe01`, `2134989`, `d2f29b5`)
committed SQL without touching the journal.

Impact: `pnpm db:migrate:remote` on a fresh database may skip these
migrations (drizzle follows the journal), OR drizzle-kit may refuse to
generate new migrations because the snapshot chain is broken. Forks
pulling upstream will hit this first.

**Recommendation**: Rebuild the journal + snapshots by running
`pnpm db:generate` against a scratch DB and committing the regenerated
`_journal.json` + `meta/*_snapshot.json` files. Verify that applying
`0000..0022` sequentially on a blank D1 produces the expected schema.

### C3 — Apply revert can itself fail silently; proposal stuck in `applied`

**Files**: `src/server/modules/config-diff/routes.ts:108-121`,
`src/server/modules/config-diff/storage.ts:163-175`

**Observation**: When `applyProposal()` throws after a successful claim,
`revertProposalToPending()` is called unguarded. If the revert itself
fails (D1 transient error, network blip, cascade lock), the proposal is
left as `status: 'applied'` with no R2 write — `getProposal` returns it
as applied, the Dialog modal closes, the History tab shows "applied",
but the skill was never actually updated.

Impact: silent data-loss — user thinks the skill was updated, it wasn't.
Worse: the history tab lies. Worst: there is no retry path since the row
is no longer `pending`.

**Recommendation**: Wrap the revert in try/catch + log structured error.
Better: introduce a distinct intermediate status (`applying`) and commit
to `applied` only AFTER the R2 write succeeds. This also fixes the
second-reader race where `listProposalsForResource` can briefly observe
a mid-apply proposal as `applied`.

### C4 — No admin/ownership check on skill mutations — any logged-in user affects all users

**Files**: `src/server/modules/skills/routes.ts:184-241`,
`src/server/modules/config-diff/routes.ts:92-122`

**Observation**: Both the `ai-edit` endpoint (creates proposals from a
natural-language instruction) and the `config-diff /:id/apply` endpoint
(applies proposals) require only `authMiddleware` — any authenticated
user. Because skills are global (C1), this combined with the
`propose_patch` tool means a user running chat can ask the AI to
"rewrite the morning-brief skill" and the resulting apply mutates the
skill for everyone.

**Recommendation**: Until per-user overrides land (C1 fix), gate
`POST /skills/:name/ai-edit` and `POST /config-diff/:id/apply`
(for kind=skill) behind `requireAdmin`. Also restrict the
`propose_patch` tool via `isAvailable` check when the user is not admin.

---

## High

### H1 — `propose_patch` accepts all 4 kinds in input schema but only `skill` works

**Files**: `src/server/modules/chat/tools/propose-patch.ts:20-23`,
`src/server/modules/config-diff/apply.ts:47-52, 76-82`

**Observation**: Tool input schema limits kind to `z.enum(['skill'])`,
which is correct. But the HTTP route `createSchema` at
`src/server/modules/config-diff/routes.ts:30-47` accepts all four kinds
(`skill | system-prompt | setting | connector-tool-policy`). A user can
create a proposal for `system-prompt` — `loadCurrentContent` returns
`''`, the diff "looks like" an addition, the proposal is stored. On
apply, `applyProposal` throws "not yet implemented" → `revertProposalToPending`
→ 500. Noisy failure path.

**Recommendation**: Narrow `createSchema.resource.kind` to
`z.enum(['skill'])` for now, matching what the apply switch actually
handles. Widen as other kinds gain apply handlers.

### H2 — `rebuildSkillSource` doesn't round-trip non-string frontmatter values correctly

**Files**: `src/server/modules/config-diff/apply.ts:37-45`,
`src/client/modules/skills/components/SkillEditor.tsx:76-86`

**Observation**: Both server and client use `JSON.stringify(value)` for
non-string frontmatter fields (e.g. `allowed_tools: ["grep", "ls"]`
becomes `allowed_tools: ["grep","ls"]`). But the `loadCurrentContent`
parser and the `splitBody` parser on the client will RE-PARSE these as
raw strings (not JSON). This round-trip is lossy: a field originally
written as YAML array `[grep, ls]` becomes the string `["grep","ls"]`
after one save, which no longer parses as a YAML array on the next
load → `skill.frontmatter.allowed_tools` is now a string, breaking any
downstream consumer that expects an array.

Impact: Any skill with array/object frontmatter fields (allowed_tools,
required_resources, model-specific config) is corrupted on first save
through the editor.

**Recommendation**: Use a real YAML serialiser (`js-yaml`) for both
client's `rebuildSkillSource` and server's `loadCurrentContent`, OR
strictly gate the editor against skills with non-string frontmatter
until a proper serialiser is wired up.

### H3 — "`before === after`" check lives in two places and uses different canonicalisation

**Files**: `src/server/modules/config-diff/routes.ts:56-61` (user flow),
`src/server/modules/chat/tools/propose-patch.ts:84-88` (agent flow),
`src/server/modules/skills/routes.ts:220-223` (sparkle flow)

**Observation**: Three producers check identical-ness against
`loadCurrentContent()`. Each re-implements the check slightly differently.
The sparkle flow compares `cleaned === before` (with code-fence
stripping), but `before` here is the server-canonical form from
`loadCurrentContent`. If the model emits CRLF line endings, `cleaned`
differs from `before` even when the content is semantically identical →
proposal created with a whitespace-only diff. This will show up as a
confusing "change that isn't really a change" to the user.

**Recommendation**: Centralise the equality check in `config-diff/apply.ts`
(new `equivalentContent(before, after, format)` function) that normalises
line endings and trailing whitespace for text formats. Have all three
producers route through it.

### H4 — No error toast when Approve/Reject from Dialog fails

**Files**: `src/client/modules/skills/components/SkillEditor.tsx:166-177`

**Observation**: `handleApprove` and `handleReject` call
`approve.mutateAsync` / `reject.mutateAsync` and immediately close the
modal (`setPendingProposal(null)`). If the mutation throws (race 409
from another session having already applied, D1 error, C3-style revert
failure), the user sees the modal close silently with no feedback. The
skill list may or may not refetch depending on how far the onSuccess
got.

**Recommendation**: Wrap in try/catch, call `toast.error(…)` with the
server's error message, and keep the modal open so the user can retry.

### H5 — AI Sparkle error persists across popover close/open cycles

**Files**: `src/client/modules/skills/components/SkillEditor.tsx:118-164`

**Observation**: `sparkleError` is cleared only at the start of a new
submit (line 154). If the user gets an error, closes the popover, and
reopens it later, the stale error is still visible under the textarea.
Similarly `sparkleInstruction` persists across close/open — probably
fine UX but worth confirming.

**Recommendation**: Clear `sparkleError` on `onOpenChange` — pass a
handler that resets it when the popover transitions to closed.

---

## Medium

### M1 — Frontmatter linter position math assumes LF line endings

**Files**: `src/client/modules/skills/components/MarkdownCodeEditor.tsx:43-131`

**Observation**: `fmStart = 4` assumes `---\n`. For CRLF (`---\r\n`) it
should be 5. The per-line `offset = lineEnd + 1` in the for loop adds 1
for `\n` but CRLF needs 2. So on Windows-saved files, diagnostic
positions drift further wrong each line.

Impact: Squiggles highlight the wrong characters. Rare in web-editing
context but non-zero — users paste skills from Windows editors.

**Recommendation**: After the match, compute `fmStart` from
`fmMatch.index + fmMatch[0].indexOf(fmMatch[1])` to sidestep CR/LF
assumptions. In the loop, add `1 + (line.endsWith('\r') ? 0 : 0)` — or
better, split on `\r?\n` and track offset from actual character counts.

### M2 — Intermittent `TS6133` build failures on connector panels

**Files**: `src/client/modules/connectors/components/StubConnectorPanel.tsx`,
`GoogleWorkspacePanel.tsx`, `MicrosoftWorkspacePanel.tsx`

**Observation**: Running `pnpm build` after aggressive cache-clear
(e.g. `rm -rf node_modules/.vite dist`) sometimes fails with
`'SlidersHorizontal' is declared but its value is never read`,
`'ManageToolsDialog' is declared but its value is never read`,
`'manageOpen' / 'setManageOpen' is declared but its value is never read`
— these are all used at lines 200-275 of the respective files. Rerunning
build succeeds. The three files rotate which one tsc flags.

`pnpm type-check` (which is `tsc --noEmit`) NEVER fails. The difference
is `tsc` (without `--noEmit`) vs `tsc --noEmit` under the same
`noEmit: true` tsconfig. This suggests tsc's file-ordering behaviour
differs between emit and non-emit modes, and some incremental state
cache is being inconsistent.

Impact: flaky CI, confusing DX.

**Recommendation**: Add `-p tsconfig.json` explicitly to both scripts
and add `--incremental false` or `--tsBuildInfoFile` to pin behaviour.
Alternatively add `preserveConstEnums`, `declaration: false` to rule
out emit-mode side effects. Low priority unless CI is affected.

### M3 — Bundled skill edits via AI Sparkle + apply bypass the "skill name unchanged" rule

**Files**: `src/server/modules/skills/routes.ts:198-219`

**Observation**: The AI Sparkle system prompt says 'the "name" field
MUST stay unchanged'. But there is NO server-side enforcement. If the
model emits a SKILL.md with a different `name` field, `createProposal`
stores it, user approves, `uploadSkillToR2()` parses the NEW name and
writes to the new R2 key → the old skill body is orphaned, a new skill
row is inserted (since `existing` lookup is by original name).

Impact: user intends to edit `/morning-brief`, ends up with
`/morning-brief-shorter` and the original skill unchanged.

**Recommendation**: In `/:name/ai-edit`, parse the returned `cleaned`
content and reject if `parsed.frontmatter.name !== name`. Same for
the Skill editor Save path.

### M4 — Diff computation runs on every ConfigDiffCard render without key stability

**Files**: `src/client/components/ConfigDiffCard.tsx:98-101`

**Observation**: `useMemo` deps are `[proposal.before, proposal.after]`.
If the parent re-creates the `proposal` object (e.g. TanStack Query
refetches), the memo re-runs even if the string values are unchanged
(reference equality on identical strings is fine). Each re-run does
`diffLines()` which is O(m*n). For a 10KB skill this is a few ms — no
issue. But if `proposal` comes back with a new object each refetch and
the consumer re-renders frequently (e.g. during streaming of a sibling
tool), the diff recomputes unnecessarily.

**Recommendation**: Low impact — deps are correct (string primitives).
No action unless profiling shows it.

### M5 — Chat rAF scroll loop continues indefinitely while `isLoading`

**Files**: `src/client/modules/chat/pages/ChatPage.tsx:686-699`

**Observation**: `requestAnimationFrame(tick)` is scheduled
unconditionally every frame while `isLoading === true`. If `isLoading`
stays stuck `true` due to a stream error (bug in streaming layer, tab
throttling, websocket hang), the rAF runs forever. Not a memory leak
(cleanup fires on unmount / isLoading flip), but wastes CPU while the
user is off-tab. Browsers do throttle rAF in background, so impact is
minimal.

**Recommendation**: Add a max duration (e.g. 5 minutes) as a safety
guard — after which the loop bails even if `isLoading` is still true.

---

## Low

### L1 — Sparkle popover + max instruction length

**Files**: `src/client/modules/skills/components/SkillEditor.tsx:231-238`

**Observation**: Sparkle instruction textarea has no `maxLength`.
A user could paste a 100KB instruction into the model call. No
server-side cap either (`src/server/modules/skills/routes.ts:190-192`
only checks truthiness). Cost/latency risk, not security.

**Recommendation**: Add `maxLength={2000}` to the textarea and a
server-side `z.string().max(2000)` on the body.

### L2 — `bare: true` swap-on-complete causes visual jump

**Files**: `src/client/modules/chat/components/MessageRenderer.tsx:566-572`,
`src/client/modules/chat/components/tool-renderers/propose-patch.tsx:69`

**Observation**: During streaming, the tool renders as a standard
ToolCard pill. Once `isComplete` flips true, the pill disappears and
the full ConfigDiffCard snaps in. Minor visual wobble.

**Recommendation**: Keep the ToolCard pill until after the proposal
has loaded AND user has started interacting, or render the
ConfigDiffCard *inside* a ToolCard but without its chrome.

### L3 — Missing snapshots for migrations 0012, 0013

**Files**: `drizzle/meta/`

**Observation**: Snapshots for 0012, 0013 are missing but the journal
entries exist. Unlike 0019-0021 (C2), these migrations ARE in the
journal — so `drizzle-kit migrate` considers them already applied.
But `drizzle-kit generate` may struggle to produce correct diffs
without intermediate snapshots. Historical debt, not a new regression.

**Recommendation**: Regenerate during the C2 fix.

### L4 — Stale comment in `search.tsx` renderer

**Files**: `src/client/modules/chat/components/tool-renderers/search.tsx:27-29`

**Observation**: Comment says "we render it bare inside our expanded
card" but the renderer does NOT set `bare: true`. The comment misleads
future readers about the bare primitive.

**Recommendation**: Remove the word "bare" from the comment, or swap
the renderer to use `bare: true` if that's the intent.

### L5 — `ConfigDiffCard` diff rendering: empty lines collapse to single space

**Files**: `src/client/components/ConfigDiffCard.tsx:227`

**Observation**: `{line === '' ? ' ' : line}` — intentional to keep the
row height, but this conflates "intentional empty line" with
"non-empty space-only line" in the diff view. Readable enough.

**Recommendation**: No action unless users complain about diff clarity.

### L6 — `createdBy.userId` duplicated in proposal shape

**Files**: `src/shared/config/diff-proposal.ts:37-42`,
`src/server/modules/config-diff/storage.ts:35-39`

**Observation**: `ConfigDiffProposal.userId` is top-level AND
`ConfigDiffProposal.createdBy.userId`. Storage layer fills both from
the same source. Cosmetic schema redundancy.

**Recommendation**: Drop `createdBy.userId` — it's always equal to
the top-level `userId` or meaningless.

### L7 — No rate-limit on AI Sparkle endpoint

**Files**: `src/server/modules/skills/routes.ts:184-241`

**Observation**: No rate-limit wrapper. A malicious or buggy client
could hammer the endpoint, burning OpenRouter credits (or Workers AI
budget) rapidly.

**Recommendation**: Add a basic KV-backed rate limit (e.g. 20/min
per user) or leverage Cloudflare Rate Limiting rules via wrangler.

### L8 — Linter disabled for read-only bundled skills question

**Files**: `src/client/modules/skills/components/MarkdownCodeEditor.tsx:205-208`,
`src/client/modules/skills/components/SkillEditor.tsx:300-305`

**Observation**: Linter always runs regardless of whether the skill is
bundled (read-only-ish) or r2 (truly editable). The ask in the scope:
should it be disabled for read-only? Currently bundled skills CAN be
edited (they create an override). So the linter is appropriate. No
action needed, but this could be documented.

### L9 — `prepare-step` UNLOCK_KEYWORDS initial commit cost

**Files**: `src/server/lib/ai/prepare-step.ts:62-88`,
`src/shared/config/privileged-tools.ts:17-49`

**Observation**: `PRIVILEGED_TOOL_NAMES` is the source of truth with
25 names; `UNLOCK_KEYWORDS` is `Record<PrivilegedTool, RegExp>` with
25 keys. Adding a new privileged tool requires editing both. The
`Record` type forces a compile-time error if a key is missing, so
type system protects the coupling — good. Just awkward ergonomics.

**Recommendation**: Consider co-locating the regex with each tool's
own definition in a future refactor.

---

## Category: nothing found

- **Type contract drift between server and client `useProposal` response**
  — server returns `{ proposal: ConfigDiffProposal }`, client hook expects
  the same shape. No drift found.
- **`ChatPage` scroll breaking when user scrolls up mid-stream**
  — both the wheel handler (synchronous release of stick-to-bottom)
  and the handleScroll direction detector (releases on any upward movement)
  correctly prevent the rAF from snapping the user back. Tested by reading
  the code; no live reproduction attempted.
- **`MarkdownCodeEditor` failing to lazy-load**
  — Suspense fallback is in place, static imports inside the lazy-loaded
  module are correctly chunked (`MarkdownCodeEditor-*.js 616kB` in the
  build output).
- **Dead code from reverted autocomplete feature**
  — clean: no `@codemirror/autocomplete` references, no `tool-catalog.ts`
  files, package.json has the right CodeMirror subset.
- **SQL injection surfaces on config-diff routes**
  — all queries use Drizzle ORM with parameterised bindings. No raw SQL.
- **Auth middleware missing on config-diff routes**
  — `app.use('*', authMiddleware)` on the mounted sub-app covers all paths.

---

## Summary

| Severity | Count | Notes |
|---|---|---|
| Critical | 4 | All boil down to "skills are global, treated like per-user" |
| High | 5 | YAML frontmatter round-trip bug is the most load-bearing |
| Medium | 5 | Mostly polish + DX flakiness |
| Low | 9 | Cosmetic + defensive nice-to-haves |
| Total | 23 | |

The C1/C4 pair is the load-bearing concern: the "personal override"
promise in the UI is currently a lie, and the lack of admin gating
means any authenticated user can mutate the global skill registry via
the chat `propose_patch` tool. Fix direction: either gate behind admin,
or actually implement per-user overrides (userId on skills table +
R2 key scoping + `loadSkill` preferring user overrides).

C2 (broken drizzle journal) will bite the first fresh-deployment fork.
Worth fixing before next migration is added.
