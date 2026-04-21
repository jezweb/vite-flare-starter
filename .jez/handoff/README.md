# Handoff to `ivy-vite-flare-starter`

**Author**: Claude Code session on Jez's main Mac, 2026-04-20
**Audience**: the Ivy specialist about to spin up on the dedicated / shared Mac mini
**Purpose**: transfer the lived context that doesn't survive a fresh clone

---

## Why this folder exists

When `ivy-vite-flare-starter` comes online, it inherits:

- The full git history of `jezweb/vite-flare-starter` ✓
- All 16 tracked markdown files in `.jez/artifacts/` ✓
- `~/Documents/.jez/` via Syncthing (proposals, playbooks, knowledge) ✓
- Global `~/.claude/rules/` on the mini's Claude Code setup ✓

It does NOT inherit, because those are per-machine Claude Code artefacts:

- The auto-memory files at `~/.claude/projects/-Users-jez-Documents-vite-flare-starter/memory/` on Jez's Mac — 9 memory files accumulated over weeks of sessions
- The full conversation transcript `.jsonl` — weeks of UX audits, decisions, false starts, corrections
- The "which audit superseded which" / "why Extract uses whitespace-pre-wrap" / "why modules stay hidden not deleted" context

This folder (`.jez/handoff/`) is a committed snapshot of the load-bearing bits, so a fresh specialist can catch up in one read.

---

## First-session checklist for the new specialist

Read these, in this order, before touching any code:

1. **`CLAUDE.md`** (root of the repo) — the starter's philosophy, tech stack, patterns table
2. **`FORKING.md`** — how forks are expected to diverge, so you understand your "users"
3. **This file** (`.jez/handoff/README.md`)
4. **`.jez/handoff/memory-seed/MEMORY.md`** and all the files it indexes — user prefs, feedback patterns, project context
5. **`.jez/handoff/decisions.md`** — load-bearing decisions and their reasoning (below)
6. **`.jez/handoff/pending.md`** — what's open, what's deferred, what's abandoned
7. **`.jez/artifacts/ux-audit-2026-04-19-pt2.md`** — most recent audit findings doc; phases 1-5 shipped, M6/M7 remain
8. **`.jez/artifacts/session-status-2026-04-18.md`** — session-continuity snapshot from mid-April
9. **Skim** the rest of `.jez/artifacts/` to see the rhythm and tone of past work

Then populate your specialist workspace: `CLAUDE.md`, `HEARTBEAT.md`, `status.md`, `learnings.md`, `discoveries.md` per the `ivy-l2chat` pattern, seeded from the three docs in this folder.

---

## Loading the memory seed into Claude Code

The memory files in `.jez/handoff/memory-seed/` are a snapshot of what was in the previous Claude Code auto-memory. Copy them into the specialist's auto-memory directory on first boot:

```bash
# On the Mac mini, from the cloned repo:
mkdir -p ~/.claude/projects/-Users-{user}-Documents-vite-flare-starter/memory
cp .jez/handoff/memory-seed/*.md ~/.claude/projects/-Users-{user}-Documents-vite-flare-starter/memory/
```

Substitute `{user}` for the actual user account name on the mini. The path is derived from the project's absolute path, dash-escaped — check `ls ~/.claude/projects/` after a first session to see what Claude Code named it, then move files in.

After this, future Claude Code sessions will load these memories automatically (via `MEMORY.md` as the index).

---

## Companion docs in this folder

- **`decisions.md`** — why things are the way they are
- **`pending.md`** — what's open, deferred, and abandoned
- **`memory-seed/`** — 9 memory files + MEMORY.md index to seed Claude Code auto-memory

All are committed; all survive the clone.

---

**Last Updated**: 2026-04-20
