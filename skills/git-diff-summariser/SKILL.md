---
name: git-diff-summariser
description: Summarise a git diff into a short change description, risk assessment, and suggested commit message. Use when the user asks to review changes, draft a commit message from a diff, or wants a high-level overview of what was edited.
compatibility: Works with any git diff text. No git access needed — the diff is provided as input.
---

# Git diff summariser

## When to use
The user pastes or points at a git diff and wants a summary rather than reading it line-by-line.

Examples:
- "Summarise this diff"
- "Draft a commit message for these changes"
- "What changed in this PR?"

## Steps

1. **Get the diff content.** Either the user pasted it, or they point at a file — use `fs_read` on a `.diff` / `.patch` file. If you have sandbox access and a git repo cloned in `/workspace`, the shell script below can regenerate the diff.

2. **Run the bundled counter** (optional quick-stats pass). This gives accurate line/file counts without the model having to count manually:
   ```
   run_skill_script({
     name: "git-diff-summariser",
     path: "scripts/count.sh",
     stdin: <the diff content>
   })
   ```
   Returns stdout like:
   ```
   files_changed: 7
   insertions: 142
   deletions: 38
   binary_files: 1
   ```

3. **Read the diff yourself.** The stats tell you the shape; now actually read the diff to understand what changed. Group changes by file or by logical theme (not by commit).

4. **Produce four sections.**
   - **Summary** — one paragraph: what was the goal of these changes?
   - **Changes** — bullet list grouped by theme, each with the file(s) affected
   - **Risk** — anything that could break? (migrations, auth, public API, env vars, cron schedules)
   - **Commit message** — a single-line subject + optional body, conventional-commits style (`feat(module): …`, `fix(module): …`, `refactor(module): …`)

5. **Offer next steps.** `offer_choices`:
   - "Write this as a PR description"
   - "Generate a test plan for these changes"
   - "Flag any missing tests"

## Style

- For the commit subject line, imperative mood, ≤72 chars.
- Risk section should be honest — if there's no risk, say "Low — isolated changes to X".
- Don't restate what the stats already show; the reader has them.
- Reference files by relative path — `src/foo.ts` not `a/src/foo.ts`.

## What not to do

- Don't invent file names. If you're unsure, re-read the diff headers.
- Don't mark changes as "probably safe" without having read them.
- Don't produce a 20-bullet change list for a 50-line diff. Be proportional.
