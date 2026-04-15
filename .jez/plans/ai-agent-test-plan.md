# AI Agent System — Exhaustive Test Plan

Every test must be run in a browser against the deployed app. No shortcuts.
Each test has a specific input and expected outcome. Mark PASS/FAIL.

## 1. Core Chat (Every Model)

For EACH of the 16 models (4 Workers AI + 12 OpenRouter), test:

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1.1 | Simple text | "Say hello in 5 words" | Non-empty text response |
| 1.2 | Streaming | Watch response appear word-by-word | Progressive rendering, not a block |
| 1.3 | Model footer | Check metadata after response | Correct model ID, token count, duration |
| 1.4 | Conversation saved | Reload the page with same URL | Messages restored from D1 |

Priority models to test first: Kimi K2.5 (default), Claude Sonnet 4.6, GPT-5.4, Gemini 3 Flash, DeepSeek V3.2

## 2. File Attachments

| # | Test | Input | Expected |
|---|------|-------|----------|
| 2.1 | Image upload (JPEG) | Attach photo via + menu, ask "describe this" | Model describes the image |
| 2.2 | Image paste | Cmd+V a screenshot, auto-sends | Vision model describes it |
| 2.3 | PDF upload | Attach a PDF, ask "summarize this" | PDF converted via toMarkdown, text injected |
| 2.4 | Text file | Attach .txt or .csv | Content extracted and discussed |
| 2.5 | Multiple files | Attach 2+ images at once | All processed |
| 2.6 | Large file | Attach >5MB file | Error message, not crash |
| 2.7 | Wrong file type | Attach .exe or .zip | Graceful handling |

## 3. Tool Calling

### 3.1 Core Tools
| # | Test | Input | Expected |
|---|------|-------|----------|
| 3.1.1 | Calculator | "What is 12345 * 6789?" | Tool called, correct result (83,810,205) |
| 3.1.2 | Server time | "What time is it?" | get_server_time returns UTC time |
| 3.1.3 | Model info | "What model are you running on?" | get_model_info returns current model metadata |
| 3.1.4 | Done tool | "Plan a project" → model calls done | Answer rendered as text, NOT as tool accordion |

### 3.2 Memory Tools
| # | Test | Input | Expected |
|---|------|-------|----------|
| 3.2.1 | Remember | "Remember my name is Alex" | remember tool called, confirms saved |
| 3.2.2 | Recall | "What's my name?" | recall returns "Alex" |
| 3.2.3 | Search memory | "Search my memories for 'name'" | search_memory returns results |
| 3.2.4 | Forget | "Forget my name" | forget tool called, confirms deleted |
| 3.2.5 | Persist across conversations | New chat → "What's my name?" | Still knows "Alex" (user_meta table) |

### 3.3 UI Tools
| # | Test | Input | Expected |
|---|------|-------|----------|
| 3.3.1 | offer_choices | "Give me options for what to work on" | Rendered as clickable choice cards |
| 3.3.2 | Choice selection | Click a choice from 3.3.1 | Choice sent as new message, conversation continues |
| 3.3.3 | show_data_table | "Show me a table of top 5 languages" | Rendered as inline table |
| 3.3.4 | show_metric_cards | "Show me some stats" | Rendered as metric cards |
| 3.3.5 | show_alert | "Show me a warning" | Alert rendered inline |
| 3.3.6 | confirm_action | "Delete all my files (confirm first)" | Confirmation dialog with approve/deny |

### 3.4 File Tools (requires FILES binding)
| # | Test | Input | Expected |
|---|------|-------|----------|
| 3.4.1 | fs_list | "List my files" | Returns file listing or empty |
| 3.4.2 | fs_write | "Create a file called test.txt with 'hello'" | File written to R2 |
| 3.4.3 | fs_read | "Read the test.txt file" | Returns file content |
| 3.4.4 | fs_delete | "Delete test.txt" | File removed |

### 3.5 Document Generation
| # | Test | Input | Expected |
|---|------|-------|----------|
| 3.5.1 | Generate DOCX | "Create a Word doc with a project plan" | .docx file with download link that works |
| 3.5.2 | Generate CSV | "Create a CSV of 10 sample products" | .csv file with download link that works |
| 3.5.3 | Download URL | Click the download link from 3.5.1 | File downloads, opens correctly |

### 3.6 Code Execution (requires SANDBOX binding)
| # | Test | Input | Expected |
|---|------|-------|----------|
| 3.6.1 | run_python | "Run: print('hello world')" | Returns "hello world" |
| 3.6.2 | run_js | "Run this JS: console.log(2+2)" | Returns "4" |
| 3.6.3 | No sandbox | If SANDBOX not bound, tool returns setup message | Clear message, not crash |

### 3.7 Audio Tools
| # | Test | Input | Expected |
|---|------|-------|----------|
| 3.7.1 | Audio recorder | Click mic, record 3s, stop | Blob sent as attachment with "transcribe" prompt |
| 3.7.2 | speak_text | "Read this aloud: Hello world" | Audio player or download |
| 3.7.3 | transcribe_audio | Upload audio file | Transcription returned as text |

### 3.8 Search Tools (requires SERPER_API_KEY etc.)
| # | Test | Input | Expected |
|---|------|-------|----------|
| 3.8.1 | Web search | "Search the web for latest AI news" | web_search returns results with titles/URLs |
| 3.8.2 | No key | If no search key set | Tool either absent or returns "not configured" |

### 3.9 Delegate (Subagent)
| # | Test | Input | Expected |
|---|------|-------|----------|
| 3.9.1 | Delegate | "Research quantum computing (use your researcher)" | delegate tool called, subagent streams results |

### 3.10 Skills
| # | Test | Input | Expected |
|---|------|-------|----------|
| 3.10.1 | Load skill | "Load the web-research skill" | load_skill returns skill content |
| 3.10.2 | List skills | "What skills do you have?" | Lists available skill names |

## 4. Reasoning

| # | Test | Input | Expected |
|---|------|-------|----------|
| 4.1 | QwQ reasoning | Switch to QwQ 32B, ask "What is 15! / 10!" | "Thought for N seconds" collapsible shown |
| 4.2 | Expand reasoning | Click the reasoning disclosure | Shows step-by-step thinking |
| 4.3 | Non-reasoning model | Same prompt on Kimi K2.5 | No reasoning section (or brief one) |

## 5. Conversation Management

| # | Test | Input | Expected |
|---|------|-------|----------|
| 5.1 | Auto-title | Send first message | Sidebar shows title from first message |
| 5.2 | New chat | Click "+ New chat" | Clears messages, navigates to /chat |
| 5.3 | Load conversation | Click a conversation in sidebar | Messages hydrated from D1 |
| 5.4 | Delete conversation | Hover → trash icon | Conversation removed from sidebar |
| 5.5 | Search conversations | Type in search box | Results filtered by content/title |
| 5.6 | Export markdown | Click download icon in header | .md file downloads with conversation |
| 5.7 | Export JSON | Add ?format=json to export URL | JSON file with full messages |

## 6. Message Interactions

| # | Test | Input | Expected |
|---|------|-------|----------|
| 6.1 | Regenerate | Click Regenerate on last response | Response replaced with new generation |
| 6.2 | Edit message | Hover user message → pencil → edit → save | History truncated, re-sent with new text |
| 6.3 | Code block | Ask for a TypeScript function | Syntax-highlighted code with copy button |
| 6.4 | Copy code | Click copy icon on code block | Copied to clipboard |
| 6.5 | Markdown rendering | Ask for a response with headers, lists, bold | All markdown elements rendered correctly |

## 7. Model Switching

| # | Test | Input | Expected |
|---|------|-------|----------|
| 7.1 | Switch mid-chat | Change model in dropdown, send message | New message uses selected model (check footer) |
| 7.2 | Switch back | Switch to another model and back | Both models work |
| 7.3 | Model selector groups | Open dropdown | Grouped by provider (Free · Workers AI, Google, Anthropic, etc.) |

## 8. Extract (Structured Output)

| # | Test | Input | Expected |
|---|------|-------|----------|
| 8.1 | Summary schema | Paste article text, select Summary, click Extract | JSON with title, summary, key_points, word_count |
| 8.2 | Entities schema | Same text, Entities schema | JSON with people, places, organizations |
| 8.3 | Sentiment schema | Same text, Sentiment schema | JSON with mood, score, reasoning |
| 8.4 | Empty input | Click Extract with no text | Validation error or empty result |

## 9. Error Handling

| # | Test | Input | Expected |
|---|------|-------|----------|
| 9.1 | Network disconnect | Send message, then go offline mid-stream | Error displayed, can retry |
| 9.2 | Invalid model | Force an invalid model ID somehow | Error message, not crash |
| 9.3 | Rate limit | Send 60+ messages in an hour | 429 error displayed cleanly |
| 9.4 | Long message | Paste 10,000+ characters | Handled without crash |

## 10. Image/Video Processing (requires IMAGES/MEDIA bindings)

| # | Test | Input | Expected |
|---|------|-------|----------|
| 10.1 | Image transform | "Resize this image to 200x200" (after upload) | image_transform called, result URL works |
| 10.2 | Background removal | "Remove the background" | segment tool called, transparent PNG |
| 10.3 | Video frame | Upload video, "Extract a frame at 5 seconds" | video_frame returns still image |
| 10.4 | Video clip | "Clip this video to first 10 seconds" | video_clip returns shorter video |

## Execution Order

1. **Critical path first**: 1.1-1.4 on Kimi K2.5 (default model works?)
2. **Tool basics**: 3.1 (calculator, time, done), 3.2 (memory), 3.3 (UI tools)
3. **File handling**: 2.1-2.4 (attachments), 3.5 (doc generation)
4. **Conversation management**: 5.1-5.7
5. **Message interactions**: 6.1-6.5
6. **Model switching**: 7.1-7.3 (test 3-4 models)
7. **Extract**: 8.1-8.4
8. **Advanced tools**: 3.4 (files), 3.6 (code), 3.7 (audio), 3.9 (delegate)
9. **Error handling**: 9.1-9.4
10. **Processing**: 10.1-10.4

## Running the Tests

Use Chrome (MCP browser tools) for each test. Take screenshots of failures.
After all tests pass, take final screenshots for README.
Then record animated GIFs of: tool calling, reasoning, file upload, code generation.
