#!/bin/bash
# File-attachment pipeline tests.
# Each fixture contains a unique secret. We upload it as a data-URL file part
# to /api/chat, ask the agent to echo the secret back, and grep the streamed
# response. If the agent "sees" the file, the secret appears in its reply.
#
# Usage: .jez/scripts/test-files.sh [model]
#   Defaults to testing across 3 models (vision, non-vision, fast).

COOKIE='__Secure-better-auth.session_token=Un6S1PdkjHsvp4PaHngsRZAwoq8Q1P0d.86W8Rs2qIoKmMayJ978gxbxwy%2Fgl8E51HfxeZIOKNxQ%3D'
BASE="${BASE_URL:-https://vite-flare-starter.webfonts.workers.dev}"
FIXTURES="$(cd "$(dirname "$0")/.." && pwd)/fixtures/file-tests"

PASS=0
FAIL=0
TOTAL=0

# Encode file to data URL.
to_data_url() {
  local path="$1"
  local mime="$2"
  local b64=$(base64 -i "$path" | tr -d '\n')
  echo "data:${mime};base64,${b64}"
}

# Send a chat request with a file part + text prompt.
# Args: $1 model, $2 prompt, $3 file_path, $4 mime
send_with_file() {
  local model="$1"
  local prompt="$2"
  local file_path="$3"
  local mime="$4"

  local data_url=$(to_data_url "$file_path" "$mime")
  local ts=$(date +%s%N | cut -c1-13)

  # Safely JSON-encode prompt and data URL via python (vars passed via env)
  local body=$(TS="$ts" PROMPT="$prompt" DATA_URL="$data_url" MIME="$mime" MODEL="$model" python3 <<'PYEOF'
import json, os
ts = os.environ["TS"]
msg_id = "t" + ts
session_id = "s" + ts
message = {
    "id": msg_id,
    "role": "user",
    "parts": [
        {"type": "text", "text": os.environ["PROMPT"]},
        {"type": "file", "url": os.environ["DATA_URL"], "mediaType": os.environ["MIME"]},
    ],
}
body = {
    "message": message,
    "allMessages": [message],
    "id": session_id,
    "model": os.environ["MODEL"],
}
print(json.dumps(body))
PYEOF
)

  curl -s --max-time 180 \
    -H "Content-Type: application/json" \
    -H "Cookie: $COOKIE" \
    -H "Origin: $BASE" \
    -d "$body" \
    "$BASE/api/chat"
}

# Grep streamed SSE response for expected secret.
# Args: $1 name, $2 response, $3 expected_secret
check() {
  local name="$1"
  local response="$2"
  local secret="$3"

  TOTAL=$((TOTAL + 1))

  # Flatten the SSE stream; search for the secret inside any delta/text.
  # Some models route final answers through the `done` tool (tool-input-delta).
  local flat=$(echo "$response" | tr '\n' ' ' | tr -d '\r')

  if [ -z "$flat" ]; then
    echo "  FAIL $name — empty response"
    FAIL=$((FAIL + 1))
    return
  fi

  # Case-insensitive match.
  if echo "$flat" | grep -iq "$secret"; then
    echo "  PASS $name — found '$secret'"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name — secret '$secret' NOT in response"
    # Show the first 400 chars of the stream to aid diagnosis
    echo "       response snippet: $(echo "$flat" | head -c 400)..."
    FAIL=$((FAIL + 1))
  fi
}

run_model() {
  local model="$1"
  local label="$2"

  echo ""
  echo "=== $label ($model) ==="

  # Image with visible text
  echo ""
  echo "[image/png] PNG with visible 'PURPLE-ELEPHANT-42' label"
  local r=$(send_with_file "$model" "What exact text appears in this image? Read it out verbatim." "$FIXTURES/image-with-text.png" "image/png")
  check "$label image→vision" "$r" "PURPLE-ELEPHANT-42"

  # Plain text file
  echo ""
  echo "[text/plain] txt with 'BANANAPHONE'"
  local r=$(send_with_file "$model" "What is the secret word mentioned in the attached file?" "$FIXTURES/secret.txt" "text/plain")
  check "$label text→utf8" "$r" "BANANAPHONE"

  # PDF
  echo ""
  echo "[application/pdf] PDF with 'LIGHTHOUSE-ORANGE-47'"
  local r=$(send_with_file "$model" "What is the secret phrase in the attached PDF? Quote it exactly." "$FIXTURES/test-document.pdf" "application/pdf")
  check "$label pdf→markdown" "$r" "LIGHTHOUSE-ORANGE-47"

  # DOCX — Office OpenXML. Before the fix these fell through to TextDecoder
  # and the model hallucinated from PK zip headers.
  if [ -f "$FIXTURES/test-document.docx" ]; then
    echo ""
    echo "[docx] DOCX with 'CINNAMON-SUBMARINE-88'"
    local r=$(send_with_file "$model" "What secret phrase appears in the attached Word document? Quote it exactly." "$FIXTURES/test-document.docx" "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    check "$label docx→markdown" "$r" "CINNAMON-SUBMARINE-88"
  fi

  # Audio — Deepgram Nova 3 transcription on the server then inlined as text.
  # Use webm/opus (matches what AudioRecorder produces in-browser). MP3/WAV
  # are rejected by Workers AI's Deepgram wrapper.
  if [ -f "$FIXTURES/audio-test.webm" ]; then
    echo ""
    echo "[audio/webm] webm/opus saying 'marshmallow dolphin forty two'"
    local r=$(send_with_file "$model" "What words are spoken in the attached audio? Quote them." "$FIXTURES/audio-test.webm" "audio/webm")
    check "$label audio→transcribe" "$r" "marshmallow"
  fi
}

echo "File attachment pipeline tests"
echo "Base: $BASE"
echo "Fixtures: $FIXTURES"

# If a specific model was requested, test only that one.
if [ -n "$1" ]; then
  run_model "$1" "${1##*/}"
else
  run_model "@cf/moonshotai/kimi-k2.5" "Kimi K2.5 (Workers AI, default)"
  run_model "anthropic/claude-haiku-4.5" "Claude Haiku 4.5 (vision-capable)"
fi

echo ""
echo "=== Results: $PASS / $TOTAL passed ==="
exit $FAIL
