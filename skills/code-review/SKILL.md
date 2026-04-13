---
name: code-review
description: Review code for bugs, security issues, performance problems, and style. Use when the user pastes code, shares a file, or asks "what's wrong with this code?".
---

# Code Review

## When to use
- User pastes code in chat
- User attaches a code file
- User asks for review, audit, "find bugs", "security check"

## Steps

1. **Identify scope and language** — what's being reviewed, in what language? If multiple files involved, ask which to focus on first via `ask_questions`.

2. **Read the code carefully** — don't skim. For files in `fs`, call `fs_read`.

3. **Categorise findings**:
   - **Bugs** (incorrect behaviour, will fail at runtime)
   - **Security** (injection, auth bypass, exposed secrets, unsafe deserialization)
   - **Performance** (N+1 queries, unnecessary loops, blocking ops)
   - **Reliability** (missing error handling, race conditions, resource leaks)
   - **Style** (naming, formatting, idiomatic patterns)
   - **Design** (architecture, coupling, complexity)

4. **Filter ruthlessly** — only report issues you're confident about. Skip:
   - Style nits if the user asked about bugs
   - Theoretical problems with no evidence in this code
   - Personal preferences disguised as best practices

5. **For each finding, provide**:
   - **Severity**: critical / high / medium / low
   - **Line reference** if available
   - **What's wrong** (one sentence)
   - **Why it matters** (one sentence)
   - **Suggested fix** (code snippet)

6. **Display the findings**:
   - For 1-3 findings: render inline as markdown
   - For more: use `show_data_table` with columns: Severity, Line, Issue, Fix
   - Use `show_alert` (`error` type) for any critical findings at the top

7. **Summarise** — one paragraph: overall code quality, biggest concern, recommended next action.

8. **Offer next steps** via `offer_choices`:
   - "Apply the critical fix"
   - "Show me how to test this"
   - "Review another file"
   - "Explain finding [N]"

## Style
- Direct but not harsh. Critique the code, not the coder.
- Show, don't tell — code suggestions speak louder than abstract advice.
- Acknowledge what's good if there are bright spots.

## What not to do
- Don't make up issues to seem thorough
- Don't suggest sweeping rewrites unless asked
- Don't mix style nits with critical bugs in the same list (separate by severity)
- Don't claim certainty about runtime behaviour you can't verify (note assumptions)

## Optional: actually run the code
If `run_python` or `run_shell` tools are available and the code is safe to execute, run it with the user's permission to verify:
- Does it execute without errors?
- Does the output match expected behaviour?

Use `confirm_action` first: "Should I run this code in the sandbox to test it?"
