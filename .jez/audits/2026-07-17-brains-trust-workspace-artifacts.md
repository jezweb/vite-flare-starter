---
date: 2026-07-17
status: complete
owner: claude
topic: WorkspacePanel + durable versioned artifacts (#40) pre-commit review
panel: openai/gpt-5.6-sol, anthropic/claude-opus-4.8, google/gemini-3.1-pro-preview
cost: ~$0.35
---

# Brains-trust — workspace panel / artifacts server module

Scope: `server/modules/artifacts/` (schema/store/routes), artifact chat
tools, share-tokens `artifact` resolver. Client verified live in Chrome
(create → auto-open viewer → edit → v2 stepper → publish → anonymous
resolve).

## Fixed before commit

| Finding | Reviewers | Fix |
|---|---|---|
| `latestVersion` read-modify-write race → silent lost versions | sol, opus, gemini | Atomic `latest_version + 1` UPDATE…RETURNING allocates the number |
| Non-atomic create/delete leave zombie or content-less artifacts | sol, opus, gemini | `db.batch()` for create (artifact+v1) and delete (versions+artifact) |
| `getLatestVersion` trusts denormalised pointer → transient null on public share path | opus | Reads MAX(version) instead of the pointer |
| SQLite LIKE has no default escape char — backslash "escaping" broken | sol, opus, gemini | Explicit `LIKE ? ESCAPE '\'` sql fragment; also escapes `\` itself |
| GET /:id returned every version's full code (D1/Worker response-size DoS) | sol, gemini | `listVersions` = metadata only; new `GET /:id/versions/:v` for code |
| Unscoped conversations join could leak a foreign conversation title | sol, opus | Join carries `scopeUser(conversations.userId)` |
| Hardcoded `eq(userId)` in store broke shared-tenancy collaboration (teammate edits silently forked) | gemini | Store scope uses `scopeUser` like everything else |
| Edit could flip a chain's type (markdown → script-capable html) while a share link is live | opus (M2), sol (type-not-versioned) | Type pinned at creation; edits keep the original type |
| Fork-on-unknown-id indistinguishable from a chained edit | opus | `forked: true` echoed in store result + tool output |
| Unbounded title/code input | sol | zod caps: title 300, code 300 KB |

## Dismissed with reasons

- **opus C1 "share serves latest version, not the reviewed one"** — live links
  are the documented design (Google-Docs semantics; claude.ai artifact links
  behave the same). The real escalation inside it (type-flip to html) is
  closed by type pinning. Documented in SECURITY.md §7b with the
  pin-the-version recipe for forks that want immutable snapshots.
- **sol "200-row list cap without pagination"** — accepted for v1, noted in
  code; the gallery is per-user and artifacts accrue slowly.
- **opus M1 "verify token→entity binding"** — verified: the public endpoint
  derives entityId from the token row (SHA-256 lookup), never from the request.

## Live-verification notes

- Mid-rollout WS send failure observed once right after a deploy (conversation
  row never created) — retried clean; transient isolate replacement, matches
  the earlier webhook rollout artefact from v2.0.1 testing.
- Kimi K2.6 needed output-embedded steering (`next` field on create result) to
  reliably call edit_artifact instead of forking a duplicate via create — tool
  descriptions alone were not enough. Worth remembering for any tool pair with
  a "then continue with X" contract.
