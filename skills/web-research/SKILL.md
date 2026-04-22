---
name: web-research
description: Research a topic by searching the web, fetching the most relevant pages as markdown, and producing a well-structured summary with citations. Use when the user asks to research, investigate, find information about, or look into a topic.
---

# Web Research

## When to use
The user wants to learn about something that requires up-to-date information from multiple sources. Examples:
- "Research the latest changes to X"
- "What's the current state of Y?"
- "Find me information about Z"

## Steps

1. **Plan** — break the topic into 2-4 specific search queries that cover different angles. Don't search the same thing multiple ways.

2. **Search** — run `web_search` for each query (one at a time). Aim for 5-10 results each. Skim the snippets to identify the most authoritative sources.

3. **Read** — for the 3-5 most promising results, call `browser_markdown` to get the full content. Prefer official docs, well-known publications, and primary sources over aggregators or content farms.

   When deciding which sources to trust, consult `references/source-trust-heuristics.md` (use `read_skill_resource` with `path: "references/source-trust-heuristics.md"`). It lists high/medium/low trust tiers and red flags.

4. **Synthesise** — write a structured summary that:
   - Opens with a 1-2 sentence direct answer to the user's question
   - Has 3-5 sections covering the key aspects
   - Cites specific sources inline using markdown links: `[Source Title](url)`
   - Notes any conflicts or uncertainty between sources
   - Ends with "Sources" listing all URLs used

5. **Offer next steps** — use `offer_choices` to suggest follow-ups like "Dig deeper into X", "Compare with Y", "Find recent updates", or "Save this research as a file".

## Style
- Be concise. Aim for 200-400 words of summary, not a wall of text.
- Use bullet points and short paragraphs.
- Cite as you go, not in a single block at the end (unless that's all the user wants).
- If sources disagree, say so explicitly — don't paper over it.

## What not to do
- Don't make up facts. If a search returns nothing useful, say so and ask for clarification.
- Don't quote large blocks from sources — paraphrase and link.
- Don't assume one source is authoritative without checking another.
