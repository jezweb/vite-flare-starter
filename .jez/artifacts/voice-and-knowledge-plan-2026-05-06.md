---
date: 2026-05-06
status: active (planned, not yet built)
specs:
  - .jez/artifacts/voice-mode-build-spec-2026-05-06.md
  - .jez/artifacts/knowledge-module-build-spec-2026-05-06.md
owner: jez+claude
---

# Voice mode + Knowledge module — combined plan

Two features identified at end of 2026-05-06 session as the next
deliberate gaps in the starter. Distinct enough to ship in separate
sessions, planned together because they came from the same
"what's missing?" conversation.

## Voice mode — quick recap

Today: voice INPUT works (VoiceInputExample DO + VoiceDictationButton).
Voice ROUND-TRIP doesn't — no native "talk to my ChatAgent and get
spoken reply." ElevenLabs widget exists but talks to ElevenLabs'
hosted agent, NOT our ChatAgent.

The gap: a "Voice mode" toggle in chat that wires
**mic → Workers AI Nova-3 STT → ChatAgent (our tools/skills/memory) →
Workers AI Aura 2 TTS (free) OR ElevenLabs TTS (paid, better) →
speakers**. Push-to-talk or continuous.

Why it matters: hands-free chat is a real product surface for any
fork shipping mobile/wearable/in-car experiences. Today's dictation
button is "speak instead of type" — voice mode is "have a
conversation."

## Knowledge module — quick recap

Today's primitives (memories, projects, files, skills) cover
procedure (skills), small structured facts (memories), and one-off
attachments (files), but there's a gap: **long-form indexed
reference documents that aren't procedures**. Crosbe-AI worked
around this with `schema-context.ts` (TS module imported into
build). Kindling has writing-context (similar shape). Rightcover
has broker-rules-as-skill (wrong shape — rules are reference, not
how-to).

The gap: a knowledge primitive sitting between `memories` (8KB cap,
"facts") and `skills` (procedures). Per-scope (user/project/org),
≤100KB markdown bodies, FTS5 indexed, two injection modes (always /
on-demand) mirroring `always_active` skills.

Why it matters: every fork has currently invented a workaround for
"big static reference doc the agent should know." Pattern earns its
keep when 3+ projects show the same shape.

## Sequencing

Recommended: **Knowledge first, Voice second.**

| Phase | Effort | Why this order |
|---|---|---|
| **Knowledge module** | ~4-6h | Closes a gap visible across 3+ existing forks today. Composes with everything (skills, projects, chat agent). Shipping it lets users start putting reference docs in NOW. |
| **Voice mode** | ~3-4h | Strict additive feature — doesn't unblock anything else. Ship after Knowledge so "ask voice mode about my Knowledge" is a real demo. |

## Open decisions

### Knowledge module

1. **Reuse memories module or create sibling?**
   Memories already has scope + scopeId + name + description +
   content. Knowledge would be content cap 100KB (vs 8KB), FTS5
   index, optional Vectorize chunking, and a "format" field (md vs
   json vs html). Distinct enough to be a sibling table; sharing
   the routes layer is over-coupling.
   **My vote: sibling table `knowledge_documents`, sibling module
   `src/server/modules/knowledge/`, sibling UI `/dashboard/knowledge`.**

2. **Categories / types?**
   Crosbe-AI had implicit types (schema docs, query reference). A
   `category: 'reference' | 'faq' | 'glossary' | 'runbook' | 'spec'`
   field gives the UI grouping + the agent a hint about what to
   load when.
   **My vote: free-text `tags: string[]` first; promote categories
   to enum if patterns emerge.**

3. **Injection budget?**
   `always` mode bakes the body into every prompt. With 100KB caps
   one always-mode doc is ~25K tokens — bigger than most system
   prompts. Need a soft-cap (warn at >2 always-mode docs or
   >10K total tokens) and surface the cost in UI.
   **My vote: warn + show estimated tokens per doc + total. Hard
   cap at 50K total for safety.**

4. **Search vs RAG?**
   FTS5 keyword search is cheap + works server-side. Vectorize
   semantic chunks cost more but find concept-related docs.
   **My vote: FTS5 in v1; add Vectorize chunks behind a feature
   flag in v2 once we see how people use it.**

### Voice mode

1. **Push-to-talk or continuous?**
   PTT is simpler (no VAD), explicit, no feedback-loop risk.
   Continuous needs voice-activity-detection + push-to-mute + agent
   to know when to wait vs speak.
   **My vote: PTT for v1. Continuous in v2 after dogfood.**

2. **TTS provider?**
   Workers AI Aura 2 is free (no key) but US-English-leaning.
   ElevenLabs is paid but multilingual + voice cloning.
   **My vote: Aura 2 default (free), ElevenLabs opt-in via env
   key.** Same shape as our model picker.

3. **STT timing?**
   We have Workers AI Nova-3 STT in `VoiceInputExample` already.
   Voice mode reuses it.

4. **Where does voice mode live?**
   - (a) In-page toggle on the existing ChatPage
   - (b) Dedicated `/dashboard/chat/voice/:conversationId` route
   - (c) Modal overlay on top of any chat
   **My vote: (a) — toggle on ChatPage. Same conversation, same
   tools, just different IO.**

## Risks

- **Knowledge prompt-bloat**: 100KB markdown × 3 always-mode docs
  blows the context window. Mitigation: token estimate + soft cap.
- **Voice mode echo / feedback**: speaker output picked up by mic.
  PTT eliminates this; continuous mode needs VAD + suppression.
- **TTS latency**: Aura 2 returns full audio, not streaming. Can
  feel slow on long replies. Mitigation: chunk TTS by sentence.
- **Knowledge vs Skills overlap**: both are markdown, both inject
  into prompts. Risk: users putting procedures in knowledge or
  reference in skills. Mitigation: docs + the categories nudge.

## What this plan is NOT

- Replacing memories. Memories stay for small structured facts.
- A full RAG framework. v1 is FTS + simple injection; semantic
  retrieval is v2.
- An ElevenLabs widget replacement. The existing widget (third-
  party hosted agent) is a different product surface — keep it.
- A voice agent base class. AutonomousAgent doesn't gain a voice
  mixin in v1. Voice mode is wired to ChatAgent only.

## Verification gates

**Knowledge done when:**
- `/dashboard/knowledge` lists docs grouped by tags
- A user can create a 50KB markdown doc, mark it `always`, and
  see it in chat-agent system prompt next turn
- `load_knowledge` tool returns the body on demand
- FTS5 search via `knowledge_search` returns ranked matches
- Per-scope filtering works (user/project/org)

**Voice mode done when:**
- Toggle in ChatPage flips IO from text to voice
- Push-to-talk button works on mobile + desktop
- Agent's reply plays via Aura 2 (or ElevenLabs if key set)
- All existing chat tools / skills / memory continue to work
  (round-trip uses the same ChatAgent)
- Voice transcript saved to conversation history alongside text turns

## Total effort estimate

- Knowledge: ~4-6h
- Voice mode: ~3-4h
- Combined: ~7-10h. Sized for 2 dedicated sessions.

Both have full build specs as siblings to this plan.
