# Contributing

A short note for fork-builders, AI agents, and anyone shipping on top of
the starter who notices something worth improving.

## TL;DR

- **Issues are welcome** — especially fork-build friction. The good ones
  are diagnostic, not vibes.
- **Upstream contributions are welcome** — if your fork solves a problem
  the starter has, send it back as a PR. Bug fixes, doc tightenings, and
  cleanly-scoped enhancements all get a fast read.
- **Maintainer**: Jez Dawes ([@jezweb](https://github.com/jezweb)) —
  responses are usually within a day, often the same session.

---

## Raising an issue

Recent fork-build issues ([#54](https://github.com/jezweb/vite-flare-starter/issues/54), [#55](https://github.com/jezweb/vite-flare-starter/issues/55), [#56](https://github.com/jezweb/vite-flare-starter/issues/56), [#57](https://github.com/jezweb/vite-flare-starter/issues/57), [#58](https://github.com/jezweb/vite-flare-starter/issues/58))
are great templates — copy that shape. Each had:

1. **Real-world context up front** — *"Discovered during a fork build (RightCover)."*
   Anchors the report to a real scenario, not a hypothetical.

2. **What happens vs what's expected** — concrete observed behaviour, with
   error text or symptoms. Not *"this seems off"* — *"deploy succeeds, the
   domain attaches, but the zone only gets an AAAA record."*

3. **Repro steps** when relevant — three or four lines of CLI / clicks
   that recreate the problem.

4. **Severity** — Trivial / Low / Medium / High / Critical. Be honest;
   over-flagging dilutes the rest of the queue. *"Documentation-only"* is
   a perfectly valid severity.

5. **Suggested fix or workaround** — even *"I don't know what unsticks
   it"* is useful info. If you've already shipped a patch in your fork,
   include the diff inline (3-line patches are common; just paste them).

6. **A short title that names the symptom**, not the area. Compare:
   - 🚫 *"Connectors page issue"*
   - ✅ *"Workers Custom Domain provisioning: only AAAA, no A record"*

This shape lets the maintainer triage in 60 seconds and ship in 5 minutes
instead of bouncing back for clarification. The
[recent doc cluster](https://github.com/jezweb/vite-flare-starter/issues?q=is%3Aclosed+is%3Aissue+label%3Adocumentation)
all closed within a day because the reports made the fix obvious.

### Labels we use

`bug`, `enhancement`, `documentation`, `question`, `good first issue`,
`upstream` (waiting on Cloudflare / a third party), `roadmap` (multi-item
tracker), `claude-suggested` (AI-flagged, might still be worthwhile).

You don't need to label your issue — the maintainer will. Just describe
the thing well.

---

## Upstream contributions are welcome

Forks are encouraged (see [FORKING.md](./FORKING.md)) and the canonical
pattern is "your fork tracks `upstream`". When your fork fixes a problem
that the starter still has, sending the fix back is the cleanest path:

- **Bug fixes** — yes please. Open a PR or, if it's a 3-line patch, paste
  it into a bug issue and the maintainer will land it for you.
- **Doc tightenings** — also yes. The fork-builder lens catches things
  the maintainer missed because they know the starter too well.
- **Enhancements** — open an issue first to check the shape fits the
  starter's "pattern library, not demo" philosophy. We disable modules
  via feature flags rather than deleting them; new modules should follow
  the same disable-able pattern.
- **Refactors** — same: issue first, since refactors usually touch many
  files and the maintainer might be deep in a related slice.

### What "fits the starter" means

The starter is a **pattern library** (see CLAUDE.md). New code should
demonstrate one technique cleanly so the next fork-builder can read it
and learn the pattern for this stack. If your contribution adds a third
way to do something the starter already shows two ways for, that's
usually a sign to refactor the existing pair instead of adding a third.

PR ergonomics:
- One concern per PR
- Clear commit messages (the [recent commit log](https://github.com/jezweb/vite-flare-starter/commits/main)
  is the style — body explains *why*, not *what*)
- Type-check + build clean (`pnpm type-check && pnpm build`)
- If your change is fork-specific (your-product-only), it doesn't belong
  upstream — keep it in your fork

---

## What "good" looks like

The recent fork-build issues from RightCover (Apr 2026) shipped 6 doc
improvements and 1 bug fix in under an hour because the reports were
diagnostic. Everyone wins:

- **The maintainer** ships fixes fast without back-and-forth.
- **Your fork** picks up the fix on the next `git pull upstream main`.
- **Other forks** never hit the issue you flagged.

The opposite — *"thing X feels wrong"* with no diagnosis — costs everyone
a round of clarification before any progress. Don't be that.

---

## License + attribution

The starter is published under its repo licence (see `LICENSE`). Forks
are free to relicence their own additions; upstream contributions stay
under the starter's licence.

You don't need to attribute Jezweb in your fork's UI — the
[fingerprinting checklist in FORKING.md](./FORKING.md#what-gets-fingerprinted-security-checklist)
explicitly walks you through removing markers. We'd appreciate a star on
the GitHub repo if the starter saved you time, but it's not required.
