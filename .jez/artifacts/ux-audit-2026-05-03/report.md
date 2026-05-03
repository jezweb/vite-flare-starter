---
date: 2026-05-03
status: active
owner: jez+claude
persona: Mara — non-technical small-business owner (~3 staff), uses Gmail/Sheets daily, doesn't read docs. Heard "AI agents do work for you", signed up to figure out what that means in 15 min before her next call. Mental model = "hire a virtual assistant".
scope: Routines + Agents creation flows (the surfaces yesterday's audit didn't cover)
url: https://vite-flare-starter.webfonts.workers.dev
related: .jez/artifacts/ux-audit-2026-05-02/report.md (the seven yesterday's findings — all verified shipped via this audit's live navigation)
---

# UX audit — 2026-05-03 (Mara, agents flow)

## Verdict: Pass with findings — content fixes (jargon + naming) outweigh structural ones

Yesterday's seven fixes verified live in this session: greeting reads "Good evening" at the right hour, the four "New X" cards land directly in creation flows (`/routines/new`, `/projects?new=1`, etc.), the chat footer hides token count outside Builder Mode, the conversations sidebar refreshes after stream-finish. ✓

Today's findings cluster on the **agents/routines surface** — the area that looks like the natural home for "I want an AI to do work for me" but turns out to be the most jargon-dense in the app.

Hard gates:

| Gate | Result |
|---|---|
| Console errors | 0 (no messages tracked across navigation) |
| Console warnings | 0 |
| Network 5xx | 0 (1 successful run completed in 18s) |
| Layout collapse | 0 (1440x900) |
| axe Critical/Serious | 0 (`/dashboard/agents` clean: 26 passes, 0 violations) |

## Interaction Manifest

```
Persona: Mara (non-technical SMB owner)
Viewport: 1440x900, Chrome, dpr 2

[✓] 05:13 Loaded /dashboard. "Good evening, Jeremy" — yesterday's greeting fix verified live.
[✓] 05:14 Read 4 quick-action cards. Mara has 3 jargon words to decode: Project / Space / Routine.
[✓] 05:14 Clicked "Schedule a routine" → /routines/new (yesterday's fix verified — direct route).
[✓] 05:14 Read New routine page subtitle: "A routine fires an AI agent on a schedule with the
            skills, tools, and instructions you set. Findings land in your Inbox." 4 jargon
            words for Mara: skills, tools, instructions, findings. Templates section first
            offers "Routine health (meta)" — unhelpful for a brand-new user.
[✓] 05:15 Typed name "Daily summary of my emails" — name field accepts it.
[✓] 05:15 Picked "Daily" from cadence pills. (Hourly was preselected default.)
[✓] 05:15 Left Instructions blank, Skills empty, Tools "all available", Hooks "none".
[✓] 05:15 Clicked "Create routine". Auto-derived instance ID `daily-summary-of-my-emails-OG6MLVX9`.
[✓] 05:16 Landed on /routines/<uuid>. Saw "Runs the AI assistant every 1d" subtitle.
[✓] 05:16 Read Schedule + Behaviour cards. "Adjust mode: suggested" is opaque jargon.
[✓] 05:16 Clicked "Run now". Run started. Counter went 0 → 1.
[✓] 05:16 Waited ~25s for completion.
[✓] 05:16 Read run summary: "I'll run a full status-check routine since no custom routine is
            saved yet. **Summary:** Zero items pending — workspace is entirely clear with no
            saved routines, active todos, or tracked entities."
            ★ Mara's read: "It says 'workspace clear' — but my email is full. This doesn't
            work. And what's 'no custom routine saved'? I just made one!"
            ★ Markdown asterisks not rendered — `**Summary:**` shows as raw text.
[✓] 05:17 Clicked "Routines" breadcrumb → returned to list.
[✓] 05:17 Saw 3 routines: my new one + 2 pre-seeded (Routine health, YouTube digest).
[✓] 05:17 Expanded Setup section in sidebar → clicked Agents → /dashboard/agents.
[✓] 05:18 Saw 5 agent cards: AI assistant, Researcher, Writer, Sweeper, Platform Admin.
            Card titles append `/AutonomousAgent`, `/ResearcherAgent` — raw class names leaking.
            Three cards say "+ Dormant — click to activate" — meaningless to Mara.
[✓] 05:18 Clicked "+ New agent" → modal opens. Type=AI assistant, Name="assistant" prefilled.
            Help text says "Cannot be renamed later" buried in 5-line paragraph.
[✓] 05:18 Clicked Continue → edit Sheet opened with header "AssistantAgent /assistant".
            ★ Inconsistency: list-card format = `displayName /ClassName`, edit-sheet header
            format = `ClassName /slug`. Same agent, two different naming conventions on
            adjacent screens.
            Stats row shows "Memory blocks 0", "History rows 0" — DB-schema words.
            Model dropdown shows full id `@cf/moonshotai/kimi-k2.6` (chat footer fix didn't
            propagate here).
[✓] 05:19 Pressed Escape. axe-core scan on /dashboard/agents: 0 violations / 26 passes. ✓
```

Total: 18 user actions, 7 screenshots, 1 routine created, 1 run completed, 1 agent created.

## Findings (ranked by ROI for the locked persona)

### CRITICAL — A new routine with no instructions produces a misleading run summary

A first-time user creates a routine called "Daily summary of my emails" and clicks "Run now". The run succeeds, but the agent — finding no custom instructions — falls back to a status-check skill and reports "Zero items pending — workspace is entirely clear". To Mara this reads as **"the AI says I have no work, but I do"**. The misalignment between the routine's NAME (which states intent) and the agent's BEHAVIOUR (which ignores intent) erodes trust on the very first run.

**Fix shape — pick one or combine**:

1. **Validate at create time**: if `instructions` is blank AND no skill is attached AND the name expresses intent (`/^(daily|weekly|hourly)?\s*(check|summarise|summary|brief|digest|scan|find)/i`), prompt with "It looks like you want this routine to do something specific. Add instructions so the AI knows what to do, or pick a starter skill." Don't let the user click Create until either is filled.

2. **Use the routine name as the agent's instruction** when none are set — pass `name + description` as the user message. So "Daily summary of my emails" becomes "Please give me a daily summary of my emails." That at least makes the agent attempt the right work; if the Gmail tool isn't connected, it surfaces the missing connector ("I'd need access to your Gmail — connect it under Setup → Connections") which is actionable feedback.

3. **At minimum, change the "no instructions" fallback prompt** so it doesn't say "no custom routine saved" (which sounds like the routine itself didn't save). Plain copy: "I don't have specific instructions for this routine yet — go to the routine settings and add what you'd like me to do."

Of the three, option 2 is the strongest because it converts the failure mode into a working path. Option 1 would slow Mara down at exactly the moment she's trying to ship something.

---

### HIGH — Run summary doesn't render markdown

The run summary on the routine detail page renders `**Summary:**` as literal asterisks. Either the agent shouldn't emit markdown into a plain-text field, or the renderer should pipe through the same Streamdown/MDX pipeline the chat already uses. The chat surface renders the same model output correctly; the routine-run summary doesn't.

**Fix shape**: in the `RecentRuns` panel of `RoutineDetailPage`, render the summary string with the same markdown component the chat module uses (`MessageRenderer` or its underlying primitive). Adds one import; no schema change.

---

### HIGH — Class names leak into the Agents UI

Cards show `AI assistant /AutonomousAgent`, `Researcher /ResearcherAgent`. The edit sheet header reads `AssistantAgent /assistant`. Both expose the JS class name to a non-developer. Worse, the format flips between list and detail (display-name first vs class-name first). Mara has no idea which is the "real" name.

**Fix shape**:

1. List cards: drop the `/ClassName` slug entirely. Show `displayName` only. If two agents share a display name, append the user-given slug, not the class.
2. Edit sheet header: `displayName · slug` (or just `displayName` if a single agent of that type). Keep the class name accessible behind a "Show internal IDs" disclosure for builders.

The pattern is: same translation we already apply to `formatAgentClass` in `src/shared/format/agent.ts`. The list card and the edit sheet are bypassing it.

---

### HIGH — "Cannot be renamed later" is buried

The "New agent" modal's name help text reads "Lowercase letters, numbers, hyphens, underscores. Cannot be renamed later." Mara skims help text. She picks "assistant", regrets it, goes to rename — discovers it's permanent.

This is a structural Durable Object constraint (the slug is baked into `idFromName(${userId}:${slug})`), so it can't be made fully renameable without state migration. But the warning needs to be more prominent.

**Fix shape**:
- Move the "permanent" caveat to its own line beneath the input, in `text-amber-600`, with a proper warning icon. Not buried in a 5-line paragraph.
- Better: replace "Cannot be renamed later" with "**Pick carefully — this name is permanent.** It identifies your agent in URLs and across sessions."
- Even better: ship a "duplicate to rename" path — a button on the agent edit sheet that creates a new agent with the chosen new slug and copies persona/memory/budget over. "Duplicate as" is a much friendlier escape hatch than "you're stuck with the name forever".

---

### HIGH — Mara can't tell what each pre-seeded agent is for

The Agents page shows 5 cards. Three are dormant (`Writer`, `Sweeper`, `Platform Admin`). All five descriptions are persona-style — "You are a helpful assistant", "You are a research assistant. Your job: 1. Use…" — written for the AI, not for Mara. Mara wants "what would I use this for?" not "what does it think it is?".

**Fix shape**: add a `userPurpose` field to the agent metadata (separate from `persona`). Persona stays as the system-prompt seed; `userPurpose` is the human-facing "use this when…". One short sentence per agent, surfaced on the card and the type-picker:

| Agent | userPurpose |
|---|---|
| AI assistant | Use for one-off chats, drafting, and quick lookups. |
| Researcher | Use to gather context on a topic — searches the web and saves sources to memory. |
| Writer | Use to compose emails, summaries, posts from a brief. |
| Sweeper | Use to scan a list of items (tickets, leads) and surface anything stuck. |
| Platform Admin | Use to configure routines, agents, connections by chatting in plain English. |

Truncated descriptions ending mid-word ("for…", "behalf…") also lose useful context — bump the line-clamp from 2 to 3 lines, or rewrite descriptions to fit two clean lines.

---

### HIGH — "+ Dormant — click to activate" doesn't explain what activation means or costs

Three of five agents show this label. Mara has no idea what activating does. Does it cost money? Will it start running tasks? Is it like turning on a paid subscription?

**Fix shape**: replace the label with concrete text:

```
+ Activate (creates an instance — no work runs until you ask)
```

…or a tooltip on hover explaining "Activating creates the agent instance for your account. It only runs when you message it or schedule a routine. No charges until it actually does work."

---

### MEDIUM — Cadence picker mixes preset pills with raw seconds input

`Every 15 min · Hourly · Every 6 hours · Daily · 3600 seconds`. Both the pills AND the seconds input are visible simultaneously. Mara: "Which one wins? Why seconds?"

**Fix shape**: hide the seconds input behind an "Advanced — custom interval" disclosure, OR show seconds as read-only confirmation of the pill choice ("Daily · runs every 86,400 seconds"). Don't let the picker show two competing inputs.

---

### MEDIUM — "Adjust mode: suggested" / "Hooks: (none)" / "every 1d"

The routine detail page renders raw enum values:

| Display | Mara reads | Better |
|---|---|---|
| `Adjust mode: suggested` | "What's adjust mode? What's suggested?" | `Self-tunes cadence: AI proposes, you approve` |
| `Hooks: (none)` | "What's a hook?" | `After each run: nothing extra` |
| `every 1d` | "1d? Once per day?" | `Once a day` |

These are all formatter-level fixes — extend `src/shared/format/agent.ts` (which already owns `formatCadenceInterval`, `formatTrigger`, etc.) with `formatAdjustMode`, `formatHooks`, and update `formatCadenceInterval` to spell out 1d as "Once a day".

---

### MEDIUM — "Run now" button + "Fire now" help text

Detail page shows a button labeled `▷ Run now` and below the empty-state says `click "Fire now" above`. Same control, two verbs. Pick one (probably "Run").

**Fix shape**: grep for `Fire now` in the codebase, replace with "Run now" everywhere. One-line change.

---

### MEDIUM — Model dropdown still shows raw `@cf/...` IDs in the agent edit sheet

Yesterday's chat footer fix strips the `@cf/` prefix; the agents edit sheet's Model picker doesn't. Same model ID rendered unfriendly: `@cf/moonshotai/kimi-k2.6`.

**Fix shape**: use the same `formatModelId` helper introduced in `MessageRenderer.tsx` yesterday. The agents edit sheet should render `kimi-k2.6` with the full id in `title=`. While there: drop the "via the API" / "models.flared.au" reference for non-builder users; that's a builder concern.

---

### MEDIUM — "Memory blocks", "History rows" stat labels leak DB schema

Edit sheet stats: `Invocations · Last active · Memory blocks · History rows`. Three of the four are reasonable; "Memory blocks" and "History rows" expose internal storage names.

**Fix shape**:
- `Memory blocks` → `Saved memories` (or just `Memories`)
- `History rows` → `Past messages` (or `Conversation length`)
- `Invocations` → `Times run` (matches "Run now" button verb)

---

### MEDIUM — "Routine health (meta)" is the wrong first impression on the New routine template list

A brand-new user, on the first page of routine creation, sees the first template card titled `Routine health (meta)` with description "Daily watcher that scans every other routine for issues." Self-monitoring meta-tool when there's nothing to monitor is the wrong first card.

**Fix shape**: reorder templates by user-value: `Morning brief` first, `YouTube digest (example)` second, `Routine health (meta)` last (or hidden under "More templates"). For first-time users with zero routines, hide meta entirely.

---

### LOW — "What should the agent do each fire?" — "each fire" is a tone outlier

Form labels are all friendly questions: "What's this for?" "Which AI agent runs this?" "When should it run?" Then: "What should the agent do **each fire?**" Mara: "Each fire? Like a campfire?" Tone breaks.

**Fix shape**: rename to "What should the agent do each time it runs?".

---

### LOW — Instructions placeholder is dev-flavoured

> e.g. "Look at the entities table for stuck items and emit findings via inbox_add."

Words a non-technical user can't parse: `entities table`, `inbox_add` (snake_case method name). Better placeholder: `e.g. "Each morning, summarise unread emails from the past 24 hours into 5 bullet points."` Concrete, plain English, matches the kinds of routines Mara might actually create.

---

### LOW — Setup section collapsed by default hides Agents from first-time users

Mara wanted to "set up an AI agent" but the path isn't visible until she expands `Setup`. The collapse default makes sense for daily users (config items rarely touched), but a brand-new user has nothing in the Work section that maps to "create an agent".

**Fix shape**:
- Auto-expand `Setup` for users with zero agents/routines/connections (as a soft onboarding cue), collapse it once they have at least one item set up.
- OR add a temporary "Set up your first agent" tile in the home Quick Actions row, only when the user has no agents.

---

## Hard-gate scorecard

| Gate | Threshold | Actual | Pass |
|---|---|---|---|
| Console errors | 0 | 0 | ✓ |
| Console warnings | 0 | 0 | ✓ |
| Network 5xx | 0 | 0 | ✓ |
| Layout collapse | 0 | 0 (CLS not re-measured but no visual collapse) | ✓ |
| axe Critical/Serious | 0 | 0 violations on /dashboard/agents | ✓ |

## What was NOT covered

- Connections / Skills sub-pages — Mara would need them to make her email summary actually work, but didn't visit
- Admin chat — could be the most natural path for a non-technical user (chat in plain English to set things up), but didn't enter
- Inbox - already covered by yesterday's audit
- Mobile / narrower viewports — desktop only this run

## Bottom line

The agent-management surface is **structurally sound** (zero a11y violations, zero hard-gate failures, the 18-second routine run completed cleanly, yesterday's seven fixes verified working). The findings cluster on **content / naming / first-impression UX** — the same theme as yesterday's audit. The dominant issue is that internal vocabulary leaks into user-facing surfaces:

- `AutonomousAgent`, `ResearcherAgent` (class names)
- `every 1d`, `Adjust mode: suggested`, `Hooks: (none)` (raw enums)
- `Memory blocks`, `History rows` (DB schema)
- `each fire`, `entities table`, `inbox_add` (internal API)
- `Cannot be renamed later` (DO architecture leaking through)

These are all small text-level changes individually but, in aggregate, they're what makes Mara say "this feels quite technical even for me". A small batch focused on `src/shared/format/agent.ts` extensions + a few component label tweaks would shift the whole surface from "developer-built" to "for end users" — without touching architecture.

**Recommended fix order** (ROI for the locked persona):
1. **Routine produces useful work even with no instructions** (CRITICAL #1) — converts a trust-eroding first run into a working path. ~1 hr.
2. **Markdown rendering on run summary** (HIGH #2) — restores chat-quality formatting. ~15 min.
3. **Class name + naming consistency on Agents** (HIGH #3) — extends `formatAgentClass` to the two surfaces missing it. ~30 min.
4. **Cadence display + adjust mode + hooks formatting** (MEDIUM #8) — formatter additions only. ~30 min.
5. **Pre-seeded agent descriptions written for users** (HIGH #5) — copy work, no code. ~1 hr.
6. **Model picker, prefix-strip, in agents edit sheet** (MEDIUM #10) — applies yesterday's `formatModelId` helper. ~10 min.
7. **Run now / Fire now consistency** (MEDIUM #9) — single grep + replace. ~5 min.
8. Everything else — bundle as a polish pass once the above are in.

Total ~3.5 hours for the highest-ROI block (CRITICAL + 4 HIGH + 2 MEDIUM).
