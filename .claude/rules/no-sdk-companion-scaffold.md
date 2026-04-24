# No-SDK Companion Scaffold Pattern

## Core rule

When a cloud provider ships an SDK for one modality (say, voice) but not the
companion modality (video), don't wait for the SDK. Build the companion from
primitives and ship it as a sibling reference in the same opt-in pattern.

The starter is a pattern library. A "the SDK isn't here yet" gap is a gap in
the library. Fill it with primitives that demonstrate the same architectural
pattern, so when the SDK ships the swap is a transport change, not a rewrite.

## Concrete example (2026-04-22 — vite-flare-starter)

| Modality | Cloudflare SDK | How we scaffolded it |
|---|---|---|
| Voice | `@cloudflare/voice` with `withVoiceInput(Agent)` mixin + `useVoiceInput` React hook | Direct SDK use — `src/server/modules/voice/voice-agent.ts` + `VoiceInputExamplePage` |
| Video | No SDK — Cloudflare Realtime SFU is the lower-level option | Handwritten primitives: `getUserMedia` → `<canvas>` sampled at N seconds → JPEG data URL → `useAgent` WS → DO `onMessage` → AI SDK `generateText` with vision model → broadcast caption |

The 4-piece DO wiring (binding, migration, class export, `run_worker_first`)
is identical — only the transport differs. When Cloudflare ships a proper
`@cloudflare/video` SDK with a `withVideoInput(Agent)` mixin, the DO class
stays, the client hook swaps. See `src/server/modules/video/video-agent.ts`
and CLAUDE.md Pattern 10b.

## Why this works in a pattern library

The starter's philosophy: modules are reference implementations. A developer
forking this to build their own voice + video product should find BOTH
patterns wired and working out of the box, even if one uses an official SDK
and the other is handwritten. "The official SDK isn't here yet" is not an
excuse for a blank directory in a reference implementation.

## Checklist when building the companion

- [ ] Same opt-in feature flag pattern (`VITE_FEATURE_X_AGENT=true`)
- [ ] Same DO wiring (binding, migration tag, class export)
- [ ] Same WebSocket route shape (`/agents/{kebab-case}/{name}`)
- [ ] Same fallback behaviour when binding/env var missing
- [ ] Document the gap in CLAUDE.md — why no SDK exists, what the
      migration path is when one ships
- [ ] Pick primitives that MATCH what the SDK would wrap, so the mental
      model transfers

## When NOT to apply

- The SDK is in beta and shipping within weeks — just wait
- The primitives are substantially harder than the SDK would be (e.g. full
  SFU pipeline for 30fps vision) — scope down to what's practical for the
  scaffold OR defer until the SDK arrives
- The companion has no obvious product use case yet — don't scaffold
  speculatively; wait for a real ask

## Discovered

2026-04-22. Jez asked "i thinkthere is a video equivalent to the voice
feature on cf?" after shipping the voice scaffold. Research showed no
`@cloudflare/video` mixin, but enough primitives (agents SDK WS, Workers
AI vision models) to build the companion cleanly. Shipped as Pattern 10b
alongside Pattern 10 in CLAUDE.md.

**Last Updated**: 2026-04-22
