# File Attachment Pipeline Test — 2026-04-16

End-to-end test of sending files to the chat agent and confirming the model reads and understands them.

## Method

Each fixture contains a unique "secret" string. Upload via `/api/chat` as a file part, ask the agent to quote the secret back, grep the streamed response.

| Fixture | Secret | Tests |
|---|---|---|
| `image-with-text.png` (640×360, 15KB) | `PURPLE-ELEPHANT-42` | Vision: image → model |
| `secret.txt` (96B) | `BANANAPHONE` | Text: UTF-8 decode → inline |
| `test-document.pdf` (1.3KB) | `LIGHTHOUSE-ORANGE-47` | PDF → `env.AI.toMarkdown()` → inline |
| `audio-test.webm` (27KB opus) | `marshmallow dolphin forty two` | Audio → Deepgram Nova 3 → inline |

Test harness: `.jez/scripts/test-files.sh`. Base URL: production worker.

## Results — 8/8 passing

| Model | Image | Text | PDF | Audio |
|---|---|---|---|---|
| Kimi K2.5 (Workers AI, default) | PASS | PASS | PASS | PASS |
| Claude Haiku 4.5 (OpenRouter, vision) | PASS | PASS | PASS | PASS |

## Bug fixed this session

**Audio transcription was silently failing.** The preprocessor called `env.AI.run('@cf/deepgram/nova-3', { audio: [...bytes] })` with a number array, but Deepgram Nova 3 on Workers AI requires the multipart shape `{ audio: { body: ReadableStream, contentType: string } }`. Raw number-array input returned empty text, and the `if (textContent)` guard left the original binary audio file part in the message — which OpenRouter strips, making the model say "no audio attached".

Fixed in `src/server/modules/chat/routes.ts:106-128` by:
1. Wrapping the audio bytes in FormData → Response → `body + contentType`.
2. Always setting `textContent` (transcript OR explicit fallback message) so the part is always replaced with text the model can read.
3. Added structured JSON logging so future transcription failures are visible in Workers Logs.

## Known limitations

- **MP3 and WAV uploads fail at Deepgram** with `3030: Bad Request: failed to process audio: corrupt or unsupported data`. The in-app `AudioRecorder` records webm/opus natively so the primary voice-input flow works. File-picker uploads of MP3/WAV produce the fallback "transcription failed" message — good UX-wise (user sees explicit failure) but the format should ideally work. Worth investigating whether Workers AI Deepgram accepts different MIME labels or needs a different multipart shape for these formats.
- **Client UI layer not verified.** This suite tests the server pipeline by sending the exact wire format the client sends. Drag-and-drop, file picker, paste-from-clipboard, and multi-file attachments in a single message were NOT tested. Next step.

## Files

- Fixtures: `.jez/fixtures/file-tests/`
- Test harness: `.jez/scripts/test-files.sh`
- Run: `bash .jez/scripts/test-files.sh [optional-model-id]`
