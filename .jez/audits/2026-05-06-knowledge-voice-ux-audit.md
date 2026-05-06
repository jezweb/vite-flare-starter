---
date: 2026-05-06
status: active
url: https://vite-flare-starter.webfonts.workers.dev
persona: busy SME owner, first-time user
scope: Knowledge module + Voice mode (mic button on chat input)
viewports: 1440×900 desktop · 390×844 mobile
verdict: Pass with 5 polish findings (0 hard-gate failures)
owner: jez+claude
---

# Knowledge + Voice — UX audit, 2026-05-06

Interaction-first audit run with playwright-cli session `audit-knowledge`,
authenticated via `/api/test-auth/cookies` minting a one-shot session.

## Hard gates

| Gate | Result |
|---|---|
| Console errors | **0** ✓ |
| Console warnings | **0** ✓ |
| Network 5xx | **0** ✓ |
| Layout collapse @ 1440px | **0** ✓ |
| Layout collapse @ 390px | **0** ✓ |

## Interaction Manifest (real interactions, not DOM sweep)

1. Mint test-auth cookie via `/api/test-auth/cookies` → user
   `audit@test.vite-flare.local`
2. Set HttpOnly session cookie via `playwright-cli cookie-set`
3. Navigate to `/dashboard/knowledge` → empty state renders with 3-tip
   list + "New doc" CTA
4. Click empty-state "New doc" link → arrives at `/dashboard/knowledge/new`
5. Fill title="Brand voice guide", summary="Tone, style, and word choices…",
   body="# Brand voice\n\nWe write warm, direct…", tags="brand, voice, style"
6. Confirm character counter updates: "147 chars · ~37 tokens" ✓
7. Click "Injection mode" combobox → dropdown opens with 3 options
8. Select "Always active" → combobox value updates
9. Click "Create" button → POST /api/knowledge → 201 → navigate to
   `/dashboard/knowledge/<uuid>`
10. Browser title updates to "Brand voice guide · Vite Flare Starter" ✓
11. Navigate back to `/dashboard/knowledge` → list shows 1 card with
    "Brand voice guide", "Always active" badge, "~37 tok", tag chips
12. Budget banner shows: "1 always-active doc · ~37 tokens baked into
    every chat's system prompt." ✓
13. Navigate to `/dashboard/chat` → chat page mounts, voice button visible
14. Voice button initial label = "Enable voice mode" ✓
15. Click voice button → label flips to "Hold to record · click to
    disable voice mode" ✓
16. localStorage `chat:voiceMode:<userId>` = "1" ✓
17. Hover voice button → tooltip renders "Voice mode active / Hold to
    speak · click to disable" ✓
18. Click voice button again → label flips back to "Enable voice mode" ✓
19. Resize to 390×844 → re-navigate to /dashboard/knowledge,
    /dashboard/knowledge/:id, /dashboard/chat → no horizontal overflow,
    voice button still hits at x=69, y=779
20. Resize back to 1440×900 → take final reference screenshots

Network confirmed to consist exclusively of 200-status calls to the
deployed origin. No 3rd-party domains hit.

## Findings

### F1 — High · UX · Voice button "click to disable" triggers stray recording

When voice mode is enabled, the button is BOTH a hold-to-record control
AND a tap-to-disable toggle. With the current pointer-event handlers, a
single quick click still fires `pointerdown → startRecording()` THEN
`pointerup → stopRecording()` THEN `click → setEnabled(false)`. Net
effect: microphone briefly activates, a request to `/api/voice/transcribe`
goes out with 100ms of (likely silent) audio, and only afterwards does
the toggle settle. From a user's POV: "I clicked once but the mic LED
flashed and the network panel shows a transcribe call I didn't ask for."

**Severity**: High (privacy + unexpected network call). No 5xx — server
correctly returns "no speech detected" 200 — but the side-effect is
surprising.

**Fix**: Track recording start time. If `pointerup` fires within 250ms,
treat as a tap → bail out of stopRecording and let the click handler
toggle the mode off without a transcribe attempt.

**File**: `src/client/modules/chat/components/VoiceModeButton.tsx`

### F2 — Medium · UX · Empty-chat copy doesn't surface voice mode

The empty-state subtitle on a fresh chat reads:
> "Ask anything, drop a file, dictate with the mic, or pick a starter below."

That copy was written when only `VoiceDictationButton` existed. With
voice mode shipped, "dictate with the mic" is now ambiguous — there are
TWO mic-shaped buttons on the input row (one of which is
feature-flagged off by default in the starter; only the new voice mode
button shows). A first-time SME user has no way to discover that
clicking the mic enables a "have a conversation" mode separate from
"speak instead of type".

**Severity**: Medium · discoverability gap, not a functional bug.

**Fix**: Update the empty-state subtitle to mention voice mode
explicitly, e.g. "Ask anything, drop a file, or click the mic for
voice mode."

**File**: `src/client/modules/chat/pages/ChatPage.tsx` (empty-state
copy, ~line 800-900 area)

### F3 — Medium · UX · Detail-page Save button enabled even when nothing changed

`canSave` only checks that `title`/`summary`/`body` are non-empty — it
doesn't compare current values against the loaded server state. Result:
Save is always enabled on an existing doc, even if the user just opened
it and made no changes. Tapping Save sends a redundant PATCH and the
"Knowledge doc saved" toast fires for a no-op. Users also get no
"unsaved changes" affordance.

**Severity**: Medium · functionally fine, but degrades trust in the
saved/unsaved indicator.

**Fix**: Track `originalSnapshot` from `detail.data?.knowledge`,
compare against current form state via deep equal, gate `canSave` on
`isDirty || isNew`. Optional polish: dim Save button when not dirty,
show "Saved" timestamp under the title.

**File**:
`src/client/modules/knowledge/pages/KnowledgeDetailPage.tsx`

### F4 — Low · UX · Summary label hint wraps awkwardly on mobile

On the detail page, `<Label>` renders the field name + the inline hint
"Shown in the catalog so the agent knows when to load this doc." in
the same flow. At 390px viewport this hint wraps below the field name
making the label region 2-3 lines tall before the input appears.
Functional, just visually cramped.

**Severity**: Low · cosmetic. Same pattern works fine at desktop.

**Fix**: Convert inline hint to a separate `<p class="text-xs
text-muted-foreground">` rendered AFTER the input, mirroring the
pattern used in `MODE_OPTIONS` description below the injection-mode
combobox.

**File**:
`src/client/modules/knowledge/pages/KnowledgeDetailPage.tsx`

### F5 — Low · Code consistency · Empty-state CTA bypasses Link

The Knowledge empty state's "New doc" button uses
`window.location.href = '/dashboard/knowledge/new'` rather than the
React Router `<Link>` primitive used elsewhere on the same page (the
PageHeader `New doc` button is correctly a Link). Forces a full page
reload + breaks Cmd+click → new-tab.

**Severity**: Low · works, but inconsistent.

**Fix**: Pass `action={{ as: Link, to: ... }}` or wrap the EmptyState
button in a Link. Quickest path: replace the `onClick` handler with a
`navigate('/dashboard/knowledge/new')` from `useNavigate`.

**File**:
`src/client/modules/knowledge/pages/KnowledgePage.tsx`

## What I did NOT test (deferred or out of scope)

- **End-to-end voice round-trip in browser**: tested at the API level
  via TTS→ffmpeg→transcribe loopback (Phase 7 commit `afca706`); the
  browser MediaRecorder path requires real mic permission which can't
  be granted from a headless Playwright run.
- **Always-active body actually appearing in chat-agent system prompt**:
  the API tier confirms `loadAlwaysActiveKnowledge()` returns the doc
  and `listKnowledgeCatalog()` excludes it (because injectionMode='always'),
  but I didn't tail logs to see the full prompt assembly. Code-side
  confidence is high (mirrors skills' 8b pattern that's been working).
- **Voice button hardware mic permission flow** — first-tap permission
  prompt UI varies per browser/OS. Worth adding a friendly "this needs
  mic access" empty state if `getUserMedia` is rejected.
- **Project + org scope pickers** — Phase 5 work per the build spec.

## Summary

Two new surfaces shipped in this session — Knowledge module
(/dashboard/knowledge + detail) and Voice mode (chat input mic button).
Both pass all hard gates and the documented golden paths. Five polish
findings, all High/Medium/Low — no Criticals, no functional blockers.

Fixes proposed inline; will be applied in the same session per
`~/.claude/rules/ship-then-audit-then-fix-same-session`.

## Reference screenshots

- `2026-05-06-desktop-knowledge-list-populated.png` — list page after
  creating one always-mode doc (shows banner + card)
- `2026-05-06-desktop-knowledge-detail.png` — edit form with all
  controls
- `2026-05-06-mobile-detail.png` — detail page stacked at 390px wide
- `2026-05-06-mobile-chat-loaded.png` — chat empty state with voice
  button visible on the input row
