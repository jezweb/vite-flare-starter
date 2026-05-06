---
name: review-code-security
description: Reviewer criteria for AI-generated code via with_review. Checks for security issues (injection, auth bypass, secret leakage), correctness, and project conventions. Use as criteria.skill when generating code that touches data, auth, or external systems.
---

# Code security review criteria

Review the worker's code draft against security + correctness
checks. Strict: when in doubt, REVISE rather than APPROVE.

## Critical checks (any failure = REVISE)

1. **No SQL injection vectors**:
   - String concatenation into queries: REVISE
   - User input passed to `sql.unsafe()` without param array: REVISE
   - Drizzle / parameterised queries: OK

2. **No secret leakage**:
   - Hardcoded API keys, tokens, passwords in the draft: REVISE
   - Logging full request bodies that might contain secrets: REVISE
   - Returning provider error responses verbatim (often contain
     API keys in URLs): REVISE

3. **Auth checks present**:
   - Routes that read/write user data must check `c.get('userId')`
     or equivalent
   - Routes that mutate must check ownership (the row's userId
     matches the caller's userId)
   - Admin-only routes must check role

4. **No prototype pollution**:
   - `Object.assign(target, untrustedInput)` where target is shared
     state: REVISE
   - Deep merges of user input into config: REVISE

5. **No SSRF**:
   - `fetch(userProvidedUrl)` without scheme/host validation: REVISE
   - URL parsing with allowlist: OK

## Quality checks (single failure = REVISE; multiple = REJECT)

6. **Error handling at boundaries**:
   - External fetches wrapped in try/catch
   - Returns structured errors (not raw provider responses)

7. **No silent failures**:
   - Empty catch blocks: REVISE
   - Errors logged then swallowed without explanation: REVISE

8. **Project conventions**:
   - Uses Drizzle, not raw D1 (where available)
   - Uses Hono context, not Express patterns
   - Imports from `@/server/...` not relative `../../../`

## When to APPROVE

- All 5 critical checks pass
- All quality checks pass or have one minor REVISE-worthy item that
  was already addressed

## When to REVISE

- 1-2 specific issues from the lists above. Be concrete: "line 12
  concatenates `userId` into the query string — switch to
  `eq(table.userId, userId)`"

## When to REJECT

- Multiple critical security issues
- The code answers a different question (wrong API, wrong table,
  wrong file scope)
- Architectural mismatch — uses patterns the project explicitly
  avoids per its CLAUDE.md

## Verdict format

```
VERDICT: APPROVE — auth check + parameterised query + error handling all present
VERDICT: REVISE — line 18 logs the full request body which contains the API key in headers
VERDICT: REJECT — uses raw SQL string concat for the user-supplied filter; multiple injection vectors
```
