# Fold-back audit — ambient-notes, kindling, imgeo → vite-flare-starter

**Date:** 2026-04-23
**Context:** All three apps are forks of vite-flare-starter. This audit finds patterns in those forks that could fold back into the starter as reusable modules/middleware — so future forks start with these goodies out of the box.

---

## Summary

| Fold-back candidate | From | Value | Complexity |
|---|---|---|---|
| **Guest-cookie owner middleware** (anonymous user → cookie session) | imgeo | HIGH — freemium/anonymous features | Small |
| **KV rate-limit middleware** (IP-based sliding window) | imgeo, ambient-notes | HIGH — every public endpoint needs this | Small |
| **Tier config + per-tier limits** | imgeo | MEDIUM — freemium apps | Medium |
| **Canned demo samples pattern** (TTS + synthetic MediaStream for voice features) | ambient-notes | MEDIUM — removes mic-permission friction for demos | Small |
| **Markdown export with YAML frontmatter** as universal out | ambient-notes | MEDIUM — content-producing apps | Small |
| **Model bake-off harness** | ambient-notes | MEDIUM — helps forks choose models | Small |
| **Voice profile / writing-style injection** | kindling | LOW — niche but powerful for content apps | Medium |
| **Cloudflare Workflow wrapper for long jobs** (>30s) | imgeo | MEDIUM — long AI jobs | Small (DO alarm pattern already captures most of this) |
| **`coerceToString` helper for Workers AI chat outputs** | imgeo | MEDIUM — used by anyone calling chat-style Workers AI models | Tiny |
| **Polymorphic events table pattern** (type + json meta) | ambient-notes | LOW — specific to session-based apps | Medium |

---

## Ranked recommendations

### Ship now (high value, small cost)

1. **Guest-cookie owner middleware** (`ownerMiddleware` from imgeo)
   - File: `src/server/middleware/owner.ts`
   - Contract: resolves auth session FIRST; if absent, mints a cookie `vfs_session=<uuid>` and uses that as `ownerId`. Routes read `c.get('ownerId')` and `c.get('isAuthenticated')`.
   - Pattern: every "jobs" / user-owned resource scopes by `ownerId` (which may be a guest cookie). `getOwnedResource(c, id)` matches EITHER `user_id` OR `session_id`.
   - Starter upside: any fork can build "homepage IS the app" freemium features without hand-rolling anonymous auth.

2. **KV rate-limit middleware** (from imgeo + ambient-notes)
   - File: `src/server/middleware/rate-limit.ts`
   - Contract: sliding-window counter in KV, keyed by IP + endpoint. Returns 429 with `retryAfterSec`.
   - Already vendored into ambient-notes — imgeo's version is very clean (anonymous-submit-limits, hourly + daily buckets). Pick imgeo's.
   - Starter upside: every public endpoint (landing-page demos, login, password reset) needs this.

3. **`coerceToString` helper for Workers AI chat outputs**
   - File: `src/server/lib/ai/coerce.ts`
   - ~15 lines. Handles string / content-parts array / null (thinking mode) output shapes.
   - Starter upside: any code calling chat-style Workers AI (non-`generateText` paths) hits this. Already a common cause of runtime crashes across Jez's projects.

### Ship next sprint (medium value)

4. **Tier config + per-tier limits** (imgeo)
   - File: `src/shared/config/tiers.ts` + `src/server/middleware/tier.ts`
   - Pattern: one TypeScript config object per tier, read by middleware to enforce limits per request. Tier chosen at resource-creation time (job submit, file upload) — locks the user's tier for that resource.
   - Starter upside: nearly every SaaS has a freemium tier; this gives a clean place to put quotas.

5. **Canned demo samples pattern** (ambient-notes)
   - For any feature gated behind a browser permission (mic, camera, files), ship canned samples playable via TTS/WebAudio → synthetic MediaStream (for audio) or inline image fixtures (for vision).
   - Rationale: first-time users click a sample and see the feature work before granting permissions. Huge conversion lift.
   - Not a drop-in module — it's a documented pattern + example implementation in the demo feature.

6. **Markdown + YAML frontmatter export**
   - `src/server/lib/export/markdown.ts` — writes canonical `---\nkey: value\n---\n# Body` shape.
   - Downstream tools (email, Docs, import pipelines) parse the frontmatter. Universal out.

7. **Model bake-off harness** (ambient-notes)
   - `scripts/model-bakeoff.sh` — fires a single prompt through a list of models, diffs outputs.
   - Drops in easily because Workers AI model list is small and stable.

### Ship when time permits (low value / niche)

8. **Voice profile / writing-style injection** (kindling)
   - Upload writing samples, analyse style, inject summary into system prompt on content-generation requests.
   - Specific to content creation tools. Would live behind a feature flag.

9. **Polymorphic events table pattern** (ambient-notes)
   - `events` table with `type` + `meta_json` — extraction + filtering per type.
   - Niche: only useful for apps with a session/timeline model.

### Patterns NOT to fold back

- **Streaming voice DO** — already in starter (vite-flare-starter's `VoiceInputExample` pattern, which ambient-notes extended).
- **Cloudflare Workflow for long jobs** — already covered by the DO-alarm pattern in the starter's agent scaffold and the new issue #19 (agent scheduler).
- **Ambient-notes modes/event types** — domain-specific to field-service/meeting capture.
- **Kindling's hopper/context layout** — domain-specific to content creation.

---

## Recommended commit layout

**Commit 1 — middleware pack:**
- `src/server/middleware/owner.ts` (+ route example)
- `src/server/middleware/rate-limit.ts`
- `src/server/lib/ai/coerce.ts`
- New migration for `guest_sessions` table (or just use the existing better-auth session table with a nullable userId)

**Commit 2 — tier system:**
- `src/shared/config/tiers.ts`
- `src/server/middleware/tier.ts`
- Docs: recipe for adding tier-gated features

**Commit 3 — content patterns:**
- `src/server/lib/export/markdown.ts`
- Scripts: `scripts/model-bakeoff.sh`
- Docs: "Canned demo samples" recipe in CLAUDE.md

---

**Deferred to separate sessions** to keep commits digestible. The connector scaling work (Slack/Notion/Atlassian) is its own bigger piece — shipping that first since it unblocks more future work.
