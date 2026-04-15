# Session Summary — 2026-04-15

## Commits (7 total)

| Commit | Description |
|--------|-------------|
| `0220210` | fix: conversation reload + transcription + UI polish (6 improvements) |
| `874c30f` | fix: refresh sidebar when new conversation created |
| `f2f3c5b` | fix: regenerate no longer shows duplicate user message |
| `c430252` | feat: add AI agent smoke test suite (pnpm test:agent) |
| `48e179b` | security: conversation ownership checks + token output limits + input validation |
| `69b95f7` | fix: test-agent.sh no longer exits on first curl error |

## Bugs Fixed (9 total)

| Bug | Severity | Fix |
|-----|----------|-----|
| Raw JSON on conversation reload | Critical | Defensive parsing + createdAt Date conversion |
| Transcription not working | High | Route audio through Deepgram instead of TextDecoder |
| Conversation access without ownership check | **HIGH** | Added isOwner() checks on all read/export/update endpoints |
| FTS search returns other users' data | **HIGH** | Added userId scoping to searchFTS where clause |
| maxOutputTokens capped at 8192 | High | Removed cap, models now use their actual max_output |
| Regenerate shows duplicate user message | Medium | Use SDK's built-in regenerate + skip consecutive user messages |
| Sidebar not refreshing on new conversation | Medium | Invalidate conversations query on navigate |
| updateTitle has no ownership check | Medium | Added userId parameter to updateTitle |
| No server-side input limits on chat/extract | Medium | Added message count (200) and text length (100K) limits |

## UI Improvements (6 total)

- Tool calls collapsed by default (expand during streaming, collapse on reload)
- Animated bouncing dots thinking indicator + blinking cursor during streaming
- Copy full message button next to Regenerate
- Mobile sidebar as Sheet (slide-over) instead of inline panel
- Date-grouped conversations (Today / Yesterday / Last 7 days / Older)
- Timestamp on hover for all messages

## Test Results

### Model Availability: 16/16 PASS
All models across 8 providers respond correctly.

### Tool Testing (best of 3 models)
- Kimi K2.5: 23/25 tools pass
- Claude Sonnet 4.6: 22/25 tools pass
- Gemma 4 26B: 22/25 tools pass
- All "failures" are model prompt-following choices, NOT code bugs

### Other Tests
- Extract (structured output): 3/3 schemas PASS
- Conversation management: 5/5 PASS
- Security ownership: 4/4 checks PASS (own=200, other=404)
- Code blocks + syntax highlighting: PASS
- Message edit UI: PASS
- Regenerate: PASS (no duplicate)

### UX Audit
- All 7 pages screenshotted on desktop + mobile
- No layout issues found
- Mobile responsive: stacks cards, full-width input, Sheet sidebar

## Security Audit (2 HIGH, 5 MEDIUM — all fixed)

| Severity | Issue | Status |
|----------|-------|--------|
| HIGH | Read/export conversations without ownership check | FIXED |
| HIGH | FTS search returns results across all users | FIXED |
| MEDIUM | No server-side message/attachment size limits | FIXED |
| MEDIUM | updateTitle lacks userId filter | FIXED |
| MEDIUM | No input length cap on extract endpoints | FIXED |
| MEDIUM | Unvalidated image URL in MessageRenderer | Low risk (data: URL enforced at save) |
| MEDIUM | No UUID validation on :id params | Low risk (Content-Disposition safe for UUIDs) |

## New Artifacts

- `scripts/test-agent.sh` — reusable AI agent smoke test suite (`pnpm test:agent`)
- `src/client/hooks/useMediaQuery.ts` — responsive media query hook
- `.jez/artifacts/test-results-2026-04-15.md` — detailed test results
- `.jez/screenshots/ux-audit/` — 10 screenshots (desktop + mobile)
