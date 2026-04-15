#!/bin/bash
# Test all AI models via the chat API
# Uses the session cookie from the browser

COOKIE='__Secure-better-auth.session_token=Un6S1PdkjHsvp4PaHngsRZAwoq8Q1P0d.86W8Rs2qIoKmMayJ978gxbxwy%2Fgl8E51HfxeZIOKNxQ%3D'
BASE="https://vite-flare-starter.webfonts.workers.dev/api/chat"
PROMPT="Reply with just the single word pong"

MODELS=(
  "@cf/moonshotai/kimi-k2.5"
  "@cf/google/gemma-4-26b-a4b-it"
  "@cf/zai-org/glm-4.7-flash"
  "@cf/qwen/qwq-32b"
  "anthropic/claude-opus-4.6"
  "anthropic/claude-sonnet-4.6"
  "anthropic/claude-haiku-4.5"
  "openai/gpt-5.4"
  "openai/gpt-5.4-mini"
  "google/gemini-3.1-pro-preview"
  "google/gemini-3-flash-preview"
  "deepseek/deepseek-v3.2-speciale"
  "qwen/qwen3.6-plus"
  "mistralai/mistral-large-2512"
  "x-ai/grok-4.1-fast"
  "z-ai/glm-5"
)

echo "| # | Model | Result | Time |"
echo "|---|-------|--------|------|"

for i in "${!MODELS[@]}"; do
  MODEL="${MODELS[$i]}"
  SHORTNAME=$(echo "$MODEL" | sed 's|.*/||')
  START=$(date +%s)

  BODY="{\"message\":{\"parts\":[{\"type\":\"text\",\"text\":\"$PROMPT\"}],\"id\":\"test-${i}\",\"role\":\"user\"},\"allMessages\":[{\"parts\":[{\"type\":\"text\",\"text\":\"$PROMPT\"}],\"id\":\"test-${i}\",\"role\":\"user\"}],\"id\":\"test-session-${i}\",\"model\":\"$MODEL\"}"

  # Send request, capture SSE stream
  RESPONSE=$(curl -s --max-time 90 \
    -H "Content-Type: application/json" \
    -H "Cookie: $COOKIE" \
    -H "Origin: https://vite-flare-starter.webfonts.workers.dev" \
    -d "$BODY" \
    "$BASE" 2>&1 | head -500)

  END=$(date +%s)
  DURATION=$((END - START))

  # Check if response contains text content
  if echo "$RESPONSE" | grep -qi "pong"; then
    echo "| $((i+1)) | $SHORTNAME | **PASS** | ${DURATION}s |"
  elif echo "$RESPONSE" | grep -q '"text"'; then
    # Got a text response but not "pong" — still working
    SNIPPET=$(echo "$RESPONSE" | grep -o '"text":"[^"]*"' | tail -1 | cut -c8-50)
    echo "| $((i+1)) | $SHORTNAME | **PASS** ($SNIPPET...) | ${DURATION}s |"
  elif echo "$RESPONSE" | grep -qi "error\|Error\|failed"; then
    ERR=$(echo "$RESPONSE" | grep -oi '"error[^}]*' | head -1 | cut -c1-80)
    echo "| $((i+1)) | $SHORTNAME | **FAIL** ($ERR) | ${DURATION}s |"
  elif [ -z "$RESPONSE" ]; then
    echo "| $((i+1)) | $SHORTNAME | **TIMEOUT** | ${DURATION}s |"
  else
    echo "| $((i+1)) | $SHORTNAME | **UNKNOWN** | ${DURATION}s |"
  fi
done
