#!/usr/bin/env bash
# count.sh — reads a unified diff on stdin, emits files_changed,
# insertions, deletions, binary_files counts as a key/value block.
#
# Only counts real changes — skips metadata lines and hunk headers.

set -euo pipefail

input="${SKILL_STDIN:-$(cat)}"

files_changed=$(printf '%s\n' "$input" | grep -cE '^diff --git ' || true)
insertions=$(printf '%s\n' "$input" | grep -cE '^\+[^+]' || true)
deletions=$(printf '%s\n' "$input" | grep -cE '^-[^-]' || true)
binary_files=$(printf '%s\n' "$input" | grep -cE '^Binary files .* differ$' || true)

printf 'files_changed: %s\n' "$files_changed"
printf 'insertions: %s\n' "$insertions"
printf 'deletions: %s\n' "$deletions"
printf 'binary_files: %s\n' "$binary_files"
