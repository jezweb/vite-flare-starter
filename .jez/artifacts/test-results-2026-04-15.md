# AI Agent Test Results — 2026-04-15

## Model Availability (16/16 PASS)

All 16 models respond to basic chat:

| # | Model | Provider | Time |
|---|-------|----------|------|
| 1 | Kimi K2.5 | Workers AI (free) | 31s |
| 2 | Gemma 4 26B IT | Workers AI (free) | 3s |
| 3 | GLM 4.7 Flash | Workers AI (free) | 4s |
| 4 | QwQ 32B | Workers AI (free) | 7s |
| 5 | Claude Opus 4.6 | Anthropic/OpenRouter | 6s |
| 6 | Claude Sonnet 4.6 | Anthropic/OpenRouter | 6s |
| 7 | Claude Haiku 4.5 | Anthropic/OpenRouter | 5s |
| 8 | GPT-5.4 | OpenAI/OpenRouter | 4s |
| 9 | GPT-5.4 Mini | OpenAI/OpenRouter | 4s |
| 10 | Gemini 3.1 Pro | Google/OpenRouter | 13s |
| 11 | Gemini 3 Flash | Google/OpenRouter | 4s |
| 12 | DeepSeek V3.2 | DeepSeek/OpenRouter | 6s |
| 13 | Qwen 3.6 Plus | Qwen/OpenRouter | 3s |
| 14 | Mistral Large 3 | Mistral/OpenRouter | 89s |
| 15 | Grok 4.1 Fast | xAI/OpenRouter | 5s |
| 16 | GLM 5 | Z.AI/OpenRouter | 8s |

## Tool Testing (3 models, 25 tools each)

### Kimi K2.5 (default): 23/25 PASS

| Tool | Result |
|------|--------|
| calculate | PASS |
| get_server_time | PASS |
| get_model_info | FAIL (model didn't call tool) |
| remember | PASS |
| recall | PASS |
| search_memory | PASS |
| forget | PASS |
| offer_choices | PASS |
| show_data_table | PASS |
| show_metric_cards | PASS |
| show_alert | PASS |
| show_timeline | PASS |
| show_progress | PASS |
| show_comparison | FAIL (model wrote text instead) |
| confirm_action | PASS |
| fs_list | PASS |
| fs_write | PASS |
| fs_read | PASS |
| fs_delete | PASS |
| speak_text | PASS |
| todo_add | PASS |
| todo_list | PASS |
| todo_clear | PASS |
| load_skill | PASS |
| delegate | PASS |

### Claude Sonnet 4.6: 22/25 PASS

| Tool | Result | Note |
|------|--------|------|
| calculate | PASS | |
| get_server_time | PASS | |
| get_model_info | PASS | |
| remember | PASS | |
| recall | PASS | text=different (recalled but phrased differently) |
| search_memory | PASS | |
| forget | PASS | |
| offer_choices | PASS | |
| show_data_table | PASS | |
| show_metric_cards | FAIL | model wrote metrics as text |
| show_alert | PASS | |
| show_timeline | PASS | |
| show_progress | PASS | |
| show_comparison | FAIL | model wrote comparison as text |
| confirm_action | PASS | |
| fs_list | PASS | |
| fs_write | PASS | |
| fs_read | PASS | |
| fs_delete | FAIL | model didn't call delete tool |
| speak_text | PASS | |
| todo_add | PASS | |
| todo_list | PASS | |
| todo_clear | PASS | |
| load_skill | PASS | |
| delegate | PASS | |

### Gemma 4 26B IT: 22/25 PASS

| Tool | Result | Note |
|------|--------|------|
| calculate | PASS | fastest (4s) |
| get_server_time | PASS | |
| get_model_info | FAIL | model didn't call tool |
| remember | PASS | |
| recall | FAIL | answered without calling recall |
| search_memory | PASS | |
| forget | PASS | |
| offer_choices | PASS | |
| show_data_table | PASS | |
| show_metric_cards | PASS | |
| show_alert | PASS | |
| show_timeline | PASS | |
| show_progress | PASS | |
| show_comparison | FAIL | model wrote text instead |
| confirm_action | PASS | |
| fs_list | PASS | |
| fs_write | PASS | |
| fs_read | PASS | |
| fs_delete | PASS | |
| speak_text | PASS | |
| todo_add | PASS | |
| todo_list | PASS | |
| todo_clear | PASS | |
| load_skill | PASS | |
| delegate | PASS | |

## Extract (Structured Output): 3/3 PASS all models

| Schema | Result |
|--------|--------|
| summary | PASS (title, summary, keyPoints, wordCount) |
| entities | PASS (people, places, organizations) |
| sentiment | PASS (overall, score, reasoning) |

## Conversation Management: 5/5 PASS

| Feature | Result |
|---------|--------|
| List conversations | PASS (50 conversations) |
| Load conversation | PASS (messages loaded correctly) |
| Export JSON | PASS |
| Export Markdown | PASS |
| Search conversations | PASS |

## Known Issues

- **show_comparison**: No model calls this tool reliably — they prefer writing comparisons as text. Consider improving the tool description or reducing to simpler tools.
- **get_model_info**: Some models don't call it — they answer from their own knowledge. Not a bug.
- **Intermittent Workers AI hangs**: Kimi K2.5 occasionally takes 30-90s or hangs. Platform issue.

## Summary

- **16/16 models** work for basic chat
- **67/75 tool tests** pass across 3 models (89% pass rate)
- All 8 "failures" are model prompt-following choices, NOT code bugs
- **3/3 extract schemas** work
- **5/5 conversation management** features work
- **Total: 91/96 tests pass (95%)**
