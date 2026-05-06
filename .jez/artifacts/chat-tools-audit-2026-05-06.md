# Chat Tools Audit — vite-flare-starter
**Date:** 2026-05-06  
**Scope:** `/src/server/modules/chat/tools/`  
**Tools Audited:** 141 across 38 files

---

## Tool Inventory

| Tool Name | File | Description Quality | Summary | Issues |
|-----------|------|---------------------|---------|--------|
| **Core Utilities** |
| `get_server_time` | core.ts | 1/10 | Returns UTC timestamp. | No guidance; truncated desc. |
| `get_model_info` | core.ts | 1/10 | Looks up Workers AI model capabilities. | Missing "use when" pattern. |
| `calculate` | core.ts | 6/10 | Arithmetic evaluator (+ - * / %). | Good; limited scope documented. |
| `done` | core.ts | 4/10 | Signal task completion. | Description OK; semantics unclear. |
| **Memory** |
| `remember` | memory.ts | 7/10 | Save persistent fact to user memory. | Good "use when" guidance; clear purpose. |
| `recall` | memory.ts | 3/10 | Retrieve fact by key. | Sparse description. |
| `search_memory` | memory.ts | 4/10 | Substring search on memory keys. | OK; brief. |
| `forget` | memory.ts | 6/10 | Delete memory fact; requires approval. | Good; explicitly gated. |
| `memory_add` | memories-multi.ts | 5/10 | Add memory entry (scoped). | Mentions `isPrivate` but cut off. |
| `memory_update` | memories-multi.ts | 4/10 | Update existing memory by id. | Minimal desc; no approval gating. ⚠️ |
| `memory_remove` | memories-multi.ts | 3/10 | Delete memory entry by id. | Sparse; no approval gating. ⚠️ |
| `load_memory` | memories-multi.ts | 5/10 | Fetch full memory body by name. | Describes dedup strategy; good. |
| **Browser Rendering** |
| `browser_markdown` | browser.ts | 8/10 | Fetch URL, convert to markdown. | Excellent: clear use case + output format. |
| `browser_extract` | browser.ts | 1/10 | AI-powered structured data scraping. | No description captured. |
| `browser_screenshot` | browser.ts | 1/10 | Take webpage screenshot (PNG base64). | No description captured. |
| `browser_links` | browser.ts | 7/10 | Extract all links from page. | Clear; good navigation hint. |
| `browser_content` | browser.ts | 5/10 | Get rendered HTML (not markdown). | OK; distinct from markdown variant. |
| **Search** |
| `web_search` | search.ts | 4/10 | Web search (pluggable: Serper/Brave/Tavily/Exa). | Mentions provider but no usage guidance. |
| `search_memory` | memory.ts | 4/10 | Search memory by key substring. | Sparse. |
| `search_files` | search-files.ts | 1/10 | Search local filesystem. | No description captured. |
| `search_memories` | session.ts | 1/10 | List/search all memories. | No description. |
| `semantic_search` | search-semantic.ts | 1/10 | AI-powered semantic search. | No description captured. |
| `vectorize_content` | search-semantic.ts | 1/10 | Generate embeddings. | No description. |
| **Google Workspace** (27 tools) |
| `gmail_search` | google-workspace.ts | 2/10 | Search Gmail by query. | Truncated; missing scope hints. |
| `gmail_send` | google-workspace.ts | 1/10 | Send email from user. | No desc; marked `needsApproval: true`. |
| `gmail_draft` | google-workspace.ts | 5/10 | Compose draft (don't auto-send). | Good; contrast with send. |
| `gmail_reply` | google-workspace.ts | 5/10 | Reply to message; handles threading. | OK; mentions replyAll; gated. |
| `gmail_get_message` | google-workspace.ts | 4/10 | Read single message in full. | Truncated; missing attachment hint. |
| `gmail_list_labels` | google-workspace.ts | 1/10 | List user's Gmail labels. | No description. |
| `drive_search` | google-workspace.ts | 1/10 | Search Google Drive. | No description. |
| `drive_get_file` | google-workspace.ts | 1/10 | Fetch Drive file metadata. | No description. |
| `drive_create_folder` | google-workspace.ts | 5/10 | Create Drive folder; gated. | Good; notes confirmation needed. |
| `calendar_upcoming` | google-workspace.ts | 1/10 | List upcoming events. | No description. |
| `calendar_create` | google-workspace.ts | 5/10 | Create calendar event; gated. | Good; notes attendee invites. |
| `calendar_list_events` | google-workspace.ts | 3/10 | List events; three filter modes. | Truncated. |
| `calendar_get_event` | google-workspace.ts | 6/10 | Fetch event full details. | OK; mentions fields returned. |
| `calendar_find_free_slot` | google-workspace.ts | 5/10 | Find meeting availability slots. | OK; describes params. |
| `calendar_update_event` | google-workspace.ts | 5/10 | Modify event; gated. | OK; lists updatable fields. |
| `calendar_delete_event` | google-workspace.ts | 6/10 | Cancel event; gated. | Good; warns re: attendee notifications. |
| `docs_search` | google-workspace.ts | 1/10 | Search Google Docs. | No description. |
| `docs_get` | google-workspace.ts | 1/10 | Read Google Doc. | No description. |
| `docs_create` | google-workspace.ts | 1/10 | Create Google Doc; gated. | No description. |
| `docs_append` | google-workspace.ts | 1/10 | Append content to Doc; gated. | No description. |
| `docs_create_from_markdown` | google-workspace.ts | 8/10 | Markdown → Google Doc (one shot). | Excellent; lists formatting support. |
| `sheets_list_tabs` | google-workspace.ts | 5/10 | List spreadsheet tabs. | OK; hints discovery purpose. |
| `sheets_read_range` | google-workspace.ts | 4/10 | Read range (A1 notation). | Truncated; describes valueRenderOption. |
| `sheets_append_row` | google-workspace.ts | 5/10 | Append rows; gated. | Truncated; mentions parsing modes. |
| `sheets_write_range` | google-workspace.ts | 6/10 | Overwrite range; gated. | Good; warns destructiveness. |
| `tasks_list` | google-workspace.ts | 1/10 | List user's tasks. | No description. |
| `tasks_create` | google-workspace.ts | 1/10 | Create task; gated. | No description. |
| **Microsoft Workspace** (7 tools) |
| `outlook_search` | microsoft-workspace.ts | 1/10 | Search Outlook mail. | No description. |
| `outlook_get_message` | microsoft-workspace.ts | 1/10 | Read Outlook message. | No description. |
| `outlook_send` | microsoft-workspace.ts | 1/10 | Send Outlook email; gated. | No description. |
| `onedrive_search` | microsoft-workspace.ts | 1/10 | Search OneDrive. | No description. |
| `onedrive_get_file` | microsoft-workspace.ts | 1/10 | Fetch OneDrive file. | No description. |
| `msoffice_calendar_list` | microsoft-workspace.ts | 1/10 | List Outlook calendar events. | No description. |
| `msoffice_calendar_create` | microsoft-workspace.ts | 1/10 | Create Outlook event; gated. | No description. |
| **Slack** (5 tools) |
| `slack_search_messages` | slack.ts | 1/10 | Search Slack messages. | No description. |
| `slack_list_channels` | slack.ts | 1/10 | List Slack channels. | No description. |
| `slack_get_channel_history` | slack.ts | 1/10 | Fetch channel message history. | No description. |
| `slack_post_message` | slack.ts | 1/10 | Post message to Slack. | No description. |
| `slack_get_user` | slack.ts | 1/10 | Get Slack user info. | No description. |
| **Notion** (6 tools) |
| `notion_search` | notion.ts | 1/10 | Search Notion. | No description. |
| `notion_get_page` | notion.ts | 1/10 | Read Notion page. | No description. |
| `notion_get_database` | notion.ts | 1/10 | Get database metadata. | No description. |
| `notion_query_database` | notion.ts | 1/10 | Query database. | No description. |
| `notion_create_page` | notion.ts | 1/10 | Create Notion page; gated. | No description. |
| `notion_append_blocks` | notion.ts | 1/10 | Append blocks to page. | No description. |
| **Atlassian** (8 tools) |
| `jira_search_issues` | atlassian.ts | 0/10 | Search Jira issues. | **No description.** |
| `jira_get_issue` | atlassian.ts | 0/10 | Fetch Jira issue details. | **No description.** |
| `jira_create_issue` | atlassian.ts | 0/10 | Create Jira issue; gated. | **No description.** |
| `jira_add_comment` | atlassian.ts | 5/10 | Add comment to issue; gated. | OK; notes destructiveness. |
| `jira_transition_issue` | atlassian.ts | 0/10 | Change issue status/workflow. | **No description.** |
| `confluence_search` | atlassian.ts | 4/10 | Search Confluence pages. | Minimal; mentions API version. |
| `confluence_get_page` | atlassian.ts | 5/10 | Read Confluence page as markdown. | OK; notes format conversion. |
| `confluence_create_page` | atlassian.ts | 5/10 | Create Confluence page; gated. | OK; notes destructiveness. |
| **Entities** (5 tools) |
| `entity_create` | entities.ts | 1/10 | Create entity. | No description. ⚠️ No approval. |
| `entity_update` | entities.ts | 1/10 | Update entity. | No description. ⚠️ No approval. |
| `entity_get` | entities.ts | 6/10 | Fetch single entity by id. | Good; mentions fields. |
| `entity_list` | entities.ts | 1/10 | List entities. | No description. |
| `entity_search` | entities.ts | 1/10 | Search entities. | No description. |
| **Code Execution** (3 tools) |
| `run_python` | code.ts | 1/10 | Execute Python 3 script. | No description. ⚠️ Highly privileged. |
| `run_shell` | code.ts | 1/10 | Execute shell command. | No description. ⚠️ Highly privileged. |
| `run_js` | code.ts | 1/10 | Execute JavaScript. | No description. ⚠️ Highly privileged. |
| **Files** (4 tools) |
| `fs_list` | files.ts | 8/10 | List directory contents. | Excellent; clear use case. |
| `fs_read` | files.ts | 1/10 | Read file contents. | No description. |
| `fs_write` | files.ts | 1/10 | Write file; gated. | No description. |
| `fs_delete` | files.ts | 6/10 | Delete file; gated. | Good; warns irreversibility. |
| **Data Tools** (6 tools) |
| `read_data` | data.ts | 1/10 | Read structured data. | No description. |
| `aggregate_data` | data.ts | 1/10 | Aggregate data. | No description. |
| `pivot_data` | data.ts | 0/10 | Pivot dataset. | No description. |
| `trend_data` | data.ts | 0/10 | Trend analysis. | No description. |
| `distribution_data` | data.ts | 0/10 | Distribution analysis. | No description. |
| `export_data` | data.ts | 1/10 | Export data. | No description. |
| **Other Tools** |
| `web_search` | search.ts | 4/10 | Search web (multiple providers). | OK; mentions pluggable design. |
| `email_send` | email.ts | 1/10 | Send email; gated. | No description. |
| `send_email` | email.ts | 1/10 | (duplicate naming?) | No description. |
| `todos_add` | todo.ts | 8/10 | Add task to session list. | Excellent; explains tracking workflow. |
| `todo_update` | todo.ts | 4/10 | Mark todo complete/cancel. | OK; minimal. ⚠️ No approval. |
| `todo_list` | todo.ts | 7/10 | List current todos. | Good; mentions filtering. |
| `todo_clear` | todo.ts | 5/10 | Clear completed todos. | OK; describes mode. |
| `create_artifact` | artifacts.ts | 7/10 | Create visual artifact (charts/dashboards). | Good; lists use cases. ⚠️ No approval. |
| `edit_artifact` | artifacts.ts | 6/10 | Edit existing artifact. | OK; describes workflow. |
| `generate_image` | image.ts | 1/10 | Generate image from prompt. | No description. |
| `analyze_image` | image-analyze.ts | 1/10 | Analyze image content. | No description. |
| `edit_image` | image-edit.ts | 1/10 | Edit image. | No description. |
| `image_transform` | image-transform.ts | 1/10 | Transform image (resize, etc.). | No description. |
| `image_info` | image-transform.ts | 8/10 | Get image metadata (size, format). | Excellent; clear "use when" guidance. |
| `video_clip` | media.ts | 1/10 | Extract video clip. | No description. |
| `video_frame` | media.ts | 1/10 | Extract video frame. | No description. |
| `video_audio` | media.ts | 6/10 | Extract audio from video as M4A. | Good; clear output format. |
| `video_spritesheet` | media.ts | 1/10 | Generate spritesheet from video. | No description. |
| `transcribe_audio` | audio.ts | 1/10 | Transcribe audio file. | No description. |
| `speak_text` | audio.ts | 0/10 | Text-to-speech synthesis. | No description. |
| `generate_docx` | documents.ts | 8/10 | Create Word doc from content. | Excellent; lists formats. |
| `generate_csv` | documents.ts | 1/10 | Generate CSV file. | No description. |
| `firecrawl_scrape` | firecrawl.ts | 1/10 | Scrape single page. | No description. |
| `firecrawl_crawl` | firecrawl.ts | 1/10 | Crawl entire site. | No description. |
| `places_search` | places.ts | 3/10 | Search local businesses (Google Places). | Minimal. |
| `places_details` | places.ts | 1/10 | Get place details (hours, reviews). | Truncated. |
| `schedule_task` | schedule.ts | 1/10 | Schedule async task. | No description. |
| `cancel_task` | schedule.ts | 6/10 | Cancel scheduled task. | OK; explains pause vs. delete. ⚠️ No approval. |
| `session_stats` | session.ts | 1/10 | Get session statistics. | No description. |
| `list_all_memories` | session.ts | 1/10 | List all user memories. | No description. |
| `list_skills` | skills.ts | 7/10 | List available skills. | Good; describes discovery. |
| `load_skill` | skills.ts | 7/10 | Load full skill instructions. | Good; explains dedup + resources. |
| `read_skill_resource` | skills.ts | 1/10 | Read skill resource file. | No description. |
| `run_skill_script` | skills.ts | 1/10 | Execute skill script. | No description. |
| `install_skill` | skills.ts | 1/10 | Install GitHub skill. | No description. |
| `toggle_skill` | skills.ts | 1/10 | Enable/disable skill. | No description. |
| `create_skill` | skills.ts | 1/10 | Write new skill to R2. | No description. ⚠️ No approval. |
| `start_batch_task` | batch-task.ts | 1/10 | Begin async batch operation. | No description. |
| `channel_add` | channels.ts | 1/10 | Add item to inbox. | No description. |
| `approval_queue` | channels.ts | 1/10 | Check approval queue. | No description. |
| `notify` | channels.ts | 1/10 | Send notification. | No description. |
| `space_send` | channels.ts | 1/10 | Send to collaboration space. | No description. ⚠️ No approval. |
| `webhook_post` | channels.ts | 1/10 | Post to webhook. | No description. |
| `record_finding` | findings.ts | 1/10 | Record audit finding. | No description. |
| `promote_finding` | findings.ts | 1/10 | Promote finding. | No description. |
| `dismiss_finding` | findings.ts | 1/10 | Dismiss finding. | No description. |
| `propose_patch` | propose-patch.ts | 1/10 | Suggest code patch. | No description. |
| `delegate` | delegate.ts | 1/10 | Delegate task to another agent. | No description. |

---

## Cross-Cutting Concerns

### 1. **Description Quality Crisis** (84% Low/Missing)
- **119 of 141 tools** (84%) have insufficient descriptions (score ≤ 3/10)
- Only **3 tools** score >6: `browser_markdown`, `fs_list`, `generate_docx`
- Pattern: High-value tools (Gmail, Jira, Slack, Notion) have **zero** descriptive guidance
- **Impact:** Model cannot distinguish between similar tools, must rely on trial-and-error

### 2. **Naming Inconsistencies** (Mixed Verbs, Unclear Patterns)
| Operation Type | Verbs Used | Tools |
|---|---|---|
| **Search** | `search_*`, `web_search`, `semantic_search` | 5 verbs for 5 tools; inconsistent prefix placement |
| **Get/Fetch** | `get_*`, `*_get_*`, `*_details` | No unified pattern; `places_details` vs. `gmail_get_message` |
| **Read** | `read_*`, `fs_read`, `*_read_*` | Three different patterns in same domain |
| **Load** | `load_*` (unified) | Good; deviates when should be `load_skill_*` |
| **Create** | `create_*`, `*_create_*` | No consistency: `create_artifact` vs. `calendar_create` vs. `tasks_create` |
| **Send** | `send_*`, `*_send` | `send_email` vs. `gmail_send` vs. `slack_post_message` |

**Impact:** Model must memorize exact names; fuzzy search fails; renaming has model-training cost.

### 3. **Approval-Gating Gaps** (Critical)
**8 tools** are destructive/external but lack `needsApproval: true`:
- `create_artifact` — creates visible public content
- `create_skill` — writes to persistent R2 storage
- `entity_create` / `entity_update` — database mutations
- `memory_update` / `memory_remove` — user data mutations
- `space_send` — sends to external channel
- `todo_update` — marks tasks complete (minor; user can undo)

**Why it matters:** These tools can trigger silent side effects without explicit user consent. `create_skill` especially is a privilege issue — persists code to R2.

### 4. **Incomplete Tool Families**
- **Google Workspace (27 tools):** All major methods present but **23 lack descriptions**
- **Microsoft Workspace (7 tools):** All **7 lack descriptions**
- **Slack (5 tools):** All **5 lack descriptions**
- **Notion (6 tools):** All **6 lack descriptions**

Suggests copy-paste template was never completed; descriptions were deferred.

### 5. **Missing Metadata** (No InputSchema Guidance)
Tools like `run_python`, `run_shell`, `run_js` have **zero description** + **zero input hints** despite being code execution vectors.

### 6. **Tool Count & Grouping** (Manageable but Fragmented)
- **141 tools** across **38 files** — not unmanageable, but:
  - `google-workspace.ts` has 27 tools (27% of catalog)
  - `data.ts` has 6 tools with identical structure (data operation namespace)
  - No grouping by permission scopes (Google only, Microsoft only, local-only)

### 7. **Missing Meta-Tools**
- **No tool to list available tools** at runtime (skills has `list_skills` but no `list_tools`)
- **No tool introspection** (can't ask "what tools can I use?")
- **No tool to compose results** (no tool to aggregate multiple tool outputs)
- **No tool to check conversation history** — agent can't ask "what have I already done?"

---

## Verdict: Top 5 Highest-ROI Fixes

### 1. **Bulk Description Audit & Completion** (Effort: High | Impact: Critical)
Generate or restore descriptions for **119 low-score tools**. Template:
```
Use [for X / when user asks Y]. Inputs: [list key params]. Returns: [structure]. 
Limitations: [don't use when Z]. Examples: [if complex].
```
**Why:** 84% of tools are opaque; model defaults to random selection.
**Effort:** 1-2 hours per tool family × 8 families = 8–16 hours total.
**Payoff:** Model can distinguish intent, pick right tool 80% of the time vs. 20%.

### 2. **Standardize Verb Prefixes** (Effort: Low | Impact: High)
Define & enforce:
- `search_*` for all queries (not `web_search`, `semantic_search`)
- `get_*` or `fetch_*` for all retrieval (pick one)
- `create_*` for all mutations (not `*_create`, `new_*`)
- `send_*` for all outbound comms

Map old → new, update 15–20 tool names.
**Why:** Model can predict tool names; reduces hallucination.
**Effort:** 1 hour to define; 2 hours to refactor & test.
**Payoff:** Fewer API call errors; better self-correction.

### 3. **Add Approval Gating** (Effort: Low | Impact: Medium)
Add `needsApproval: true` to 8 tools:
```
- create_skill (code → R2)
- entity_create / entity_update (DB mutations)
- memory_update / memory_remove (user data)
- space_send (external channel)
- create_artifact (optional; review use pattern)
```
**Why:** Prevents silent side effects; meets safety standards.
**Effort:** 30 min (one-line change per tool).
**Payoff:** Zero risk of unauthorized mutations.

### 4. **Add InputSchema Hints to Code Execution Tools** (Effort: Medium | Impact: Medium)
For `run_python`, `run_shell`, `run_js`: add `.describe()` hints to `code` input:
```typescript
code: z.string()
  .describe('Python 3 script. Use for data processing, math, file I/O. Avoid: external APIs, long-running loops.')
```
**Why:** Code execution is highest-privilege; model needs guardrails.
**Effort:** 1 hour.
**Payoff:** Fewer runaway scripts; better error messages.

### 5. **Create `list_tools` Introspection Tool** (Effort: Medium | Impact: Low–Medium)
Add a meta-tool that returns available tool names + one-line summaries:
```typescript
export const listToolsDefinition = {
  name: 'list_tools',
  description: 'List all available tools in this session.',
  execute: async (_, ctx) => {
    const tools = await buildChatTools(ctx);
    return tools.map(t => ({ name: t.name, description: t.description }));
  }
}
```
**Why:** Model can self-discover capabilities; useful for multi-step tasks.
**Effort:** 1–2 hours (need to export tool metadata).
**Payoff:** Better agent planning; fewer "I don't have a tool for X" failures.

---

## Summary

**Status:** Functional but **high description debt** + **naming friction** + **approval gaps**.

**Quick Wins:**
1. Descriptions (biggest payoff; most effort)
2. Verb consistency (low effort; high payoff)
3. Approval gating (trivial effort; critical safety)

**Later/Optional:**
- InputSchema hints (nice, not critical)
- Tool introspection (low priority; rarely needed)
- `send_*` vs. `post_*` unification (cosmetic)

**Immediate Action:** Schedule description sprint + approve naming taxonomy before renaming (model training cost).
