---
name: meeting-notes
description: Turn a meeting audio recording into structured notes — attendees, agenda items discussed, key decisions, action items with owners, and open questions. Save the result as a Markdown file. Use when the user attaches an audio file of a meeting or explicitly asks for meeting notes from audio.
---

# Meeting notes from audio

## When to use
The user provides a meeting recording (audio file attachment or an existing audio file in their filesystem) and wants structured notes — not a verbatim transcript.

Examples:
- "Summarise this meeting recording"
- "Get me the action items from this call"
- "Turn [audio.mp3] into meeting notes"

## Steps

1. **Transcribe.** Call `transcribe_audio` with the audio source (attachment bytes or file path). The tool auto-detects language.

2. **Structure the notes.** Write a concise markdown document with these sections. Omit sections that have no content — don't leave empty headings.

   - `# {Title or "Meeting notes"} — {date}`
   - `## Attendees` — names mentioned; mark ones you're unsure about with `(?)`
   - `## Summary` — 2-3 sentences: what was the meeting for, what got decided
   - `## Discussion` — bullet list of the main topics covered, one line each
   - `## Decisions` — numbered list of concrete decisions with context
   - `## Action items` — `- [ ] {action} — {owner} ({due date if mentioned})`
   - `## Open questions` — things raised but not resolved
   - `## Follow-ups` — items deferred to a future meeting

3. **Save to the user's filesystem.** Call `fs_write` with `path: "meetings/{YYYY-MM-DD}-{slug}.md"` and the content. Use today's date unless the meeting clearly happened on a different day (mentioned in the audio).

4. **Show the result inline.** Render the notes in chat so the user can scan them without opening the file. Add a note of where you saved it (`users/<you>/meetings/...`).

5. **Offer follow-ups.** Use `offer_choices`:
   - "Email me these notes"
   - "Generate a Word doc from this"
   - "Add action items to my todo list"
   - "Extract decisions as a CSV"

## Style

- Prefer paraphrasing over verbatim quotes — meeting notes are summaries.
- Use tense consistent with the meeting (past for decisions, present for action items).
- Be specific about owners — "Jez" is better than "someone".
- If a dollar figure, date, or number is mentioned, include it exactly.
- Action items as checkboxes so the user can tick them off directly.

## What not to do

- Don't invent names. If you can't identify a speaker, write "Speaker 2" or "the PM".
- Don't include filler ("Yes, yes, yes, go on, right") — strip chit-chat.
- Don't transcribe the entire meeting back as text. Keep it under 400 words unless the user explicitly wants detail.
- Don't speculate about implied actions. Only include things someone explicitly committed to.
