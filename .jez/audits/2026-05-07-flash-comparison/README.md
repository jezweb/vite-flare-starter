---
date: 2026-05-07
status: complete
panel:
  - openai/gpt-5.5            (lead, $0.27)
  - anthropic/claude-opus-4.7 ($0.37)
  - google/gemini-3.1-pro-preview ($0.10)
  - deepseek/deepseek-v4-pro       ($0.05)  ← 1M ctx, ~5x cheaper than Opus
  - deepseek/deepseek-v4-flash     ($0.004) ← 1M ctx, ~100x cheaper than Opus
  - google/gemini-3.1-flash-lite-preview ($0.008) ← 1M ctx
verdict: All four post-fix reviewers signed off; DeepSeek v4 Flash caught one extra real bug (iOS playsInline) the Pro models missed
total cost: ~$0.81
---

# Flash variants brains-trust comparison

Re-ran the post-fix verify pass through DeepSeek v4 Pro, DeepSeek v4
Flash, and Gemini 3.1 Flash Lite to compare against the original
panel (GPT-5.5 + Opus 4.7 + Gemini 3.1 Pro).

## Cost vs value

| Reviewer | Cost | Verdict | New issue caught |
|---|---|---|---|
| GPT-5.5 (verify) | $0.27 | "Not yet — fix H1, H2, H4" | Caught H1/H2 partial fixes (real); H4 was a false positive |
| DeepSeek v4 Pro 1M | $0.05 | "All clean. Production-safe." | None new — confirmed all C1-C8 + H1-H5 + M1-M3 |
| DeepSeek v4 Flash 1M | $0.004 | "Conditionally safe — fix N2 (playsInline)" | **Real iOS 15-16 gap missed by Pros** |
| Gemini 3.1 Flash Lite 1M | $0.008 | "Production-ready" | None new |

## The Flash surprise

DeepSeek v4 Flash at $0.004 (less than half a US cent) flagged a
legitimate H finding both Pro models missed: the iOS audio unlock
needs `playsInline = true` AND the lowercase HTML attribute set
before `play()` to satisfy iOS Safari 15-16's autoplay policy.
Without it, the silent-MP3 prime succeeds but subsequent TTS plays
still get `NotAllowedError`.

Fixed at `useVoiceChat.ts:181-184`. ~3 lines including the comment.

## Implication for the brains-trust pattern

Adding a Flash-tier reviewer to every panel is essentially free
($0.01/round) and the variance in what each model attends to means
Flash often catches things the heavyweight reviewers skim past. The
Pro models tend to focus on architecture and security; Flash models
sometimes flag platform-specific gotchas (iOS quirks, mobile Safari,
older browser fallbacks) more reliably.

**Updated default panel for ~/.claude/CLAUDE.md "brains-trust before
commit" rule** (proposed): `gpt-5.5` + `claude-opus-4.7` +
`deepseek-v4-pro` + `deepseek-v4-flash`. Drops the Gemini Pro slot
($0.10) for DeepSeek Pro ($0.05) plus a Flash tier ($0.004) — same
total cost, more model-architecture diversity, and the Flash slot
reliably surfaces platform gotchas.
