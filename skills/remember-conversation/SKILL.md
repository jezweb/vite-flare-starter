---
name: remember-conversation
description: Review the current conversation and save key facts to long-term memory. Use when the user asks you to remember things from this chat, save important info, or "remember this for next time".
---

# Remember Conversation

## When to use
- User says "remember this", "save that", "for next time"
- End of a productive session where context should persist
- User shares personal info that will be relevant later (preferences, identity, projects)

## Steps

1. **Identify save-worthy facts** — review the conversation for:
   - **Identity**: name, role, location, timezone, language preference
   - **Preferences**: tone, formats, tools they like/dislike
   - **Projects**: things they're working on, with dates and goals
   - **Relationships**: people they mention (clients, colleagues)
   - **Decisions**: choices made that should inform future advice
   - **Constraints**: deadlines, budgets, requirements

2. **Skip ephemeral content** — don't save:
   - Specific questions that were answered (that's task context, not memory)
   - Passing remarks that won't matter later
   - Things you can re-derive from session messages

3. **Structure each fact** — call `remember` for each one:
   - Use namespaced keys: `identity.name`, `prefs.tone`, `projects.starter-kit.goal`
   - Keep values concise — one fact per save
   - Include a `description` so future searches make sense

4. **Avoid duplicates** — call `recall` first to check if a similar key exists. Update via `remember` (it upserts) rather than creating a duplicate key.

5. **Confirm what was saved** — use `show_data_table` listing the keys you stored, with columns for key, value, and description.

6. **Offer next steps** via `offer_choices`:
   - "Save more"
   - "Review what's saved"
   - "Forget specific items"
   - "Done"

## Style
- Neutral and factual. Don't editorialise on what the user said.
- One fact per save. Don't bundle multiple into a single value.
- Lowercase namespaced keys with dots (`prefs.theme.colour`).

## What not to do
- Don't save things the user explicitly told you not to remember
- Don't save passwords, API keys, or sensitive data ever
- Don't assume — if unsure, ask first via `ask_questions`
- Don't dump the whole conversation into memory — be selective
