#!/bin/bash
# Pass 3 multi-pane stress capture
#
# Walks viewport widths across the surfaces most likely to break under
# pane combos (Spaces, Chat, Inbox, Findings, Skills, Routines).
#
# Usage:
#   bash .jez/scripts/audit-viewport-matrix.sh <session-name> <state-file>
#
# e.g.
#   bash .jez/scripts/audit-viewport-matrix.sh audit-p3 \
#        .jez/audit-state/jez-power-state.json

set -euo pipefail

SESSION="${1:-audit-p3}"
STATE_FILE="${2:-/Users/jez/Documents/vite-flare-starter/.jez/audit-state/jez-power-state.json}"
EVIDENCE="/Users/jez/Documents/vite-flare-starter/.jez/audit-evidence/2026-05-04/p3-stress"
LIVE="https://vite-flare-starter.webfonts.workers.dev"

mkdir -p "$EVIDENCE"

# Surfaces and viewports per the ux-audit skill's multi-pane stress phase.
# Viewports cover the three regression bands: 1920 (wide), 1440 / 1280 (mid),
# 1024 (the historic vertical-text-stack zone), 768 / 375 (mobile).
SURFACES=("/dashboard" "/dashboard/spaces" "/dashboard/chat" "/dashboard/inbox" "/dashboard/findings" "/dashboard/skills" "/dashboard/routines")
VIEWPORTS=(1920 1440 1280 1024 768 375)

echo "[viewport-matrix] session=$SESSION evidence=$EVIDENCE"

# Open and load auth state
playwright-cli -s="$SESSION" open "$LIVE/dashboard" --persistent
playwright-cli -s="$SESSION" state-load "$STATE_FILE"
playwright-cli -s="$SESSION" reload

for surface in "${SURFACES[@]}"; do
  for vw in "${VIEWPORTS[@]}"; do
    SLUG=$(echo "$surface" | tr '/' '_' | sed 's/^_//' | sed 's/_$//')
    [ -z "$SLUG" ] && SLUG="root"
    OUT="$EVIDENCE/${SLUG}-${vw}.png"
    echo "  $surface @ ${vw}px → $OUT"
    playwright-cli -s="$SESSION" resize "$vw" 900 || true
    playwright-cli -s="$SESSION" goto "$LIVE$surface" || true
    sleep 1
    playwright-cli -s="$SESSION" screenshot --filename="$OUT" --full-page || true
    # Resize down to 1440 longest side for context-budget reasons.
    sips -Z 1440 "$OUT" --out "$OUT" >/dev/null 2>&1 || true
  done
done

# Layout-detection JS (writes a JSON report of any vertical-text stacks /
# overflow / clipping per surface — auditor reviews the JSON not the images).
playwright-cli -s="$SESSION" evaluate "
  const issues = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.writingMode && cs.writingMode !== 'horizontal-tb') {
      issues.push({ tag: el.tagName, classList: el.className, writingMode: cs.writingMode });
    }
    if (el.scrollWidth > el.clientWidth + 4 && cs.overflowX === 'visible') {
      issues.push({ tag: el.tagName, classList: el.className, overflow: 'horizontal' });
    }
  }
  return JSON.stringify({ url: location.href, viewport: window.innerWidth, issues: issues.slice(0, 20) });
" > "$EVIDENCE/layout-issues.json" || true

playwright-cli -s="$SESSION" close
echo "[viewport-matrix] done"
