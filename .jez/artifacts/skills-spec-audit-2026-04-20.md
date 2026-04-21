# Agent Skills spec compliance audit

**Date:** 2026-04-20
**Spec:** https://agentskills.io/specification + https://agentskills.io/client-implementation/adding-skills-support
**Phase 1A commit:** `2009e86`

## TL;DR

We're ~80% compliant. The core lifecycle (discover → parse → disclose → activate → deliver resources) works and follows the spec's dedicated-tool pattern. Gaps are intentional (phase 2/3 work not yet shipped) or environmental (we're cloud-hosted, not a filesystem agent).

## Scorecard

| Requirement | Status | Notes |
|-------------|:---:|-------|
| **Frontmatter** | | |
| `name` required, 1-64 chars, lowercase + hyphens | ✅ | Validated in `loader.ts:164-169`, warns rather than rejects (matches guide) |
| `name` matches parent dir | ✅ | Warns on mismatch via `expectedName` option |
| `description` required, 1-1024 chars | ✅ | Validated at `loader.ts:157, 173` |
| `license` optional | ⚠️ | Not typed. Preserved via `[key: string]: unknown` — works but invisible |
| `compatibility` optional, max 500 chars | ⚠️ | Typed as `string` but not length-checked, not surfaced to model |
| `metadata` (map) optional | ⚠️ | Stored as JSON in D1 `metadata` column but not shown to the agent |
| `allowed-tools` (experimental) | ⚠️ | Parsed into `allowed_tools?: string[]` but not enforced. Model sees it if it reads frontmatter |
| Kebab-case → snake_case normalisation | ✅ | `normaliseKey` in `loader.ts:102` handles both `allowed-tools` and `allowed_tools` |
| Malformed-YAML fallback | ✅ | `fixUnquotedColons` retry in `loader.ts:111` |
| Lenient validation with warnings | ✅ | `warnings: string[]` on ParsedSkill, surfaced via `GET /api/skills/:name` |
| **Directory structure** | | |
| `scripts/` | ✅ | Enumerated via second Vite glob in `bundled.ts:30` |
| `references/` | ✅ | Same mechanism |
| `assets/` | ✅ | Same mechanism (no format assumptions made) |
| Relative paths resolved against skill root | ✅ | `fetchResource(rel)` in `registry.ts` |
| **Progressive disclosure — tier 1 catalog** | | |
| Load metadata at session start | ✅ | `listSkills()` feeds system prompt in `agent.ts:88` |
| Behavioural instruction block | ✅ | `agent.ts:103` matches the "dedicated tool" wording from the guide verbatim |
| Filter `disable_model_invocation` | ✅ | `agent.ts:89` |
| Omit catalog entirely when no skills | ❌ | Currently always emits the section if any skill is enabled. Not checked for empty array after filter |
| Hide filtered skills entirely (don't block at activation) | ✅ | Filter happens pre-catalog |
| **Progressive disclosure — tier 2 activation** | | |
| Dedicated activation tool | ✅ | `load_skill` in `tools/skills.ts:43` |
| Constrain name to valid skills (enum) | ❌ | Current schema: `z.string()` — model can hallucinate. Should be dynamic enum from catalog |
| Structured wrapping (`<skill_content>…<skill_resources>`) | ✅ | Matches guide example byte-for-byte |
| Include directory path for relative resolution | ✅ | `Skill directory: ${skill.directory}` |
| List bundled resources without eager load | ✅ | `<skill_resources>` block, opt-in loading via `read_skill_resource` |
| Strip frontmatter from body | ✅ | `parseSkill` returns `body` without frontmatter |
| **Progressive disclosure — tier 3 resources** | | |
| Per-resource read tool | ✅ | `read_skill_resource` validates path is in `skill.resources` allowlist |
| Permission allowlisting for skill dirs | N/A | We have no per-file-permission system; R2 + bundled is already implicitly allowlisted |
| **User-explicit activation (phase 2)** | | |
| Slash-command syntax | ❌ | Not shipped yet |
| Autocomplete picker | ❌ | Not shipped yet |
| Skills browser UI | ❌ | Not shipped yet (`/dashboard/skills`) |
| **Context management (phase 3)** | | |
| Protect skill content from compaction | ❌ | `tokenBudgetPrepareStep` prunes indiscriminately |
| Dedup repeat activations | ❌ | No session-level tracking |
| Subagent delegation | ⚠️ | We have `delegate` tool but no skill-aware routing |
| **Discovery** | | |
| `.agents/skills/` cross-client convention | N/A | Cloud app, no user filesystem |
| GitHub directory import (tree walk + siblings) | ❌ | Phase 1B — currently flat-file only |
| R2 zip upload with siblings | ❌ | Phase 1B — currently flat upload only |
| Name-collision precedence | ⚠️ | D1 unique constraint means first-insert wins; no project > user hierarchy because we have no such distinction |
| Trust gating for untrusted sources | N/A | Cloud app; GitHub URL imports are authenticated |

## Remediation list (ordered by impact / effort)

### 1. Constrain `load_skill` name to catalog enum (5 min, high impact)
The model can currently call `load_skill({name: "some-imagined-skill"})`. Per the guide's Tip: "constrain the name parameter to the set of valid skill names (e.g., as an enum in the tool schema)."

**Fix:** In `buildSkillsTools`, pass the catalog into the tool factory and build a `z.enum([...])` from it. Requires calling `listSkills` before tool construction — already done once in `agent.ts`, just pass through.

### 2. Omit catalog block entirely when zero skills available (2 min)
Currently if every enabled skill has `disableModelInvocation=true`, `agent.ts:90-110` still emits a "(none)" catalog. Add early-return when the filtered array is empty.

### 3. Surface `compatibility` and `license` to the model (10 min)
When present, show them in the catalog line:
```
- **pdf-extract**: Extract text from PDFs. _Requires: Python 3.14+_
```
Gives the model a signal when a skill's preconditions don't hold in our sandbox.

### 4. Enforce `allowed-tools` at activation time (30 min, experimental field)
When a skill declares `allowed-tools: web_search browser_markdown`, the activation tool's result should note: "This skill uses: web_search, browser_markdown." Optional enforcement: subset the tool set for the next step to only the declared ones (advanced).

### 5. Phase 2 slash commands + skills UI (1-2 hrs — already planned)
Closes the user-explicit activation gap.

### 6. Phase 3 context protection + dedup (45 min — already planned)
Closes the context-management gap.

### 7. Phase 1B directory imports (30 min — already planned)
Closes the GitHub tree + zip gap.

## Architectural notes

**Where we're stronger than a minimum implementation:**
- Lenient YAML fallback + warnings array — exceeds the guide's "skip if unparseable" fallback
- Structured wrapping with `directory=` attribute — helps the model avoid path errors with relative refs
- R2 + GitHub + bundled sources with a unified registry interface — most implementations hardcode filesystem scanning

**Where we differ from the guide intentionally:**
- No `.agents/skills/` scanning because we're a cloud worker, not a filesystem agent. Equivalent: users POST to `/api/skills/upload` or `/api/skills/github`.
- No permission allowlisting because we have no per-file permission system; bundled and R2 are implicitly trusted.
- No project-vs-user scope precedence because we have no project filesystem concept.

## Next

Quick wins 1 + 2 are worth doing inline before moving on — they're small enough that they belong in this session. 3 and 4 can wait or fold into phase 4 (polish). Items 5-7 are the already-planned checkpoints.
