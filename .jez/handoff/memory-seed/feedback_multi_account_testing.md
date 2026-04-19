---
name: Always test with multiple accounts
description: Test apps with different user accounts to catch ownership/access control bugs early
type: feedback
originSessionId: 81a9b605-104d-47c6-90ea-95d42d80f379
---
Always test with multiple user accounts in any app that has multi-user data.

**Why:** Security audit found that conversation endpoints (load, export, update) had no ownership checks — any authenticated user could read any other user's conversations. This was only caught by a code review agent, not by live testing (which used a single account).

**How to apply:** When testing any app with user data:
1. Create/use at least 2 test accounts
2. Verify that user A cannot access user B's data
3. Check all CRUD endpoints, not just the "happy path" with your own data
4. Include ownership checks in the test-agent.sh suite
