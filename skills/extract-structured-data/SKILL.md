---
name: extract-structured-data
description: Extract structured data (JSON) from messy text, documents, or web pages. Use when the user asks to extract, parse, structure, or pull data out of unstructured content.
---

# Extract Structured Data

## When to use
The user has unstructured content (email, document, web page, transcript) and wants specific fields extracted as structured data.

## Steps

1. **Identify the schema** — what fields does the user want? If unclear, propose one via `ask_questions` or just `offer_choices` with common templates:
   - Contacts (name, email, phone, company)
   - Events (title, date, location, attendees)
   - Products (name, price, description, sku)
   - Tasks (title, due, assignee, priority)
   - Custom (ask user to list fields)

2. **Get the source content**:
   - For URLs: use `browser_extract` — Cloudflare Browser Rendering's `/json` endpoint runs Workers AI extraction natively, very efficient
   - For attachments: read the document content (already in context or via `fs_read`)
   - For plain text in the message: use directly

3. **Extract** — for browser-based extractions, prefer `browser_extract` because it's done server-side. For other content, extract using your own reasoning.

4. **Validate** — check the extraction:
   - Required fields populated?
   - Numbers are numbers, dates are dates?
   - Anything obviously wrong (e.g. email field contains a phone number)?

5. **Display** — use `show_data_table` to render the extracted records cleanly. Columns should match the schema fields.

6. **Offer next steps** via `offer_choices`:
   - "Save as CSV"
   - "Add another field"
   - "Re-extract with different schema"
   - "Looks good"

## Style
- Be precise about what's missing. Use `null` or empty string consistently — pick one and document it.
- Preserve original casing and formatting where possible
- For dates, normalise to ISO 8601 (YYYY-MM-DD) unless told otherwise

## What not to do
- Don't infer values that aren't in the source. If a field is missing, say so — don't guess.
- Don't reformat numbers (e.g. "$1,234.56" — keep as-is unless asked)
- Don't deduplicate without permission — the user may want all records
