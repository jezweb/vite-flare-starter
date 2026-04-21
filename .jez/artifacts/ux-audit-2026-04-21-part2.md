# UX Audit (part 2) — 2026-04-21

**Scope**: Verify earlier findings + exhaust the new places/map feature shipped since this morning's audit.

**Persona**: Mel — Jezweb consultant giving a 10-minute demo to a prospect. Knows it's "AI chat with tools", no prior knowledge of the specific app. Wants it to impress.

**URL**: https://vite-flare-starter.webfonts.workers.dev

**Tool**: Chrome MCP, 1440×900 viewport (Retina 1x DPR via `--force-device-scale-factor=1`).

**Part 1**: `.jez/artifacts/ux-audit-2026-04-21.md` (morning audit, 14 findings).

---

## Fixed in session (places/map feature hardening)

These issues were caught live as Mel looked at her first map answer and fixed before the audit continued. Before → After.

### MAP-1 — Map overlapped composer + cards sat outside the bordered card *(HIGH, FIXED ✓)*

**What**: With sidebar open the assistant bubble was only 699px wide. My `grid-cols-[1fr_320px]` gave the map only 337px — too narrow to show 5 markers spread across the Newcastle area. Visually the cards panel appeared to escape the rounded border of the map wrapper, and the sticky "Scroll to latest" button appeared to sit on top of everything.

**Fix**: Rewrote the layout as a CSS container query (`@container` + `@[640px]:flex-row` / `@[640px]:w-[260px]`). At narrow widths (e.g. sidebar open), map + cards now stack vertically. At wider widths they sit side-by-side. Narrower cards column (260px instead of 320px) gives the map more room.

**File**: `src/client/modules/chat/components/chat-ui/PlaceMap.tsx`

### MAP-2 — Only 1 marker visible despite 5 places returned *(HIGH, FIXED ✓)*

**What**: Fixed `zoom: 12` centred on a mean lat/lng pinned the map at one intersection and drew the other 4 markers off-screen — visually felt like the tool returned a single result.

**Fix**: Added `FitBounds` controller that runs on mount, computes an `L.latLngBounds` from all valid markers, and calls `map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 })`. Single-marker case still uses a default 14 zoom.

### MAP-3 — Light OSM tiles inside a dark-mode UI *(MEDIUM, FIXED ✓)*

**What**: The default OpenStreetMap tiles are a bright cream/beige — loud contrast against the dark shell.

**Fix**: Added a `useIsDark()` hook that watches `<html>` for the `.dark` class via `MutationObserver`, then swaps the tile layer URL between OpenStreetMap (light) and CartoDB Dark Matter (dark). Attribution updates accordingly. Theme toggle is reactive — switching in Settings re-renders the map.

### MAP-4 — Rating "4.6 (137)" wrapped mid-number as "4.\n6 (13\n7)" *(LOW, FIXED ✓)*

**What**: In the card header flex row, rating number + review count + type were allowed to wrap anywhere. At 260px columns, tight characters like periods let "4.6" and "(137)" fall across lines ugly.

**Fix**: Wrapped the rating span in `whitespace-nowrap shrink-0` + `&nbsp;` between number and parens so they stay as one token. Type span takes remaining space with `truncate min-w-0`.

---

## New findings (still open)

### MAP-5 — Card click zooms too aggressively *(LOW)*

**What**: Clicking a card uses `flyTo([lat,lng], Math.max(currentZoom, 14))` — zoom 14 is street-level. User loses the context of the other 4 places on the map, which was the whole point of the overview.

**Fix direction**: Either preserve the current fit-bounds zoom level (don't force-raise), or set a softer minimum like zoom 12. Consider: highlight the clicked marker (colour/scale) and ONLY fly-to if it's currently off-screen.

### MAP-6 — No starter chip or example prompt for the map feature *(MEDIUM)*

**What**: The chat empty state shows 4 example prompts ("How does AI work?", "Help me plan a 2-hour coding session.", "Summarise today's tech news...", "Server components vs client components?"). None hint at local-business search — Mel wouldn't discover the map feature without being told.

**Fix direction**: Add a chip or example like "Find good coffee near Newcastle" or "Wreckers in my area for a Toyota". Places/maps is the most impressive part of the app right now — it deserves a promo slot on the landing.

### MAP-7 — Response cost is hefty (50,702 tokens, 28.3s) *(LOW)*

**What**: The wreckers query burned 50k tokens end-to-end. places_search with maxResults=8 returns a lot of nested metadata even after my normalise step (types array, priceLevel, status, etc.). Claude Sonnet then summarised 5 places and emitted a full `show_map` tool call with all lat/lng/phone/address arguments.

**Fix direction**: Places data is already in the tool result — the agent doesn't need to re-emit it all in the show_map call. Could add a convention where `show_map` accepts a `places_from: "<tool_call_id>"` reference to reuse the last tool output, trimming ~3-5k tokens. Low priority — cost is fine at current usage.

---

## Morning audit findings — status after part-2 re-walk

| Tag (morning) | Title | Status now |
|--------------|-------|------------|
| **H1** | Conversation title leaks `<skill_content>` wrapper | **Likely fixed.** Titles in the sidebar read "Plan-task methodology", "Plan-task skill content", "Newcastle Toyota Estima wreckers" — no XML wrapper visible. May be an auto-retitle on first reload. Worth a fresh repro with `/plan-task` to confirm. |
| **H2** | SkillActivationBlock pill missing during streaming | **Not re-tested this pass** — didn't trigger a fresh `/slash` activation. |
| **M1** | No slash-command autocomplete | **Still open** — typing `/` in the composer shows no picker. |
| **M2** | Empty state visible inside active conversation | **Not re-tested** — same reason as H2. |
| **L1** | `/skill-name` code pill wraps at hyphen (Skills page) | **Not re-tested** — didn't visit Skills page this pass. |
| **L2** | Sidebar toggle no tooltip | **Still open** — hover over sidebar toggle icon, no title/tooltip. |
| **T1** | Theme editor: HSL inputs have no H/S/L labels | **Still open.** |
| **T2** | Theme editor: token names not self-descriptive | **Still open.** |
| **T3** | Paste CSS tab placeholder looks like real content | **Still open.** |
| **A1** | Activity feed leaks `<skill_content>` wrapper | **Not re-tested** — would need to visit Activity page. |
| **A2** | `/dashboard/notifications` is a 404 | **Still open** — no dedicated page. |
| **ADM1** | Admin Features tab doesn't show env-driven flags | **Still open.** |
| **ADM2** | Active Sessions 8 vs Total Users 4 | **Still open** — no session cleanup job. |

---

## Verified-working (positive observations)

- Auto-retitle of conversations: "Find me 5 wreckers in Newcastle NSW..." → "Newcastle Toyota Estima wreckers" after one round trip. Clean, scannable.
- Conversation sidebar groups: PROJECTS, STARRED, TODAY, YESTERDAY — good temporal orientation.
- Project folder support (e.g. "Pirate Lab" with "explain gravity") is visible and useful.
- Snippet previews under conversation titles: "Fulfilled the request by generating a Mermaid diagram..." — scan-friendly.
- `places_search` tool pill with "Completed" badge + expandable for tool output inspection.
- Model metadata footer on each response: `anthropic/claude-sonnet-4.6 · 50,702 tokens · 28.3s` — great trust/observability signal.
- Copy, regenerate, thumbs-up/down controls on assistant messages.
- Dark map tiles (CartoDB) match the app chrome seamlessly once fixed.
- fitBounds means the user always sees all their results without having to pan around.
- Card phone numbers are `tel:` links, websites open in new tab.

---

## Coverage

| Area | Walked this pass? |
|------|:----:|
| Home dashboard | ✓ |
| AI Chat empty state | ✓ |
| AI Chat with existing conversation | ✓ |
| Conversations sidebar | ✓ |
| Places search tool execution | ✓ (existing conversation) |
| show_map rendering | ✓ |
| Card click → map focus | ✓ |
| Mobile width (500px) | ✓ |
| Dark mode / map tiles | ✓ |
| Skills page | — (not re-tested) |
| Theme editor | — (not re-tested) |
| Activity | — (not re-tested) |
| Admin panel | — (not re-tested) |
| Files / Settings sub-tabs | — (not re-tested) |

---

## Recommended next-session phases

Same as morning audit (Phases A–D), now plus:

**Phase E — Places/map polish (~45 min)**
- MAP-5: soften card-click zoom (preserve current zoom or cap at 12)
- MAP-6: add "Find local businesses" chip or example prompt to the empty state
- Optional MAP-7: `places_from` pattern to cut tokens

---

## Summary

The new places + show_map feature works end-to-end and looks like a genuine claude.ai-grade answer. Four layout bugs were caught and fixed during the audit itself (MAP-1 through MAP-4). Three smaller issues remain open (MAP-5 through MAP-7), none blocking. The biggest remaining risk is **discoverability** (MAP-6) — this feature is invisible from the chat landing.

Morning audit's highest-priority findings (H1 skill wrapper, H2 streaming pill, M1 slash autocomplete) are still the blocking work for the next session, modulo H1 possibly already resolved — worth 10 minutes to confirm with a fresh `/plan-task` invocation.

**Ship-ready as a demo today.** With MAP-6 added and H1/H2 confirmed fixed, ship-ready as a real feature next session.
