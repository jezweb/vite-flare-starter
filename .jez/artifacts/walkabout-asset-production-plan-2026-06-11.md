---
date: 2026-06-11
status: active
owner: jez+claude
topic: Walkabout asset library — full tour + per-module videos + GIFs + stills for GitHub README + a future starter website
---

# Walkabout asset production — plan

Produce a re-runnable library of demo media for vite-flare-starter: one hero
walkthrough, a short video per headline module, GIFs sliced from those, and
clean stills. Feeds the GitHub README now and a future "all about the starter"
website. Everything headless + re-recordable (app changes → re-run → fresh
assets; "stale demos are a choice").

Decisions (Jez, 2026-06-11): **curated ~12 headline modules** (not all ~30);
**seed a dedicated showcase account** so modules look populated.

## Asset catalogue

| Tier | Asset | Format | Use |
|---|---|---|---|
| 1 Hero | Full narrated walkthrough across headline modules | MP4 ~3-4min 1440×900 | homepage hero, README top, YouTube |
| 2 Module shorts | One scripted feature demo per module (real clicks, key controls) | MP4 20-45s each | per-feature website sections, training |
| 3 GIFs | 5-10s silent loops sliced from Tier 2 | GIF palette-opt ≤2MB | README, inline website |
| 4 Stills | Clean frames (no tour card) + og:image | PNG 1440 + 1280×640 | feature cards, social |
| Manifest | every asset + caption + intended use | assets/manifest.json | drives README + site assembly |

## Headline modules (curated 12-13)

Home · AI Chat · Skills · Knowledge · Inbox · Projects · Routines · Connections ·
Agents · Activity · Files · Settings · Organizations.

Per-module video subject = the ONE thing that sells it:
- Home: the workspace snapshot + sidebar
- AI Chat: ask → streams → tool output renders inline
- Skills: filter the library → open one → AI-Sparkle rewrite (diff)
- Knowledge: a doc → search → load into chat
- Inbox: findings + approvals in one list → approve inline
- Projects: project list → open → its memory/context
- Routines: a routine config → schedule + channels
- Connections: the connector catalogue + a profile/allow-list
- Agents: the registry → an agent run
- Activity: the audit timeline + stats
- Files: upload → list → preview
- Settings: tabs (theme switch is a great GIF)
- Organizations: members + invite flow

## Pipeline (mostly built)

1. **Seed** — `.jez/scripts/seed-showcase.mjs` fills a test-auth showcase user
   (email `showcase@test.vfs.local`) with realistic data per module via the
   deployed API. Built from the route-mapping agent's report (exact bodies).
   Re-runnable; `/api/test-auth/cleanup` resets. NEVER reassigns real data.
2. **Narration** — `gen-tour-audio.py` (full tour) + `record-demo.mjs`'s cached
   `/with-timestamps` (module shorts). Voice Charlie.
3. **Record** — `record-tour.mjs` (hero, CDP screencast, storageState) +
   `record-demo.mjs` catalogue (one entry per module, ROLE-based clicks so
   --check doubles as an a11y smoke test). storageState minted from the seeded
   showcase session.
4. **GIFs** — `.jez/scripts/make-gifs.mjs`: ffmpeg slice (offset+dur) →
   palettegen/paletteuse → optimised GIF; one or more loops per module.
5. **Stills** — frame-extract at chosen offsets; og:image via crop.
6. **Manifest** — `assets/manifest.json` generated alongside.

## Asset home

`assets/` at repo root (NOT .jez — these are deliverables):
```
assets/
  videos/   full-tour.mp4  module-<name>.mp4
  gifs/     <name>.gif
  stills/   <name>.png  og-image.png
  manifest.json
```
Videos are big — gitignore `assets/videos/` + `assets/**/*.mp4`; commit GIFs +
stills (README needs them). Final video hosting (R2/Stream/YouTube) is a later
call when the website shape is known. README embeds GIFs; website embeds both.

## Sequencing

- **P0 Foundation** (this session): plan (this doc) · seeding script · assets
  scaffold · make-gifs.mjs.
- **P1 Hero**: extend the tour to the headline modules (more steps + data-tour
  anchors + narration), seed, record full-tour.mp4.
- **P2 Module shorts**: record-demo catalogue, one per module; record all.
- **P3 GIFs + stills + manifest**: slice, extract, write manifest.
- **P4 Wire-up**: README media section; hand the manifest to the website build.

## Gotchas to respect

- **Empty-state anchor twins** (Pod Slab Sales lesson): table/list anchors only
  render with rows — seeding fixes this, but mirror `data-tour` onto empty-state
  cards for any module that might be empty.
- **Cascade-delete trap**: seed CLONES into the showcase test user; never
  reassign real rows. `/api/test-auth/cleanup` wipes the showcase user + its
  data cleanly.
- **Connections** can't seed real OAuth — demo the connect UI / a labelled
  placeholder, don't fake a live Gmail.
- **Conversations are DO-backed** — may need the chat agent path, not a plain
  insert (the agent's report will say).
- **Recording auth** = storageState minted from the seeded showcase session
  (test-auth `/cookies`), not the empty default user.
