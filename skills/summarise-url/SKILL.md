---
name: summarise-url
description: Fetch a URL and produce a structured summary with title, key points, and an action-oriented takeaway. Use when the user shares a link and asks for a summary, TL;DR, or "what's this about?".
---

# Summarise URL

## When to use
The user has shared a URL and wants a quick understanding without reading the whole thing.

## Steps

1. **Fetch** — use `browser_markdown` to get the page as clean text.

2. **Extract structure** — produce a summary with:
   - **Title** (1 line)
   - **Source** (publisher, author if available, date)
   - **Summary** (2-3 sentences capturing the main point)
   - **Key points** (3-5 bullet points covering the substantive claims or arguments)
   - **Takeaway** (1 sentence: what should the reader do or think differently?)

3. **Length-aware** — if the page is very long (>3000 words):
   - Keep summary to 100 words max
   - Limit key points to 5 maximum
   - Skip filler sections (related links, ads, comments)

4. **Use UI elements where helpful**:
   - `show_alert` for important caveats (paywall, opinion piece, sponsored content)
   - `offer_choices` at the end: "Read in full", "Find related articles", "Save to memory"

## Style
- Be objective. If the article is opinionated, note that — don't echo its tone.
- Avoid hedging language ("seems to suggest"). Be direct.
- Preserve specific numbers and quotes that matter; paraphrase the rest.

## What not to do
- Don't pretend you read more than was returned. If `browser_markdown` returns partial content, say so.
- Don't ignore the date — old articles may be outdated.
- Don't include section headers from the page verbatim — synthesise.
