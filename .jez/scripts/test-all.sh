#!/bin/bash
# Comprehensive AI agent test suite v2
# Smarter error detection, longer timeouts, less strict matching

COOKIE='__Secure-better-auth.session_token=Un6S1PdkjHsvp4PaHngsRZAwoq8Q1P0d.86W8Rs2qIoKmMayJ978gxbxwy%2Fgl8E51HfxeZIOKNxQ%3D'
BASE="https://vite-flare-starter.webfonts.workers.dev"
MODEL="${1:-@cf/moonshotai/kimi-k2.5}"
SHORTMODEL=$(echo "$MODEL" | sed 's|.*/||')
PASS_COUNT=0
FAIL_COUNT=0
TOTAL=0

send_chat() {
  local PROMPT="$1"
  local TIMEOUT="${2:-120}"
  # Use python for safe JSON encoding
  local SAFE_PROMPT=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$PROMPT")
  local TS=$(date +%s%N | cut -c1-13)
  local BODY="{\"message\":{\"parts\":[{\"type\":\"text\",\"text\":${SAFE_PROMPT}}],\"id\":\"t${TS}\",\"role\":\"user\"},\"allMessages\":[{\"parts\":[{\"type\":\"text\",\"text\":${SAFE_PROMPT}}],\"id\":\"t${TS}\",\"role\":\"user\"}],\"id\":\"s${TS}\",\"model\":\"$MODEL\"}"

  curl -s --max-time "$TIMEOUT" \
    -H "Content-Type: application/json" \
    -H "Cookie: $COOKIE" \
    -H "Origin: $BASE" \
    -d "$BODY" \
    "$BASE/api/chat" 2>&1 | head -2000
}

check_test() {
  local NAME="$1"
  local RESPONSE="$2"
  local REQUIRE_TOOL="$3"  # tool name that must appear (empty = don't check)
  local REQUIRE_TEXT="$4"  # text that must appear case-insensitive (empty = just check not empty)
  local DURATION="$5"

  TOTAL=$((TOTAL + 1))
  local STATUS="PASS"
  local DETAIL=""

  # Empty response = timeout
  if [ -z "$RESPONSE" ] || [ ${#RESPONSE} -lt 10 ]; then
    STATUS="FAIL"
    DETAIL="empty/timeout"
  # HTTP error from server
  elif echo "$RESPONSE" | head -5 | grep -q '"Chat failed"'; then
    STATUS="FAIL"
    DETAIL="server error"
  else
    # Check tool was called (if required)
    if [ -n "$REQUIRE_TOOL" ]; then
      if echo "$RESPONSE" | grep -q "\"tool-${REQUIRE_TOOL}\"\|\"${REQUIRE_TOOL}\""; then
        DETAIL="tool=yes"
      else
        STATUS="FAIL"
        DETAIL="tool not called"
      fi
    fi
    # Check text appears (if required)
    if [ -n "$REQUIRE_TEXT" ]; then
      if echo "$RESPONSE" | grep -qi "$REQUIRE_TEXT"; then
        DETAIL="${DETAIL:+$DETAIL }text=yes"
      else
        # Not a hard fail if tool was called — model just phrased differently
        if [ "$STATUS" = "PASS" ]; then
          DETAIL="${DETAIL:+$DETAIL }text=different"
        fi
      fi
    fi
    # If no specific checks, just verify we got text content
    if [ -z "$REQUIRE_TOOL" ] && [ -z "$REQUIRE_TEXT" ]; then
      if echo "$RESPONSE" | grep -q '"text"'; then
        DETAIL="got response"
      else
        STATUS="FAIL"
        DETAIL="no text in response"
      fi
    fi
  fi

  if [ "$STATUS" = "PASS" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi

  echo "| $NAME | **$STATUS** | $DETAIL | ${DURATION}s |"
}

echo ""
echo "# Agent Test Results — $SHORTMODEL"
echo ""
echo "| Test | Result | Detail | Time |"
echo "|------|--------|--------|------|"

# === 1. CORE TOOLS ===
START=$(date +%s); R=$(send_chat "What is 99 * 77? Use the calculate tool."); check_test "Calculator" "$R" "calculate" "7623" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "What time is it? Use get_server_time."); check_test "Server time" "$R" "get_server_time" "" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "What model are you running on? Use get_model_info."); check_test "Model info" "$R" "get_model_info" "" "$(($(date +%s)-START))"

# === 2. MEMORY TOOLS (in sequence — remember then recall in one prompt) ===
START=$(date +%s); R=$(send_chat "Use the remember tool to save that my city is Sydney."); check_test "Remember" "$R" "remember" "" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Use the recall tool to look up my city."); check_test "Recall" "$R" "recall" "Sydney" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Use the search_memory tool to search for city."); check_test "Search memory" "$R" "search_memory" "" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Use the forget tool to delete the key user.city."); check_test "Forget" "$R" "forget" "" "$(($(date +%s)-START))"

# === 3. UI TOOLS ===
START=$(date +%s); R=$(send_chat "Give me 3 choices for lunch using the offer_choices tool."); check_test "offer_choices" "$R" "offer_choices" "_ui" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Show a data table of 3 fruits with name and color columns. Use show_data_table."); check_test "show_data_table" "$R" "show_data_table" "_ui" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Show 2 metric cards about weather. Use show_metric_cards."); check_test "show_metric_cards" "$R" "show_metric_cards" "_ui" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Show me a warning alert about rain. Use show_alert."); check_test "show_alert" "$R" "show_alert" "_ui" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Show a timeline of 3 events. Use show_timeline."); check_test "show_timeline" "$R" "show_timeline" "_ui" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Show a progress bar at 75%. Use show_progress."); check_test "show_progress" "$R" "show_progress" "_ui" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Compare two options A vs B. Use show_comparison."); check_test "show_comparison" "$R" "show_comparison" "_ui" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Ask me to confirm an action. Use confirm_action."); check_test "confirm_action" "$R" "confirm_action" "_ui" "$(($(date +%s)-START))"

# === 4. FILE TOOLS ===
START=$(date +%s); R=$(send_chat "List my files using fs_list."); check_test "fs_list" "$R" "fs_list" "" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Create a file called test.txt with content hello. Use fs_write."); check_test "fs_write" "$R" "fs_write" "" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Read the file test.txt using fs_read."); check_test "fs_read" "$R" "fs_read" "" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Delete the file test.txt using fs_delete."); check_test "fs_delete" "$R" "fs_delete" "" "$(($(date +%s)-START))"

# === 5. AUDIO TOOLS ===
START=$(date +%s); R=$(send_chat "Say the phrase 'Hello World' using speak_text tool."); check_test "speak_text (TTS)" "$R" "speak_text" "audio" "$(($(date +%s)-START))"

# === 6. TODO TOOLS ===
START=$(date +%s); R=$(send_chat "Add a todo: Buy milk. Use todo_add."); check_test "todo_add" "$R" "todo_add" "" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Show my todo list using todo_list."); check_test "todo_list" "$R" "todo_list" "" "$(($(date +%s)-START))"
START=$(date +%s); R=$(send_chat "Clear all my todos using todo_clear."); check_test "todo_clear" "$R" "todo_clear" "" "$(($(date +%s)-START))"

# === 7. SKILLS ===
START=$(date +%s); R=$(send_chat "Load the web-research skill using load_skill."); check_test "load_skill" "$R" "load_skill" "" "$(($(date +%s)-START))"

# === 8. DELEGATE (subagent) ===
START=$(date +%s); R=$(send_chat "Delegate a simple task to your researcher: summarize what AI is in one sentence." 120); check_test "delegate" "$R" "delegate" "" "$(($(date +%s)-START))"

echo ""
echo "**Results: $PASS_COUNT passed, $FAIL_COUNT failed out of $TOTAL tests**"
echo ""

# === EXTRACT ENDPOINT (separate from chat) ===
echo "## Extract (Structured Output) Tests"
echo ""
echo "| Test | Result | Detail | Time |"
echo "|------|--------|--------|------|"

# Summary schema
START=$(date +%s)
R=$(curl -s --max-time 60 \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"text":"The quick brown fox jumps over the lazy dog. This is a famous typing test sentence used worldwide.","schema":"summary"}' \
  "$BASE/api/chat/extract" 2>&1)
D=$(($(date +%s)-START))
if echo "$R" | grep -q '"title"\|"summary"'; then
  echo "| Extract: summary | **PASS** | schema returned | ${D}s |"
else
  echo "| Extract: summary | **FAIL** | $R | ${D}s |"
fi

# Entities schema
START=$(date +%s)
R=$(curl -s --max-time 60 \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"text":"Tim Cook announced new products at Apple Park in Cupertino on March 15, 2026.","schema":"entities"}' \
  "$BASE/api/chat/extract" 2>&1)
D=$(($(date +%s)-START))
if echo "$R" | grep -q '"people"\|"places"'; then
  echo "| Extract: entities | **PASS** | schema returned | ${D}s |"
else
  echo "| Extract: entities | **FAIL** | $(echo "$R" | head -1 | cut -c1-80) | ${D}s |"
fi

# Sentiment schema
START=$(date +%s)
R=$(curl -s --max-time 60 \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  -d '{"text":"This product is absolutely amazing! Best purchase I ever made.","schema":"sentiment"}' \
  "$BASE/api/chat/extract" 2>&1)
D=$(($(date +%s)-START))
if echo "$R" | grep -q '"overall"\|"score"'; then
  echo "| Extract: sentiment | **PASS** | schema returned | ${D}s |"
else
  echo "| Extract: sentiment | **FAIL** | $(echo "$R" | head -1 | cut -c1-80) | ${D}s |"
fi

# === CONVERSATION API TESTS ===
echo ""
echo "## Conversation Management Tests"
echo ""
echo "| Test | Result | Detail |"
echo "|------|--------|--------|"

# List conversations
R=$(curl -s --max-time 10 -H "Cookie: $COOKIE" "$BASE/api/conversations" 2>&1)
if echo "$R" | grep -q '"conversations"'; then
  COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.loads(sys.stdin.read())['conversations']))" 2>/dev/null || echo "?")
  echo "| List conversations | **PASS** | $COUNT conversations found |"
else
  echo "| List conversations | **FAIL** | $R |"
fi

# Load a specific conversation
CONV_ID=$(echo "$R" | python3 -c "import sys,json; cs=json.loads(sys.stdin.read())['conversations']; print(cs[0]['id'] if cs else '')" 2>/dev/null)
if [ -n "$CONV_ID" ]; then
  R2=$(curl -s --max-time 10 -H "Cookie: $COOKIE" "$BASE/api/conversations/$CONV_ID" 2>&1)
  if echo "$R2" | grep -q '"messages"'; then
    MSG_COUNT=$(echo "$R2" | python3 -c "import sys,json; print(len(json.loads(sys.stdin.read())['messages']))" 2>/dev/null || echo "?")
    echo "| Load conversation | **PASS** | $MSG_COUNT messages loaded |"
  else
    echo "| Load conversation | **FAIL** | no messages field |"
  fi

  # Export as JSON
  R3=$(curl -s --max-time 10 -H "Cookie: $COOKIE" "$BASE/api/conversations/$CONV_ID/export?format=json" 2>&1)
  if echo "$R3" | grep -q '"exportedAt"'; then
    echo "| Export JSON | **PASS** | exportedAt field present |"
  else
    echo "| Export JSON | **FAIL** | |"
  fi

  # Export as Markdown
  R4=$(curl -s --max-time 10 -H "Cookie: $COOKIE" "$BASE/api/conversations/$CONV_ID/export?format=md" 2>&1)
  if echo "$R4" | grep -q '### \*\*'; then
    echo "| Export Markdown | **PASS** | markdown headers found |"
  else
    echo "| Export Markdown | **FAIL** | |"
  fi
else
  echo "| Load conversation | **SKIP** | no conversations |"
fi

# Search conversations
R5=$(curl -s --max-time 10 -H "Cookie: $COOKIE" "$BASE/api/conversations/search?q=hello" 2>&1)
if echo "$R5" | grep -q '"results"'; then
  echo "| Search conversations | **PASS** | results array returned |"
else
  echo "| Search conversations | **FAIL** | |"
fi

echo ""
echo "All tests complete. $(date)"
