---
name: Test existing features thoroughly before building new ones
description: Jez strongly prefers verifying current functionality end-to-end before moving on to new work
type: feedback
originSessionId: 3c7ca3d7-9b2d-4446-8e60-4cf77faf1296
---
Before starting new features, thoroughly test the existing ones end-to-end — not just "code compiles" or "endpoint returns 200", but "does the feature actually work for a user from click to outcome".

**Why:** Jez was emphatic on 2026-04-16: "i really cannot express how much i want to make sure everything is working perfectly before we move on to new features". The starter is a pattern library others will fork — a broken-in-a-subtle-way feature teaches the wrong pattern. He also noticed earlier that I'd reported "file attachment done" without ever testing that files actually reach the model.

**How to apply:**
- When a feature involves a pipeline (upload → process → send to model → render response), test each hop with real data, not just unit tests.
- Multi-account, multi-model, multi-format coverage where relevant (e.g. file uploads: PDF + image + txt through a vision model and a non-vision model).
- When Jez asks for a new feature ("can we add X"), and I'm aware the existing related feature hasn't been verified end-to-end, propose testing first before building.
- "Done" means "I watched it work for a real user scenario", not "the code exists".
