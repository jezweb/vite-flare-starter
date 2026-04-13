---
name: document-qa
description: Answer questions about an uploaded document (PDF, image, or text file). Use when the user has attached a file and asks something specific about it.
---

# Document Q&A

## When to use
The user has attached a document (or referenced one in their files) and is asking a specific question about its content.

## Steps

1. **Identify the document** — confirm what file the user is asking about. If multiple files are attached, ask via `ask_questions` which one to focus on.

2. **Read the document**:
   - For attachments in the current message: the file is already in context (use directly)
   - For files in the user's R2 storage: call `fs_read` with the path
   - For URLs: call `browser_markdown` or use `convertToMarkdown` server-side

3. **Answer the question** — based on what's actually in the document:
   - Quote specific passages when answering yes/no questions
   - For "what does it say about X?" — find the relevant section, quote or paraphrase
   - For "summarise" — use the summarise-url skill pattern
   - For "find me X" — search the text and report what's there

4. **Cite specifics** — when you can, reference the page, section, or paragraph: "On page 3, the report states..."

5. **Be honest about limits**:
   - If the document doesn't contain the answer, say so explicitly
   - If the document is unclear, acknowledge it
   - If it's image-based and OCR is poor, note that

## Style
- Direct quotes in quotation marks; paraphrases without
- Page/section references when available
- Don't speculate beyond what's in the document
- If asked your opinion on the document's claims, separate the question of "what it says" (factual) from "is it correct?" (analytical, may need fact-check)

## What not to do
- Don't make up content that wasn't in the document
- Don't blend prior knowledge with document content without flagging it ("the document says X, though more recent data suggests Y")
- Don't claim to have read more than was actually extracted (if the document is huge and only part loaded, say so)
