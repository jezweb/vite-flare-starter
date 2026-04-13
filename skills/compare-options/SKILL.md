---
name: compare-options
description: Evaluate multiple choices side-by-side based on relevant criteria, then present a comparison the user can act on. Use when the user asks to compare options, choose between alternatives, or weigh up X vs Y.
---

# Compare Options

## When to use
- "Compare X and Y"
- "Which is better, A or B?"
- "Help me choose between..."
- "What are the trade-offs of...?"

## Steps

1. **Identify the options and criteria**:
   - **Options**: what's being compared? If unclear, ask via `ask_questions`.
   - **Criteria**: what matters to the user? Common ones: price, quality, speed, ease of use, support. If unclear, propose 3-5 via `ask_questions` (multi-select).

2. **Research each option** in parallel:
   - For products/services: `web_search` for reviews + `browser_extract` on official pages for specs
   - For technical choices: `web_research` skill on each option
   - For internal options: use information already in context

3. **Score each option against each criterion**:
   - Use specific values where possible (price, dates, sizes)
   - Use boolean for present/absent features
   - Use short text ("excellent", "limited", "good") for qualitative

4. **Display the comparison**:
   - Use `show_comparison` with each option as a card, features as the criteria
   - Highlight the one that scored best overall (set `highlight: true`)
   - Add `cta` buttons so the user can pick

5. **Add a recommendation** — one paragraph explaining your top pick and why, including who would prefer the alternative. Be specific about the trade-offs.

6. **Offer to dig deeper** via `offer_choices`:
   - "Tell me more about [winner]"
   - "Compare additional criteria"
   - "Add another option"
   - "I'll go with [winner]"

## Style
- Be balanced. Even your top pick has downsides — name them.
- Quantify where possible. "Costs 30% more" beats "expensive".
- Match the user's stakes — for a casual choice, keep it brief; for a major decision, be thorough.

## What not to do
- Don't recommend an option you didn't research
- Don't hide trade-offs to make a recommendation cleaner
- Don't add features to the comparison that none of the options have ("Option A doesn't support X, but neither do the others — drop it")
- Don't make a single-choice comparison ("X is good") — comparison requires alternatives
