# Chat UI Cross-App Comparison — 2026-04-17

Second-pass audit building on `chat-ergonomics-audit-2026-04-17.md`. Browsed live (Chrome MCP) as Jez:

- **claude.ai** (https://claude.ai/new)
- **t3.chat** (https://t3.chat/)
- **Gemini** (https://gemini.google.com/app)
- **Qwen** (https://qwen.ai/home)

Each solves the same core problem (text chat with an LLM) quite differently. This doc captures patterns we **don't yet have** in vite-flare-starter.

---

## 1. Empty-state compose philosophy

| App | Starter UX |
|-----|-----------|
| **claude.ai** | 4 category chips (Write / Strategize / Career chat / Claude's choice). Each expands to preset prompts. Greeting "Happy Friday, Jez". |
| **t3.chat** | 4 category chips (Create / Explore / Code / Learn) **PLUS 4 flat example questions directly visible** ("How does AI work?", "Are black holes real?", "How many Rs in 'strawberry'", "What is the meaning of life?"). Greeting "How can I help you?" (inside a "Temporary chat" pill if not logged in). |
| **Gemini** | 5 emoji-branded chips (🖼 Create image, 🎸 Create music, ✍ Write anything, 🎓 Help me learn, ✨ Boost my day). Greeting "Where should we start?" |
| **Qwen** | No chips at all in empty state — relies entirely on **mode toggles in the compose**: Thinking / Search / Web Dev / Artifacts / Deep Research / Image Generation / Video Generation. "What can I help you with?" greeting. |
| **ours** | 4 text chips (Write / Research / Code / Plan) expanding to presets. Greeting "Good afternoon, Jez". |

### New finding 43 — Flat example questions + chip row (t3.chat pattern)
- **Observation**: t3.chat shows BOTH category chips AND 4 example questions in a flat list. User can click an example for instant send, OR use a chip for a menu of presets. This lowers cold-start effort — the example questions are literal starter prompts.
- **Recommendation (quick)**: Add an optional "example questions" row *below* the chip row in `EmptyStateBody`. 4-5 literal prompts that click-to-send (not click-to-insert like our chip presets). Configurable via a new `CHAT_EXAMPLES` array in `chat-chips.ts`. Fork users can leave it empty to hide.
- **Rationale**: Two-tier cold-start (specific one-shot vs category-menu) accommodates both "I know exactly what to ask" and "I want to explore" users.

### New finding 44 — Emoji chip branding (Gemini pattern)
- **Observation**: Gemini uses emoji as the visual anchor for action chips (🖼 🎸 ✍ 🎓 ✨) instead of lucide icons or text-only. It scans faster AND looks less "software" and more "creative tool".
- **Recommendation (quick)**: Add an optional `emoji?: string` field to `ChatChip` in `chat-chips.ts`. When present, prefer emoji over the Lucide icon. Fork users choose per-chip.
- **Rationale**: Emoji reads as "playful" and taps into muscle memory from other messaging apps. Currently we have text-only chips; emoji is an easy upgrade that doesn't break existing styling.

---

## 2. Input card — what's ON it vs IN it

The input card in claude.ai is minimalist (textarea + `+` + model picker). But t3.chat, Gemini, and Qwen all add **more affordances directly on the input itself**:

### New finding 45 — Mode/capability toggles in the compose (Qwen / Gemini pattern)
- **Observation**: Qwen shows 7 toggles pinned to the compose — Thinking, Search, Web Dev, Artifacts, Deep Research, Image Generation, Video Generation. Gemini has a "Tools" button that opens a similar picker with "Deep Research", "Canvas", "Image", etc. t3.chat has a single "Instant" toggle next to model picker.
- **Current state**: Our input has `+` (attach) / mic / model picker / submit. Mode selection is delegated entirely to the model's tool-calling.
- **Recommendation (medium)**: Add an optional `ToolsMenu` trigger next to the model picker — opens a small popover listing modes the user can force (e.g. "Force deep research mode", "Skip tools / fast reply", "Generate an image"). Maps to system-prompt overrides server-side. Starter could ship with 2-3 modes as examples.
- **Rationale**: Power users want predictability. A mode toggle guarantees the agent behaves a specific way for this turn rather than trusting the LLM to pick the right path. Matches every leading non-Anthropic product.

### New finding 46 — Labelled attach/action buttons instead of icons (t3.chat pattern)
- **Observation**: t3.chat uses an "Attach" button with a text label (not just a `+` icon). The button reads "Attach" immediately, no hover-tooltip needed. Gemini also uses labelled buttons in its Tools menu ("Deep Research", not "DR").
- **Current state**: We use icon-only `+` with an aria-label "Attach a file or take a screenshot". Discoverable on hover but invisible on first paint for new users.
- **Recommendation (quick)**: Consider swapping the icon-only `+` for a labelled variant on wide viewports (`sm:` breakpoint up) — icon + "Attach" text. Keep icon-only on narrow/mobile. Tailwind's `hidden sm:inline` handles it cleanly.
- **Rationale**: First-click discoverability. Icon-only buttons rely on users knowing the convention; labels remove that assumption entirely.

### New finding 47 — Model cost indicator in picker trigger (t3.chat pattern)
- **Observation**: t3.chat's model picker button shows `Kimi K2(0905)` with `$$` and a coloured dot indicator — you see cost tier before opening the menu. Flagship-vs-cheap is obvious at a glance.
- **Current state**: Our model picker shows just the short name ("Kimi K2.5"). No pricing/tier hint.
- **Recommendation (medium)**: Extend `ModelSelector` trigger with a tiny pricing pill (dots: `○` free, `●` low-cost, `●●` mid, `●●●` flagship). Uses the `pricing.input` field from the models.flared.au catalogue. The full selector menu already shows prices; this is a glance-level version.
- **Rationale**: Cost-aware users (most orgs) want to see which model they're burning credits on without clicking. A 3-dot pill is unobtrusive but informative.

---

## 3. Sidebar / conversation list

### New finding 48 — "Pinned" or starred sidebar section (claude.ai pattern)
- **Observation**: claude.ai has a "Starred" section above "Recents" in the sidebar. Users can star conversations they return to. Also seen: Gemini's "My stuff" groups all user-created content (conversations + Gems + saved items) in one place.
- **Current state**: Our sidebar shows only Today / Yesterday / Last 7 days / Older time buckets. No pinning.
- **Recommendation (medium)**: Add a `starred` boolean to the `conversations` table, surface as a star icon in the ellipsis menu (`Star / Unstar`). Sidebar groups: Starred (always first) → Today → Yesterday → Older.
- **Rationale**: Active projects deserve to be sticky at the top of the sidebar regardless of last-activity date. Pinning is ubiquitous across chat apps (Slack, Gmail, Claude, ChatGPT).

### New finding 49 — Gems / Projects / Agents section (Gemini pattern)
- **Observation**: Gemini has "Gems" (`/gems/view`) — custom AI personas with preset system prompt + tools + docs. Distinct from conversations; a persistent context the user can switch into mid-conversation. claude.ai's "Projects" are similar but scoped by conversation tree.
- **Current state**: Our starter has conversations only. Project/persona scoping is in the deferred list (P3 #33).
- **Recommendation (larger)**: Already in the deferred Phase 3 queue. This audit confirms it's table-stakes across Gemini, claude.ai, and ChatGPT. Priority worth raising when scheduling a dedicated session.
- **Rationale**: Already documented in the plan — this entry links the cross-app evidence.

### New finding 50 — Time-bucket grouping with "Hide" toggle (claude.ai pattern)
- **Observation**: claude.ai's sidebar has "Recents" with a "Hide" button to collapse the recent conversations entirely (useful for screen sharing / privacy).
- **Current state**: We group by date but don't offer per-group collapse.
- **Recommendation (quick)**: Add a small chevron next to each group header (Today / Yesterday / Older) to collapse. Store collapsed-state in localStorage so it persists.
- **Rationale**: Long conversation histories become noise. Letting users collapse "Older" keeps the active work visible.

---

## 4. Assistant-response rendering

### New finding 51 — "Try now" CTAs inside conversation titles (Gemini pattern)
- **Observation**: Gemini's conversation list includes "Try now" CTAs for suggested continuations of a thread (not just the title + timestamp).
- **Current state**: Our sidebar shows title + relative time.
- **Recommendation (medium-larger)**: Optional server-side suggestion: on conversation idle for >7 days, generate a "what next?" suggestion via LLM, display as a pill under the title. Probably too ambitious for the starter — good future-work note.
- **Rationale**: Re-engagement mechanic. Not critical but a clear product differentiator.

### New finding 52 — Per-message "More options" labels (Gemini pattern)
- **Observation**: Every Gemini message has an explicit aria-label `"More options for <message title>"`. Extremely accessibility-conscious pattern.
- **Current state**: Our message action bar uses aria-labels per button (Copy response, Regenerate, etc.) but not a per-message options menu.
- **Recommendation (quick)**: Wrap each message in a container with aria-label `"Message from <role>: <first 50 chars of text>"` for screen readers. Already have some of this via `title={timestamp}` but not aria.
- **Rationale**: Accessibility. Cheap win.

---

## 5. Miscellaneous

### New finding 53 — "Artifacts" as a first-class sidebar destination (claude.ai pattern)
- **Observation**: claude.ai has `/artifacts/my` — a dedicated artifacts browser (HTML/Mermaid/etc. saved from conversations). Users can re-visit them outside the original conversation context.
- **Current state**: We render artifacts inline via `ArtifactViewer` but don't persist or index them.
- **Recommendation (larger)**: Big scope — add an `artifacts` table with FK to `conversation_messages`, a `/dashboard/artifacts` page, and a "save artifact" action in the viewer. Later-session feature.
- **Rationale**: Users want to find that one diagram they generated 3 weeks ago. Searching through conversation history is brutal.

### New finding 54 — Scheduled/routine sessions (Claude Code web)
- **Observation**: claude.ai/code has a "Routines" section — scheduled/automated sessions (cron-like). Enables "every morning, run my inbox triage".
- **Current state**: N/A — this is a Claude-Code-specific concept but worth noting for any auto-agent features.
- **Recommendation**: Out of scope for the starter, but adjacent to the `ScheduleWakeup` / `CronCreate` tools in the broader Anthropic ecosystem. Flag as inspiration.

### New finding 55 — Plan-mode / confirm-before-act toggle (Claude Code web)
- **Observation**: claude.ai/code has a "Plan mode" toggle in the compose. When on, the AI proposes a plan and waits for approval before executing. Maps to Claude Code's `EnterPlanMode` pattern.
- **Current state**: We have `confirm_action` and `offer_choices` tools that the AI can invoke, but no user-level "always ask before acting" toggle.
- **Recommendation (medium)**: Add to chat preferences panel: `confirmationMode: 'auto' | 'ask-before-tools'`. When set to "ask before tools", the system prompt instructs the agent to call `confirm_action` before any tool that writes (fs_write, shell commands, etc.).
- **Rationale**: Power users want to review agent plans before destructive actions. Matches the autonomy-vs-safety dial Jez has been modelling in his own rules.

---

## Quick wins summary (for next session)

| # | Pattern | Source | Effort |
|---|---------|--------|--------|
| 43 | Flat example questions below chip row | t3.chat | Quick |
| 44 | Optional emoji on chips | Gemini | Quick |
| 46 | Labelled "Attach" button on wide viewports | t3.chat | Quick |
| 47 | Cost-tier dots on model picker trigger | t3.chat | Medium |
| 48 | Pinned/starred conversations | claude.ai | Medium |
| 50 | Collapsible sidebar date groups | claude.ai | Quick |
| 52 | Per-message aria-label for screen readers | Gemini | Quick |
| 55 | Plan-mode / confirm-before-tools toggle | Claude Code | Medium |

---

## Bigger considerations (maybe, maybe not)

- **45 — Mode toggles in compose** (Qwen/Gemini): a real philosophical fork. Does our starter want users picking modes up-front, or trusting the agent to route? Good discussion before implementing.
- **49 — Gems / Projects**: already tracked in deferred queue; this doc confirms cross-vendor ubiquity.
- **53 — Artifacts as a sidebar destination**: pairs nicely with FTS5 search we already have — extend to index artifact HTML.

*Written: 2026-04-17 (second-pass audit, cross-app)*
