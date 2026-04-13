---
name: draft-email
description: Write a professional email tailored to a specific recipient, purpose, and tone. Use when the user asks to draft, write, or compose an email.
---

# Draft Email

## When to use
The user wants to send an email and needs help writing it. They may have a clear ask ("draft an email to my client about the delay") or a vague one ("help me email Bob").

## Steps

1. **Gather context** — if any of these are unclear, use `ask_questions`:
   - Recipient (name + relationship: client, colleague, friend, stranger)
   - Purpose (informing, requesting, apologising, declining, follow-up)
   - Tone (formal, friendly, urgent, gentle)
   - Specific information to include
   - Any constraints (length, must-mention items)

2. **Recall context** — call `recall` for any saved facts about the recipient (e.g. previous email threads, preferences) if relevant.

3. **Draft the email** with this structure:
   - **Subject line** — specific, action-oriented (not "Hi" or "Following up")
   - **Greeting** — appropriate to the relationship
   - **Opening** — one sentence stating purpose if direct, or a brief warm acknowledgement if relationship-based
   - **Body** — ideally 2-4 short paragraphs. One idea per paragraph.
   - **Action/ask** — clearly state what you need from them and by when (if applicable)
   - **Closing** — appropriate sign-off

4. **Show as a contact card** if you're drafting to someone whose details should be confirmed: use `show_contact`.

5. **Offer to refine** — use `offer_choices` with "Make it shorter", "More formal", "More casual", "Add a specific point", "Looks good".

## Style guidelines
- Match the tone the user signals — don't override their preferences.
- For formal: avoid contractions, use full names with titles, careful subject line.
- For casual: contractions OK, first names, conversational.
- For Australian English: use Australian spelling (recognise, organise, colour) unless told otherwise.
- Keep emails short. Most should be under 200 words.

## What not to do
- Don't write "I hope this email finds you well" or other empty opener filler.
- Don't apologise excessively — one acknowledgement is enough.
- Don't include made-up details (dates, prices, names) — use placeholders like [DATE] if information is missing.
- Don't write a wall of text — break it up.
