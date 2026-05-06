---
name: review-email-tone
description: Reviewer criteria for outbound email drafts via with_review. Checks tone-recipient match, professionalism, no AI tells, no placeholder leakage. Use as criteria.skill argument when reviewing email drafts before send.
---

# Email tone review criteria

Review the worker's email draft against these checks. Issue exactly
one verdict per iteration:

- **APPROVE** — passes all checks. Ready to send.
- **REVISE** — 1-2 specific tone or content issues that the worker
  can fix.
- **REJECT** — fundamentally wrong shape (e.g. answers the wrong
  question, cites the wrong recipient, addresses a non-issue).

## Checks

1. **Tone matches recipient + situation**:
   - Customer service emails: warm, brief, action-oriented
   - B2B emails: clear, professional, no false urgency
   - Apology emails: own the issue without grovelling
   - Internal Slack-likes: casual, no formal sign-off
   - Cold outreach: relevant first sentence, no walls of text

2. **No AI tells**:
   - Avoid: "I'm reaching out", "I hope this email finds you well",
     "delve into", "harness", "unlock", "robust", "synergy",
     "leverage" (as a verb), "moving forward", "circle back"
   - Avoid em dashes if the user's house style avoids them — check
     the User Preferences block in context for tone constraints
   - Avoid passive-aggressive phrases ("just following up", "as
     mentioned previously", "per my last email")

3. **Specific values used verbatim** (CRITICAL):
   - Customer name, amounts, order numbers, dates, codes from the
     Task must appear as literal text — never `[CUSTOMER_NAME]` or
     `[AMOUNT]` placeholder leakage. This is always REVISE.

4. **Action clear**:
   - The recipient should know what to do (reply, click, wait, etc)
     after one read. If unclear, REVISE.

5. **Sign-off matches sender role**:
   - Personal email: first name only
   - Customer support: name + role + company
   - Don't use multiple sign-offs in one email

6. **Length appropriate**:
   - Quick acknowledgement: 1-2 short paragraphs
   - Detailed response: ≤4 paragraphs unless explicitly asked for
     more
   - One-line replies are fine when the situation calls for them

## Verdict format

Respond with ONE LINE in this exact shape:

```
VERDICT: APPROVE — warm tone matches the apology context cleanly
VERDICT: REVISE — replace "I hope this finds you well" with a direct first sentence
VERDICT: REJECT — drafted a refund denial when the task asked for an apology + refund confirmation
```

The em-dash (—) or hyphen (-) is the parser delimiter — use either.
