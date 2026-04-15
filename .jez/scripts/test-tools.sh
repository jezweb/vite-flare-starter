#!/bin/bash
# Comprehensive tool test suite — sends targeted prompts that trigger specific tools
# Each prompt is designed to deterministically invoke a specific tool

COOKIE='__Secure-better-auth.session_token=Un6S1PdkjHsvp4PaHngsRZAwoq8Q1P0d.86W8Rs2qIoKmMayJ978gxbxwy%2Fgl8E51HfxeZIOKNxQ%3D'
BASE="https://vite-flare-starter.webfonts.workers.dev/api/chat"
MODEL="${1:-@cf/moonshotai/kimi-k2.5}"
SHORTMODEL=$(echo "$MODEL" | sed 's|.*/||')

send_test() {
  local TEST_NAME="$1"
  local PROMPT="$2"
  local EXPECT_TOOL="$3"
  local EXPECT_TEXT="$4"
  local TIMEOUT="${5:-90}"

  local BODY="{\"message\":{\"parts\":[{\"type\":\"text\",\"text\":$(python3 -c "import json; print(json.dumps('$PROMPT'))")}],\"id\":\"t-$(date +%s%N)\",\"role\":\"user\"},\"allMessages\":[{\"parts\":[{\"type\":\"text\",\"text\":$(python3 -c "import json; print(json.dumps('$PROMPT'))")}],\"id\":\"t-$(date +%s%N)\",\"role\":\"user\"}],\"id\":\"s-$(date +%s%N)\",\"model\":\"$MODEL\"}"

  local START=$(date +%s)
  local RESPONSE=$(curl -s --max-time "$TIMEOUT" \
    -H "Content-Type: application/json" \
    -H "Cookie: $COOKIE" \
    -H "Origin: https://vite-flare-starter.webfonts.workers.dev" \
    -d "$BODY" \
    "$BASE" 2>&1 | head -1000)
  local END=$(date +%s)
  local DURATION=$((END - START))

  local TOOL_OK="n/a"
  local TEXT_OK="n/a"
  local STATUS="PASS"

  # Check tool invocation
  if [ -n "$EXPECT_TOOL" ]; then
    if echo "$RESPONSE" | grep -q "\"tool-${EXPECT_TOOL}\""; then
      TOOL_OK="yes"
    elif echo "$RESPONSE" | grep -q "\"${EXPECT_TOOL}\""; then
      TOOL_OK="yes"
    else
      TOOL_OK="NO"
      STATUS="FAIL"
    fi
  fi

  # Check expected text in response
  if [ -n "$EXPECT_TEXT" ]; then
    if echo "$RESPONSE" | grep -qi "$EXPECT_TEXT"; then
      TEXT_OK="yes"
    else
      TEXT_OK="NO"
      STATUS="FAIL"
    fi
  fi

  # Check for errors
  if echo "$RESPONSE" | grep -q '"Chat failed"\|"error":\|500'; then
    if [ "$STATUS" = "PASS" ]; then
      STATUS="ERROR"
    fi
  fi

  # Check for empty response
  if [ -z "$RESPONSE" ]; then
    STATUS="TIMEOUT"
  fi

  echo "| $TEST_NAME | $SHORTMODEL | tool=$TOOL_OK text=$TEXT_OK | **$STATUS** | ${DURATION}s |"
}

echo ""
echo "## Tool Tests — Model: $SHORTMODEL"
echo ""
echo "| Test | Model | Checks | Result | Time |"
echo "|------|-------|--------|--------|------|"

# === CORE TOOLS ===
send_test "3.1.1 Calculator" "What is 12345 * 6789? Use the calculate tool." "calculate" "83810205"
send_test "3.1.2 Server time" "What time is it right now? Use the get_server_time tool." "get_server_time" "UTC"
send_test "3.1.3 Model info" "What model are you? Use the get_model_info tool to check." "get_model_info" ""

# === MEMORY TOOLS ===
send_test "3.2.1 Remember" "Remember that my favourite color is blue. Use the remember tool." "remember" "blue"
send_test "3.2.2 Recall" "What is my favourite color? Use the recall tool to check." "recall" "blue"
send_test "3.2.4 Forget" "Forget my favourite color. Use the forget tool." "forget" ""

# === UI TOOLS ===
send_test "3.3.1 offer_choices" "Give me 3 options for a weekend activity. Use the offer_choices tool." "offer_choices" "_ui"
send_test "3.3.3 show_data_table" "Show me a table of the top 3 planets by size. Use the show_data_table tool." "show_data_table" "_ui"
send_test "3.3.4 show_metric_cards" "Show me 3 stats about Earth. Use the show_metric_cards tool." "show_metric_cards" "_ui"
send_test "3.3.5 show_alert" "Show me a warning about something. Use the show_alert tool." "show_alert" "_ui"
send_test "3.3.6 confirm_action" "Confirm before deleting my files. Use the confirm_action tool." "confirm_action" "_ui"

# === FILE TOOLS (may fail if no FILES binding in test) ===
send_test "3.4.1 fs_list" "List my files. Use the fs_list tool." "fs_list" ""

# === AUDIO TOOLS ===
send_test "3.7.2 speak_text" "Say hello world aloud. Use the speak_text tool." "speak_text" "audio"

# === SKILLS ===
send_test "3.10.1 load_skill" "Load the web-research skill. Use the load_skill tool." "load_skill" ""

# === TODO TOOLS ===
send_test "todo_add" "Add a todo item: Buy groceries. Use the todo_add tool." "todo_add" ""
send_test "todo_list" "List my todos. Use the todo_list tool." "todo_list" ""

echo ""
echo "Done. $(date)"
