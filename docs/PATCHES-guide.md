# Patches Guide — Keeping forks mergeable with upstream

When you fork `vite-flare-starter` (or any Jezweb starter) and customise
it for a client or product, you inevitably diverge from upstream. Three
months later you want a bug fix or new feature from upstream, and the
merge is a mess.

This guide describes the convention we use to make that merge tractable.
It's a lightweight agreement between the humans and Claude Code sessions
building on our starters — not a build system or framework.

**Audience:** you and me. If you're wondering what this even is, start with
[README.md](../README.md) and [FORKING.md](../FORKING.md) first.

---

## The three layers, in order of preference

### 1. Prefer extension points to edits

Most fork customisations should NOT edit shared code. The starter ships
with extension points that cover the common cases:

| Change | Use this, not a code edit |
|---|---|
| Hide a module | `VITE_FEATURE_*` feature flags in `.dev.vars` |
| Rebrand (name, token prefix, favicon) | `src/shared/config/app.ts` + env vars |
| Add a nav item / reorder the sidebar | `src/shared/config/nav.ts` |
| Add a skill | `skills/<name>/SKILL.md` (bundled) or `POST /api/skills/github` |
| Add an agent tool | New file in `src/server/modules/chat/tools/`, register in `tools/index.ts` |
| Add an OAuth connector | Entry in `src/shared/config/connector-providers.ts` |
| Add a D1 table | New migration in `drizzle/` — timestamp-prefixed |

If a customisation fits here, no marker is needed. If the same kind of
fork customisation keeps requiring a code edit in shared files, open an
issue — that's a signal the starter needs a new extension point.

### 2. Annotate unavoidable edits with `@fork-patch` markers

For customisations that genuinely need to edit a shared (upstream) file,
put a comment block directly above the changed code:

```typescript
// @fork-patch[auth-no-email-password]
// Removed email/password provider — this client only uses Google OAuth.
// See PATCHES.md for rationale.
const providers = {
  google: { /* ... */ },
  // email: emailAndPasswordProvider(...)  ← removed
}
```

Rules:

- Marker lives on the lines immediately above the divergent block.
- `[patch-id]` is lowercase-kebab-case, matches an entry in `PATCHES.md`.
- Use the language's native comment form (`//`, `#`, `<!-- -->`, `/* */`).
- One marker per divergent block. If the fork changes 8 lines of a file in
  3 separate spots, that's 3 markers (not 1, not 8).
- **Never put markers in fork-owned files.** New files, client-specific
  directories, fork-prefixed modules don't need markers — they ARE the fork.

### 3. Summarise every marker in `PATCHES.md`

Every `@fork-patch[id]` in the code must have a matching entry in the
repo-root `PATCHES.md`. The entry explains WHAT changed and WHY in
human-readable form. Entries record current state, not history — if a
divergence goes away (patch upstreamed, or extension point added), delete
the entry and the marker.

See the entry template at the top of [PATCHES.md](../PATCHES.md).

---

## Worked example

**Scenario:** A client runs enterprise Google Workspace and their
security policy prohibits password auth. Our fork needs to remove the
email/password login.

**Step 1 — Code edit + marker:**

```typescript
// src/server/modules/auth/providers.ts

// @fork-patch[auth-no-email-password]
// Removed email/password provider. Client (Acme Corp) requires
// Google-SSO-only per their security policy. Drafted 2026-03-12.
export const providers = {
  google: googleProvider({ ... }),
  // email: emailAndPasswordProvider(...)  ← removed
}
```

**Step 2 — Entry in `PATCHES.md`:**

```markdown
## auth-no-email-password

**Added:** 2026-03-12
**Applied against upstream:** 965d77c  (or v0.8.4 if upstream tags)
**Files:**
- src/server/modules/auth/providers.ts
- src/client/pages/Login.tsx

**What:** Removed the email/password auth provider. Fork only supports
Google OAuth.

**Why:** Client security policy prohibits password-based auth.

**Upstream drift risk:** Medium. If upstream changes the provider registry
shape, this patch re-applies cleanly. If upstream rewrites the login page
structure, the Login.tsx patch may conflict.
```

**Step 3 — Done.** No script to run, no CI check to pass. The marker +
entry is the contract. Future Claude Code sessions working in this fork
will grep the code, see the marker, read PATCHES.md, and understand why
that block looks different.

---

## When NOT to use markers

- **Fork-owned new files** — they're not divergence from upstream, they're
  additions. No marker needed.
- **Generated files** — `dist/`, `.wrangler/`, lockfiles. Don't edit these
  by hand.
- **Whole-file rewrites** — if the fork replaces an entire upstream file
  with something different, annotate at the top of the file with ONE
  marker rather than peppering every divergent block.
- **Configuration overrides via env vars or the config files listed in
  Layer 1** — that's what extension points are for.

---

## Upgrading a fork from upstream

No automated workflow yet (see [PATCHES.md design doc](https://docs.google.com/document/d/1qf-sQWGhUA7SSjQ3cT8N6mqbaTHHsB6klsP1wFq-ewY) Phase 3). Manual process:

1. `git remote add upstream https://github.com/jezweb/vite-flare-starter.git`
   (once, per fork)
2. `git fetch upstream`
3. `git checkout -b upgrade/upstream-YYYYMMDD`
4. `git merge upstream/main`
5. For each conflicted file: check `PATCHES.md` for entries whose Files list
   contains this file, re-apply the patch intent, update the marker +
   entry's `Applied against upstream` field to the new upstream commit.
6. `pnpm type-check && pnpm build && pnpm test`
7. Open a PR, review, merge.

Ask Claude Code to drive steps 4-5 in a separate session with the
PATCHES.md content in context — it's well-suited to "re-apply this
intent to reconciled code."

---

## Migration numbering

The starter uses **timestamp-prefixed migrations** (`drizzle.config.ts`
has `prefix: "timestamp"`). When a fork adds a migration, Drizzle
generates `20260424_142530_add_foo.sql` — globally unique, no collisions
with upstream's numbering.

If a migration originates from upstream and you port it forward during a
merge, add a comment at the top:

```sql
-- Originally upstream migration 0022_config_diff_proposals (renumbered on merge)
```

Mirrors the Rails engines convention. Rare to need this — most
upstream-originated migrations just merge cleanly with their upstream
timestamp intact.

---

## FAQ

**Why not just `git diff upstream/main`?** Diff shows you every line that's
different including formatters, whitespace, refactors. Markers + PATCHES.md
tell you the SUBSET that's intentional divergence, and WHY.

**Do I need this if my fork is tiny?** No. If you've changed <5 files and
you know why, skip the ceremony. The moment a stranger (or a future Claude
Code session, or you six months later) would have to guess, add the
markers and entries.

**What if I'm building a fork that will never merge upstream again?** Then
this convention doesn't help you. Delete PATCHES.md, remove the markers,
and move on. The convention is specifically for forks that intend to stay
in sync with an evolving upstream.

**Does Claude Code need special instructions?** No — the existence of
PATCHES.md + markers is self-describing. CLAUDE.md has a pointer to this
guide so agents load it when relevant.
