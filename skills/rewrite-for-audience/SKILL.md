---
name: rewrite-for-audience
description: Rewrite text for a different audience, tone, length, or format while preserving the core meaning. Use when the user asks to rewrite, rephrase, simplify, formalise, or adapt text for a specific audience.
---

# Rewrite for Audience

## When to use
The user has source text and wants it adapted. Examples:
- "Rewrite this for a non-technical audience"
- "Make this more formal"
- "Simplify this paragraph"
- "Turn these notes into a press release"
- "Rewrite for LinkedIn"

## Steps

1. **Identify the rewrite parameters** — if not specified, ask via `ask_questions`:
   - **Audience** (technical experts, general public, executives, customers, students)
   - **Tone** (formal, conversational, persuasive, neutral, urgent)
   - **Format** (email, blog post, social media, summary, script)
   - **Length** (shorter, longer, same)

2. **Read the source carefully** — identify:
   - Core message (what must survive the rewrite)
   - Specific facts/numbers (must remain accurate)
   - Voice/perspective (first/second/third person)

3. **Rewrite** — apply transformations:
   - **Simpler language**: replace jargon with plain terms; shorter sentences
   - **More formal**: avoid contractions, use precise vocabulary, third person
   - **More casual**: contractions OK, conversational rhythm, second person
   - **For executives**: lead with the conclusion/ask, support with brief evidence
   - **For social media**: hook in first line, scannable, one idea
   - **For non-experts**: define jargon, use analogies, examples first

4. **Preserve facts** — never change numbers, names, dates, or specific claims.

5. **Show comparison** if useful — use `show_comparison` to display original vs rewritten side-by-side.

6. **Offer iterations** — use `offer_choices`: "Make it shorter", "More technical", "Different tone", "Looks good".

## Style notes
- For Australian audiences: Australian English spelling, no Americanisms
- Match the source's structure unless format is being changed
- Don't add information that wasn't in the source
- Keep the same point of view unless the rewrite calls for change

## What not to do
- Don't dumb down to the point of inaccuracy
- Don't add jargon to make it "sound smarter"
- Don't change the meaning — adapt how it's said, not what's said
- Don't pad to hit a length target — be concise
