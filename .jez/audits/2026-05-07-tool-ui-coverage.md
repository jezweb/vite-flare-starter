---
date: 2026-05-07
status: active (audit, not yet acted on)
scope: Every chat tool registered in src/server/modules/chat/tools/
goal: Identify which tools render richly vs fall to JSON dump
owner: jez+claude
---

# Chat tool UI rendering coverage

## The three layers

The starter has **three** complementary patterns for rich tool UI. They
stack — a tool can use any combination.

### Layer 1 — Server `render` block
`render: { icon, displayName, summary?, expanded? }` on each
`ToolDefinition`. Drives the tool-call pill (icon + name). `summary`
returns a one-line headline below the pill; `expanded` returns JSX
shown when the user clicks the card.

### Layer 2 — Client tool-renderer registry
`src/client/modules/chat/components/tool-renderers/*.tsx` — one file
per domain (gmail, drive, tasks, calendar, ...). Each exports a
`ToolRenderer` matched by tool name in `index.ts`. Custom React
components that render the tool's output beautifully (cards, tables,
choice buttons, etc.). Takes precedence over the server `expanded`
field. **This is where the rich UX lives** for the polished tools.

### Layer 3 — `_ui` marker pattern
`src/server/modules/chat/tools/ui.ts` exposes 5 special tools:
`show_alert`, `offer_choices`, `ask_questions`, `collect_text`,
`collect_info`, `show_contact`, `show_product_cards`,
`show_data_table`. Each returns `{ _ui: 'name', ...args }`. The
client matches the marker in `chat-ui/ChatUiElement.tsx` (inline
render) or `chat-ui/InputTakeover.tsx` (full input panel). **This
is the equivalent of MCP-UI in our starter** — the agent emits
structured UI elements that the chat client interprets.

## Coverage by tool family

### ✅ Rich (custom tool-renderer in `tool-renderers/`)

| Family | Tools | Renderer file |
|---|---|---|
| Gmail | search · get_message · list_labels · draft · reply · send (6) | `gmail.tsx` |
| Drive | search · get_file · create_folder (3) | `drive.tsx` |
| Google Tasks | list · create (2) | `tasks.tsx` |
| Calendar | upcoming · list · get · find_free · create · update · delete (7) | `calendar.tsx` |
| Docs | search · get · create · append (4) | `docs.tsx` |
| Sheets | list_tabs · read_range · append_row · write_range (4) | `sheets.tsx` |
| Web search | web_search (1) | `search.tsx` |
| Slack | search_messages · list_channels · history · get_user · post (5) | `slack.tsx` |
| Notion | search · get_page · get_db · query_db · create_page · append_blocks (6) | `notion.tsx` |
| Image | generate · edit · analyze (3) | `image.tsx` |
| Atlassian | jira × 5 + confluence × 3 (8) | `atlassian.tsx` |
| Memory | remember · recall · search · forget · search_memory (5) | `memory.tsx` |
| Propose patch | propose_patch (1) — full ConfigDiffCard | `propose-patch.tsx` |
| find_tools | find_tools (1) | `tool-search.tsx` |

**Total rich**: ~56 tools.

### ✅ Rich via `_ui` marker (renders in chat or takes over input)

| Tool | UI behaviour |
|---|---|
| `show_alert` | Coloured banner card |
| `offer_choices` | Choice buttons inline |
| `show_contact` | Contact card |
| `collect_info` | Multi-field form |
| `show_data_table` | Data table |
| `ask_questions` | Input takeover with question list |
| `confirm_action` | Input takeover with confirm/cancel |
| `collect_text` | Input takeover textarea |

**Total**: 8 tools — perfect rich UX, agent-driven.

### ⚠️ Default — icon + displayName only, body falls to JSON dump

These appear in `defaults.tsx`'s DEFAULT_META so the pill reads e.g.
"List Files" with a folder-tree icon, but clicking the card shows the
raw JSON output:

| Family | Tools |
|---|---|
| Core | get_server_time · get_model_info · calculate · done (4) |
| Skills | list_skills · load_skill · read_skill_resource · run_skill_script · create_skill · install_skill · toggle_skill (7) |
| Files (fs_*) | fs_list · fs_read · fs_write · fs_delete (4) |
| Todo | add · update · list · clear (4) |
| Code | run_python · run_shell · run_js (3) |
| Audio | transcribe_audio · speak_text (2) |
| Delegate | delegate (1) |
| Email | send_email (1) |
| Image (other) | generate · transform · info (3) |
| Media (video_*) | clip · frame · audio · spritesheet (4) |
| Places | search · details (2) |
| Semantic / RAG | semantic_search · vectorize_content · search_files (3) |
| Schedule | schedule_task · list_tasks · cancel_task (3) |
| Browser | markdown · extract · screenshot · links · content (5) |
| Microsoft Workspace | outlook × 3 · onedrive × 2 · ms_calendar × 2 (7) |

**Total default-meta-only**: ~53 tools.

### ❌ Bottom tier — no render meta, generic wrench icon

| Family | Tools |
|---|---|
| **Knowledge** (just shipped) | knowledge_search · load_knowledge (2) |
| **Channels** (5 with summary at least: notify · approval_queue · inbox_add · space_send · webhook_post) — has summary but no client renderer |
| **Memories-multi** (5 with summary) |
| **Findings** | record · promote · dismiss (3) |
| **Entities** | entity_create · search · get · update · delete (5) |
| **Data** | read · aggregate · export · pivot · trend · distribution (6) |
| **Firecrawl** | scrape · crawl (2) |
| **Batch task** | start_batch_task (1) — has summary |
| **With-review** | with_review (1) — has summary |
| **Artifacts** (no render block at all) | create_artifact · edit_artifact (2) |
| **Documents** (no render block at all) | generate_docx · generate_csv (2) |

**Total**: ~32 tools sit below the default tier and either show as
generic JSON or only get a summary line.

## Big picture numbers

| Tier | Tool count | % of registry |
|---|---|---|
| Rich custom renderer | ~56 | ~38% |
| `_ui` marker (richest) | 8 | ~5% |
| Default icon+name, JSON body | ~53 | ~36% |
| Bare wrench / JSON only | ~32 | ~21% |

So roughly **43% of tools have rich UX**, **36% have a polished pill
but raw JSON expanded view**, and **21% are aesthetically rough**.

## Where the gaps actually hurt UX

Ranked by user-visible pain, not tool count:

### High pain (large output, frequent use, hard to scan as JSON)
1. **Skills** — `load_skill` returns a multi-page body; agent invokes
   constantly. Result is a wall of escaped JSON in the card.
2. **Knowledge** (just shipped) — same shape as load_skill, same
   problem. Already mentioned in the previous answer.
3. **Code** (`run_python` etc.) — stdout/stderr deserve a code block,
   not JSON.
4. **Browser** (`browser_extract`, `browser_screenshot`) — extracted
   data should render as a table; screenshots should preview inline.
5. **Data** (`read_data`, `aggregate_data`) — tabular results
   especially deserve a table renderer.

### Medium pain
6. **Findings** — quick "I noticed…" card would be nicer than JSON.
7. **Entities** — list/get/search of entity rows; a row table fits.
8. **Memories-multi** — has a summary, but bodies could render as
   prose blocks.
9. **Channels** — same.
10. **Microsoft Workspace** — Gmail has rich gmail.tsx; Outlook should
    parallel it but doesn't (only default meta).

### Low pain (work fine as JSON)
- Schedule (small structured outputs)
- Places (single result, small)
- Todo (already has summary)
- Core (single-line outputs)
- Audio (transcribe/speak — outputs are text or audio metadata)

## Quick wins

1. **`artifacts.ts` + `documents.ts` need at minimum a `render` block.**
   Right now they appear as a generic wrench labelled "Create Artifact"
   only because of name auto-prettification. ~5 minutes to fix.
2. **Skills + Knowledge should share one renderer** since they have
   essentially the same shape (markdown body + frontmatter +
   resources). ~30 min for `skills-knowledge.tsx` covering both.
3. **`run_python`/`run_shell`/`run_js` should render stdout in a
   `<pre>` block** with monospace + copy-on-click. ~15 min.
4. **`browser_screenshot` should render an `<img>` preview**. ~10 min.

## Implication for the brains-trust pattern

Worth adding "rich UI coverage" to the brains-trust review checklist
when shipping a tool. The previous review caught security + race
conditions but didn't mention that knowledge_search returns plain
JSON to the user — the panel was focused on correctness, not polish.

## Status

This audit is information-only — no fixes applied. Decide between:
(a) bulk-fix the high-pain tier in one batch session,
(b) defer until a tool's friction comes up in real use,
(c) propose a "tool-renderer template" so adding a new tool always
includes the renderer alongside the server def (`one-file-tool-
definitions.md` rule extension).
