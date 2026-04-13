---
name: save-research-doc
description: Save a piece of research, notes, or content to the user's filesystem as a well-organised markdown document with metadata. Use when the user asks to save, archive, file away, or "keep this for later".
---

# Save Research Document

## When to use
- "Save this for me"
- "File this under [topic]"
- "I want to keep this research"
- After producing a substantial result the user wants to retain

## Steps

1. **Identify what to save** — usually it's the most recent assistant output. If ambiguous, confirm via `ask_questions`.

2. **Decide on path and filename**:
   - Top-level folder by topic: `research/`, `notes/`, `briefs/`, `code/`, `drafts/`
   - Filename with date for time-sensitive content: `YYYY-MM-DD-slug.md`
   - Otherwise descriptive slug: `analyse-pricing-strategy.md`
   - All lowercase, hyphens not spaces

3. **Add frontmatter** — the document gets YAML frontmatter for searchability:
   ```yaml
   ---
   title: [Document title]
   created: [ISO date]
   tags: [tag1, tag2]
   summary: [One-sentence summary]
   sources: [optional list of URLs cited]
   ---
   ```

4. **Format the body**:
   - H1 title at the top
   - Source content cleaned up (preserve markdown formatting)
   - Inline source links if research-based
   - Footer with "Last updated: [date]"

5. **Write the file** — call `fs_write` with the path and content.

6. **Confirm and offer follow-ups**:
   - Show the path and size via plain message
   - Use `offer_choices`: "Open the file", "Save another version", "Add to a topic index", "Done"

## Style
- Generous structure. Use headings, bullet points, dividers — make it scannable later.
- Always add the date — future you needs to know when this was true
- Cross-link related saved docs if you know about them (call `fs_list` to check)

## What not to do
- Don't save without permission if the conversation didn't explicitly ask
- Don't overwrite without warning. Check `fs_read` first; if exists, ask via `confirm_action`
- Don't save sensitive data (passwords, keys, personal info that shouldn't be persisted)
- Don't dump raw chat transcript — synthesise the useful content
