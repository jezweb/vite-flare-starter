# Brains-trust: What's New release-notes feature

**Date:** 2026-08-03
**Change under review:** `src/server/modules/updates/`, `src/client/modules/updates/`,
nav badge plumbing, `scripts/changelog-post.mjs`, migration `20260803015122_changelog_entries`.

## Panel

Four labs, none Anthropic (the code was written by Claude, so a Claude
reviewer is the one seat guaranteed to share the author's blind spot).

| Seat | Model | Notes |
|---|---|---|
| OpenAI | `openai/gpt-5.2` | The skill's default `gpt-5.6-sol` does not exist on OpenRouter; 5.2 is current |
| Moonshot | `moonshotai/kimi-k3` | 20k reasoning tokens, 32k budget needed |
| Alibaba | `qwen/qwen3.7-max` | |
| Google | `google/gemini-3.6-flash` | |

Total cost ≈ **$0.65**. Model IDs verified against the live OpenRouter
registry before the run, not from memory.

A local Fable seat was also briefed at the outward axis (whole-repo
consumers of the changed nav types). Its findings are not counted toward
cross-validation — it shares the author's lineage.

## Findings acted on

### Fixed before commit

**1. `POST /entries` was a check-then-insert, not an atomic upsert.**
Raised by all four labs (GPT-5.2 Critical, Qwen Critical/High, Kimi H1,
Gemini High). Two concurrent deploys with the same `releaseKey` could both
see "no existing row" and race; one would 500 on the unique index, which
defeats the whole point of the idempotency guarantee.
Fixed with a real `onConflictDoUpdate`. The pre-`SELECT` survives but is
now explicitly advisory — it only decides the reported `created` flag and
the status code, never whether a duplicate can exist.

**2. `PUT /seen` read-modify-write race.** Raised by all four (GPT-5.2
Critical, Qwen Medium, Kimi H2, Gemini Low). Two concurrent calls could
both read the old marker and the later write would move it backwards; the
non-atomic insert path could also duplicate `user_meta` rows.
Fixed with an atomic upsert whose conflict clause keeps the max:
`CASE WHEN json_extract(excluded.value,...) > json_extract(user_meta.value,...)`.
Fixed-width ISO-8601 UTC strings sort lexicographically in chronological
order, so a string comparison is correct here.

*Verified at source, because the fix depends on it:* the required
`user_meta_user_key_idx` unique index exists in migration
`0006_add_user_meta.sql` and in the applied database. Without it SQLite
rejects the `ON CONFLICT` outright — which is exactly how the test caught
it, since the hand-rolled test fixture had omitted the index.

**3. `entryInputSchema.partial()` leaked Zod defaults into PATCH.**
Gemini only (High), so a single vote — but the skill says claims about
library internals must prove themselves by execution rather than
argument, and this one did:

```
base.partial().parse({ title: 'x' })
→ { title: 'x', category: 'feature', highlight: false, publish: true }
```

`.partial()` does **not** strip `.default()`. Every `if (input.x !== undefined)`
guard in the PATCH handler was therefore always true, so a title-only edit
silently republished a draft and wiped its category and highlight.
A single-reviewer finding that turned out to be the most serious real
defect in the change. Fixed with a dedicated `entryPatchSchema` carrying
no defaults, pinned by a unit test on the schema itself.

**4. A re-post with `publish: false` could unpublish a live entry.**
GPT-5.2 High. A deploy rerun with a stray `--draft` would yank a live
entry out of users' sight. Publication is now sticky across re-posts.

**5. The nav item hid itself on *error*, not just on empty.** Three labs
(GPT-5.2, Kimi M1, Gemini M3). With `retry: false`, one failed summary
request left `data` undefined for the session and the item stayed hidden
even though entries existed. Now three states: hide on a successful empty
read, hide while the first read is in flight, **show on error**.
Note Qwen explicitly praised hiding-while-loading as good UX, so that half
was kept deliberately — the fix is only about the error case.

**6. `useNavBadges()` returned a fresh object literal every render**,
defeating the `useMemo` in `AppSidebar` that consumed it. GPT-5.2 Low,
Qwen Medium. Memoised.

**7. `PUT /seen` accepted an arbitrary future date when nothing was
published.** Gemini Medium. With no published entries there was no
ceiling, so a poisoned marker would silence every entry published
afterwards. Ceiling now falls back to `now`.

**8. `PATCH`/`DELETE` removed from the API-token allowlist.** GPT-5.2
High, on blast radius. Automation amends by re-POSTing the same
`releaseKey`, so it never needs an arbitrary entry id. A leaked deploy
token can now add a note but cannot rewrite or erase published history.
The admin UI is unaffected — session auth does not consult that table.

**9. `GET /entries` returned a misleading `total`.** Kimi M4. It was the
page length, capped at `limit`. Renamed to `count` with a comment, so a
fork does not wire it to an "N updates" label.

**10. Drafts were a dead end in the UI.** Kimi M3. `--draft` could create
one but nothing could publish it without calling the API by hand. Added a
Publish/Unpublish action to the admin card.

### Considered and rejected

**The command palette still lists a hidden "What's new".** Kimi M2.
Verified at source: `CommandPalette.tsx:209` and `DashboardLayout.tsx:52`
both read `NAV_SECTIONS` directly, which is the intended design — the
config stays plain serialisable data. The palette offering a real route
that renders a proper empty state is not a defect, and making the palette
badge-aware would spread the runtime dependency further than it needs to
go. Documented in the module README instead.

**PATCH cannot clear nullable fields / ignores `releaseKey`.** GPT-5.2
Medium. Half-taken: the new `entryPatchSchema` accepts an explicit `null`
for `version`, but `releaseKey` is deliberately not patchable — it is the
idempotency key, and letting it be rewritten would let an admin
retroactively collide two deploys' identities.

**Pagination on `GET /entries`.** Kimi M4's second half. A changelog with
more than 50 published entries is not a problem this starter has; the
`limit` cap is documented and adding real pagination is a fork's call.

**`changelog-post.mjs` argument parsing is naive** (`--title --body x`
sets title to `"--body"`). GPT-5.2 Low. True, but the script fails loudly
on a missing `--body` and this is a hand-run release tool, not a parser.
Not worth a dependency or 30 lines of hand-rolled parsing.

## What the panel got wrong

Nothing dangerous, but worth recording: three of the four reviewers rated
the two race conditions as the top finding, and none of the three that
saw the PATCH handler noticed the Zod defaults bug that was actually
corrupting data on a normal single-user edit path. The races need
concurrent deploys to bite; the defaults bug fired every time. Severity
ranking from a panel tracks how dramatic a failure sounds, not how often
it happens.

## Verification after the fixes

- `pnpm type-check` — 0 errors
- `npx vitest run` — 37 files, 291 tests, all passing
- `pnpm build` — clean, `UpdatesPage` chunk emitted
- End-to-end against a local `wrangler dev` with real tokens and a real
  browser session: idempotent double-post yields one row, non-admin write
  403s, drafts invisible to non-admins, banner appears once and stays gone
  after dismissal, nav dot clears, zero console errors, both themes.
