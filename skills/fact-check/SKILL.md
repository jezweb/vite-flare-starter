---
name: fact-check
description: Verify a specific claim by finding multiple authoritative sources that confirm or contradict it. Use when the user asks to fact-check, verify, or check whether something is true.
---

# Fact Check

## When to use
The user has stated a specific claim and wants to know if it's accurate. Examples:
- "Is it true that X?"
- "Fact-check this: ..."
- "Did Y actually happen?"

## Steps

1. **Identify the claim** — extract the precise factual assertion. If the claim is fuzzy ("apparently X is good"), use `ask_questions` to nail down what specifically to verify.

2. **Search for primary sources** — use `web_search` with the claim phrased neutrally. Look for:
   - Official sources (government sites, academic papers, the organisation involved)
   - Reputable journalism (major outlets with editorial standards)
   - Primary data (statistics agencies, public records)

3. **Avoid these as sole sources**:
   - Social media posts (use only as leads to follow up)
   - Single-source blogs without citations
   - Anything that quotes the claim back without independent verification

4. **Cross-reference** — find at least 2-3 independent sources. If they all trace back to one origin, you only have one source.

5. **Report verdict** — use `show_alert` with the appropriate type:
   - `success` — Confirmed (multiple authoritative sources agree)
   - `warning` — Partly true / context needed
   - `error` — False (sources contradict the claim)
   - `info` — Unverifiable (insufficient evidence either way)

6. **Provide evidence** — list the sources with what each one says. Use markdown links.

## Style
- Be neutral. Avoid editorialising.
- Distinguish "X is false" from "I couldn't find evidence for X" — these are different.
- If the claim is partly true, be specific about which parts.

## What not to do
- Don't trust a single source, even an authoritative one, for contested claims.
- Don't conflate "common knowledge" with verified fact.
- Don't fabricate confidence — uncertainty is a valid finding.
