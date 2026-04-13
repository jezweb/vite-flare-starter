---
name: plan-task
description: Break a goal into a clear sequence of actionable steps with dependencies and estimated effort. Use when the user describes something they want to accomplish and asks for a plan, breakdown, or "how do I...".
---

# Plan Task

## When to use
- "Help me plan X"
- "How do I do Y?"
- "What's the best way to approach Z?"
- "Break this down for me"

## Steps

1. **Clarify the goal** — restate it in one sentence. If the goal is fuzzy ("improve my website"), use `ask_questions` to nail down:
   - What does "done" look like?
   - Hard constraints (deadline, budget, must/must-not)
   - Resources available (time, skills, tools)

2. **Break into steps** — produce 5-10 concrete steps. Each step should:
   - Start with a verb (Create, Send, Review, Decide, Test)
   - Be small enough to complete in one session
   - Have a clear "done" state

3. **Identify dependencies** — note which steps must happen before others. Don't over-sequence — most steps can run in parallel.

4. **Estimate effort** for each step (S/M/L or hours, depending on context).

5. **Display as progress tracker** — use `show_progress` with all steps marked `upcoming`. The user can update status as they work.

6. **Add a critical path note** — one sentence: which 1-2 steps are most likely to delay everything if they slip?

7. **Offer to act** via `offer_choices`:
   - "Start with step 1"
   - "Save this plan to my files"
   - "Add a deadline"
   - "Adjust the steps"

## Style
- Concrete actions, not abstractions ("Draft the brief" not "Think about scope")
- Right level of detail — for a 1-day task, ~5 steps; for a multi-week project, ~10 with sub-steps
- Realistic estimates — pad for uncertainty, especially first steps

## What not to do
- Don't generate more than 10 top-level steps — that's a sign you should chunk into phases
- Don't include "research the problem" as a step (that's planning, not the work)
- Don't sequence things that can run in parallel just because they "feel" sequential
- Don't end without a clear first step the user can take right now
