---
name: morning-brief
description: Generate a personalised morning briefing covering weather, news, schedule, and saved priorities. Use when the user asks for a morning brief, daily summary, or "what's happening today?".
---

# Morning Brief

## When to use
- The user asks for a morning brief, daily digest, or summary of the day
- A scheduled task fires (cron-triggered briefing)

## Steps

1. **Recall context** — call `recall` and `search_memory` to pull:
   - Location (for weather)
   - Topics of interest (news filtering)
   - Active projects or priorities
   - Personal preferences (tone, length)

2. **Gather inputs in parallel** — these can run independently:
   - Weather: `web_search` for "weather [location] today" or use `browser_extract` on a weather site
   - News: `web_search` for top news in saved topics
   - Calendar/tasks: if a calendar tool is available, query it; otherwise mention "no calendar configured"

3. **Compose the brief** with this structure:
   - **Greeting** (1 line, time-appropriate: "Good morning, [name]")
   - **Today's outlook** (1-2 sentences: weather, big-picture)
   - **News highlights** (3-5 bullet points with markdown links)
   - **On your radar** (saved priorities, deadlines coming up)
   - **Suggested focus** (1 sentence: what to prioritise today)

4. **Render with UI**:
   - Use `show_metric_cards` for at-a-glance items (temperature, top story count, deadlines)
   - Use `show_timeline` if the user has scheduled events
   - Otherwise, plain markdown

5. **Save the brief** — call `fs_write` to save to `briefs/YYYY-MM-DD.md` for later reference.

## Style
- Brief and skimmable. Total length 200-400 words max.
- Time-zone aware. Use the user's local time.
- Skip generic greetings ("Hope you have a great day!") — be substantive.
- If something failed (e.g. weather API down), note it briefly and continue.

## What not to do
- Don't generate news headlines without searching first (no fabrication)
- Don't include unread emails count without checking — this isn't email triage
- Don't be overly cheerful or motivational
- Don't repeat the same brief format daily — vary the focus based on what's actually changing
