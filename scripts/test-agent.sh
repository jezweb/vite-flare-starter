#!/bin/bash
#
# AI Agent Smoke Test Suite
#
# Tests all AI agent features against the deployed app: models, tools,
# structured output, and conversation management.
#
# Usage:
#   ./scripts/test-agent.sh                          # Full suite, default model
#   ./scripts/test-agent.sh --model anthropic/claude-sonnet-4.6
#   ./scripts/test-agent.sh --models-only            # Just test model availability
#   ./scripts/test-agent.sh --tools-only             # Just test tools
#   ./scripts/test-agent.sh --url https://my-app.example.com
#
# Prerequisites:
#   - App deployed and accessible
#   - Valid session cookie (log in via browser, copy cookie from DevTools)
#   - Set COOKIE env var or pass --cookie flag
#
# Environment:
#   AGENT_TEST_URL    Base URL (default: from wrangler.jsonc)
#   AGENT_TEST_COOKIE Session cookie value
#   AGENT_TEST_MODEL  Model to test with (default: @cf/moonshotai/kimi-k2.5)

set -uo pipefail

# === Config ===
URL="${AGENT_TEST_URL:-https://vite-flare-starter.webfonts.workers.dev}"
COOKIE="${AGENT_TEST_COOKIE:-}"
MODEL="${AGENT_TEST_MODEL:-@cf/moonshotai/kimi-k2.5}"
RUN_MODELS=true
RUN_TOOLS=true
RUN_EXTRACT=true
RUN_CONVERSATIONS=true

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --url) URL="$2"; shift 2 ;;
    --cookie) COOKIE="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --models-only) RUN_TOOLS=false; RUN_EXTRACT=false; RUN_CONVERSATIONS=false; shift ;;
    --tools-only) RUN_MODELS=false; RUN_EXTRACT=false; RUN_CONVERSATIONS=false; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$COOKIE" ]; then
  echo "Error: No session cookie. Set AGENT_TEST_COOKIE or pass --cookie."
  echo "  1. Log in to $URL in your browser"
  echo "  2. Open DevTools > Application > Cookies"
  echo "  3. Copy the __Secure-better-auth.session_token value"
  echo "  4. Export AGENT_TEST_COOKIE='value' or pass --cookie 'value'"
  exit 1
fi

SHORTMODEL=$(echo "$MODEL" | sed 's|.*/||')
PASS=0; FAIL=0; TOTAL=0

# === Helpers ===
send_chat() {
  local PROMPT="$1"
  local TIMEOUT="${2:-120}"
  local SAFE=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$PROMPT")
  local TS=$(date +%s%N | cut -c1-13)
  local BODY="{\"message\":{\"parts\":[{\"type\":\"text\",\"text\":${SAFE}}],\"id\":\"t${TS}\",\"role\":\"user\"},\"allMessages\":[{\"parts\":[{\"type\":\"text\",\"text\":${SAFE}}],\"id\":\"t${TS}\",\"role\":\"user\"}],\"id\":\"s${TS}\",\"model\":\"$MODEL\"}"

  curl -s --max-time "$TIMEOUT" \
    -H "Content-Type: application/json" \
    -H "Cookie: __Secure-better-auth.session_token=$COOKIE" \
    -H "Origin: $URL" \
    -d "$BODY" \
    "$URL/api/chat" 2>&1 | head -2000
}

check() {
  local NAME="$1" RESPONSE="$2" TOOL="$3" TEXT="$4" DURATION="$5"
  TOTAL=$((TOTAL + 1))
  local STATUS="PASS" DETAIL=""

  if [ -z "$RESPONSE" ] || [ ${#RESPONSE} -lt 10 ]; then
    STATUS="FAIL"; DETAIL="empty/timeout"
  elif echo "$RESPONSE" | head -5 | grep -q '"Chat failed"'; then
    STATUS="FAIL"; DETAIL="server error"
  else
    if [ -n "$TOOL" ]; then
      if echo "$RESPONSE" | grep -q "\"tool-${TOOL}\"\|\"${TOOL}\""; then
        DETAIL="tool=yes"
      else
        STATUS="FAIL"; DETAIL="tool not called"
      fi
    fi
    if [ -n "$TEXT" ]; then
      if echo "$RESPONSE" | grep -qi "$TEXT"; then
        DETAIL="${DETAIL:+$DETAIL }text=yes"
      else
        DETAIL="${DETAIL:+$DETAIL }text=different"
      fi
    fi
    if [ -z "$TOOL" ] && [ -z "$TEXT" ]; then
      if echo "$RESPONSE" | grep -q '"text"'; then DETAIL="got response"
      else STATUS="FAIL"; DETAIL="no text"; fi
    fi
  fi

  [ "$STATUS" = "PASS" ] && PASS=$((PASS + 1)) || FAIL=$((FAIL + 1))
  printf "| %-25s | %-7s | %-25s | %3ss |\n" "$NAME" "$STATUS" "$DETAIL" "$DURATION"
}

echo ""
echo "# AI Agent Test Suite"
echo "  URL:   $URL"
echo "  Model: $SHORTMODEL"
echo "  Date:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# === 1. Model Availability ===
if $RUN_MODELS; then
  echo "## Model Availability"
  echo ""
  printf "| %-35s | %-7s | %5s |\n" "Model" "Result" "Time"
  printf "| %-35s | %-7s | %5s |\n" "---" "---" "---"

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

  MODEL_PASS=0; MODEL_TOTAL=${#MODELS[@]}
  for M in "${MODELS[@]}"; do
    SHORT=$(echo "$M" | sed 's|.*/||')
    S=$(date +%s)
    SAFE=$(python3 -c "import json,sys; print(json.dumps('Reply pong'))")
    TS=$(date +%s%N | cut -c1-13)
    BODY="{\"message\":{\"parts\":[{\"type\":\"text\",\"text\":${SAFE}}],\"id\":\"m${TS}\",\"role\":\"user\"},\"allMessages\":[{\"parts\":[{\"type\":\"text\",\"text\":${SAFE}}],\"id\":\"m${TS}\",\"role\":\"user\"}],\"id\":\"ms${TS}\",\"model\":\"$M\"}"
    R=$(curl -s --max-time 120 -H "Content-Type: application/json" -H "Cookie: __Secure-better-auth.session_token=$COOKIE" -H "Origin: $URL" -d "$BODY" "$URL/api/chat" 2>&1 | head -500)
    D=$(($(date +%s) - S))
    if echo "$R" | grep -q '"text"'; then
      printf "| %-35s | %-7s | %3ss  |\n" "$SHORT" "PASS" "$D"
      MODEL_PASS=$((MODEL_PASS + 1))
    else
      printf "| %-35s | %-7s | %3ss  |\n" "$SHORT" "FAIL" "$D"
    fi
  done
  echo ""
  echo "Models: $MODEL_PASS/$MODEL_TOTAL passed"
  echo ""
fi

# === 2. Tool Tests ===
if $RUN_TOOLS; then
  echo "## Tool Tests (model: $SHORTMODEL)"
  echo ""
  printf "| %-25s | %-7s | %-25s | %5s |\n" "Tool" "Result" "Detail" "Time"
  printf "| %-25s | %-7s | %-25s | %5s |\n" "---" "---" "---" "---"

  S=$(date +%s); R=$(send_chat "What is 99 * 77? Use calculate tool."); check "calculate" "$R" "calculate" "7623" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "What time is it? Use get_server_time."); check "get_server_time" "$R" "get_server_time" "" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "What model are you? Use get_model_info."); check "get_model_info" "$R" "get_model_info" "" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Remember my city is Sydney. Use remember tool."); check "remember" "$R" "remember" "" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "What is my city? Use recall tool."); check "recall" "$R" "recall" "" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Search memories for city. Use search_memory."); check "search_memory" "$R" "search_memory" "" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Forget user.city. Use forget tool."); check "forget" "$R" "forget" "" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Give 3 lunch options. Use offer_choices."); check "offer_choices" "$R" "offer_choices" "_ui" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Show a table of 3 fruits. Use show_data_table."); check "show_data_table" "$R" "show_data_table" "_ui" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Show 2 weather metrics. Use show_metric_cards."); check "show_metric_cards" "$R" "show_metric_cards" "_ui" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Show a warning alert. Use show_alert."); check "show_alert" "$R" "show_alert" "_ui" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Show a 3-event timeline. Use show_timeline."); check "show_timeline" "$R" "show_timeline" "_ui" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Show progress at 75%. Use show_progress."); check "show_progress" "$R" "show_progress" "_ui" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Ask to confirm an action. Use confirm_action."); check "confirm_action" "$R" "confirm_action" "_ui" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "List my files. Use fs_list."); check "fs_list" "$R" "fs_list" "" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Create test.txt with hello. Use fs_write."); check "fs_write" "$R" "fs_write" "" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Read test.txt. Use fs_read."); check "fs_read" "$R" "fs_read" "" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Delete test.txt. Use fs_delete."); check "fs_delete" "$R" "fs_delete" "" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Say hello world aloud. Use speak_text."); check "speak_text (TTS)" "$R" "speak_text" "audio" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Add todo: Buy milk. Use todo_add."); check "todo_add" "$R" "todo_add" "" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Show my todos. Use todo_list."); check "todo_list" "$R" "todo_list" "" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Clear all todos. Use todo_clear."); check "todo_clear" "$R" "todo_clear" "" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Load web-research skill. Use load_skill."); check "load_skill" "$R" "load_skill" "" "$(($(date +%s)-S))"
  S=$(date +%s); R=$(send_chat "Delegate: summarize what AI is in one sentence." 120); check "delegate" "$R" "delegate" "" "$(($(date +%s)-S))"

  echo ""
  echo "Tools: $PASS/$TOTAL passed, $FAIL failed"
  echo ""
fi

# === 3. Extract ===
if $RUN_EXTRACT; then
  echo "## Extract (Structured Output)"
  echo ""
  EXTRACT_PASS=0; EXTRACT_TOTAL=0

  for SCHEMA in summary entities sentiment; do
    EXTRACT_TOTAL=$((EXTRACT_TOTAL + 1))
    case $SCHEMA in
      summary) TEXT="The quick brown fox jumps over the lazy dog. Famous typing test." ;;
      entities) TEXT="Tim Cook announced new products at Apple Park in Cupertino on March 15." ;;
      sentiment) TEXT="This product is absolutely amazing! Best purchase ever." ;;
    esac
    R=$(curl -s --max-time 60 \
      -H "Content-Type: application/json" \
      -H "Cookie: __Secure-better-auth.session_token=$COOKIE" \
      -d "{\"text\":\"$TEXT\",\"schema\":\"$SCHEMA\"}" \
      "$URL/api/chat/extract" 2>&1)
    if echo "$R" | grep -q '"success":true'; then
      printf "| %-25s | %-7s |\n" "extract:$SCHEMA" "PASS"
      EXTRACT_PASS=$((EXTRACT_PASS + 1))
    else
      printf "| %-25s | %-7s |\n" "extract:$SCHEMA" "FAIL"
    fi
  done
  echo ""
  echo "Extract: $EXTRACT_PASS/$EXTRACT_TOTAL passed"
  echo ""
fi

# === 4. Conversations ===
if $RUN_CONVERSATIONS; then
  echo "## Conversation Management"
  echo ""
  CONV_PASS=0; CONV_TOTAL=0

  # List
  CONV_TOTAL=$((CONV_TOTAL + 1))
  R=$(curl -s --max-time 10 -H "Cookie: __Secure-better-auth.session_token=$COOKIE" "$URL/api/conversations" 2>&1)
  if echo "$R" | grep -q '"conversations"'; then
    COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.loads(sys.stdin.read())['conversations']))" 2>/dev/null || echo "?")
    printf "| %-25s | %-7s | %s |\n" "list" "PASS" "$COUNT conversations"
    CONV_PASS=$((CONV_PASS + 1))
  else
    printf "| %-25s | %-7s |\n" "list" "FAIL"
  fi

  # Load
  CONV_ID=$(echo "$R" | python3 -c "import sys,json; cs=json.loads(sys.stdin.read())['conversations']; print(cs[0]['id'] if cs else '')" 2>/dev/null)
  if [ -n "$CONV_ID" ]; then
    CONV_TOTAL=$((CONV_TOTAL + 1))
    R2=$(curl -s --max-time 10 -H "Cookie: __Secure-better-auth.session_token=$COOKIE" "$URL/api/conversations/$CONV_ID" 2>&1)
    if echo "$R2" | grep -q '"messages"'; then
      printf "| %-25s | %-7s |\n" "load" "PASS"
      CONV_PASS=$((CONV_PASS + 1))
    else
      printf "| %-25s | %-7s |\n" "load" "FAIL"
    fi

    CONV_TOTAL=$((CONV_TOTAL + 1))
    R3=$(curl -s --max-time 10 -H "Cookie: __Secure-better-auth.session_token=$COOKIE" "$URL/api/conversations/$CONV_ID/export?format=json" 2>&1)
    if echo "$R3" | grep -q '"exportedAt"'; then
      printf "| %-25s | %-7s |\n" "export:json" "PASS"
      CONV_PASS=$((CONV_PASS + 1))
    else
      printf "| %-25s | %-7s |\n" "export:json" "FAIL"
    fi

    CONV_TOTAL=$((CONV_TOTAL + 1))
    R4=$(curl -s --max-time 10 -H "Cookie: __Secure-better-auth.session_token=$COOKIE" "$URL/api/conversations/$CONV_ID/export?format=md" 2>&1)
    if echo "$R4" | grep -q '###'; then
      printf "| %-25s | %-7s |\n" "export:markdown" "PASS"
      CONV_PASS=$((CONV_PASS + 1))
    else
      printf "| %-25s | %-7s |\n" "export:markdown" "FAIL"
    fi
  fi

  CONV_TOTAL=$((CONV_TOTAL + 1))
  R5=$(curl -s --max-time 10 -H "Cookie: __Secure-better-auth.session_token=$COOKIE" "$URL/api/conversations/search?q=hello" 2>&1)
  if echo "$R5" | grep -q '"results"'; then
    printf "| %-25s | %-7s |\n" "search" "PASS"
    CONV_PASS=$((CONV_PASS + 1))
  else
    printf "| %-25s | %-7s |\n" "search" "FAIL"
  fi

  echo ""
  echo "Conversations: $CONV_PASS/$CONV_TOTAL passed"
fi

echo ""
echo "---"
echo "Total: $((PASS + ${MODEL_PASS:-0} + ${EXTRACT_PASS:-0} + ${CONV_PASS:-0})) passed"
echo "Done: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
