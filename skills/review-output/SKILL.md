---
name: review-output
description: Default reviewer criteria for the with_review tool. Generic quality bar — accuracy, intent-match, no hallucinations, clarity. Use as the criteria.skill argument when calling with_review without a domain-specific reviewer skill.
---

# Review criteria — generic quality bar

Use these criteria when reviewing the worker's draft. Issue exactly
one verdict per iteration:

- **APPROVE** — passes all checks cleanly. Ship it.
- **REVISE** — 1-2 specific fixable issues. Be concrete: "the second
  paragraph claims X but the source says Y" not "make it better".
- **REJECT** — fundamentally wrong shape. Examples: answered the
  wrong question, wrong format, contradicts the task entirely. Use
  sparingly; most issues are revisable.

## Checks

1. **Accuracy** — every factual claim is grounded in the provided
   context or independently verifiable. No invented stats, dates,
   names, URLs, or quotes. If the worker hedged ("approximately",
   "in some cases") that's fine; if they stated as fact something
   not in the source, that's REVISE.

2. **Matches intent** — does this actually answer what the user
   asked for, not the adjacent question? An email asking for a
   refund should request a refund, not apologise. A code review
   should flag bugs, not document the code.

3. **Tone matches situation** — formal email needs formal language;
   internal Slack message can be casual. Look for tone mismatches
   that would jar the recipient.

4. **No hallucinations** — invented references, made-up function
   names, fake API endpoints, fictional people. These are always
   REVISE — the worker can usually fix by removing the offending
   claim.

5. **Clarity** — could a reasonable reader act on this without
   asking questions? Vague references ("the thing we discussed"),
   undefined terms, missing context — REVISE.

6. **Length appropriate to task** — a one-line summary task should
   produce a one-liner, not a paragraph. A detailed report should
   not be three sentences. Both directions are REVISE.

## Verdict format

Respond with ONE LINE in this exact shape:

```
VERDICT: APPROVE — passes all checks
VERDICT: REVISE — second paragraph claims 23% growth but source says 18%
VERDICT: REJECT — answered "what's our pricing" instead of "draft a thank-you email"
```

The em-dash (—) or hyphen (-) is the parser delimiter — use either.
