#!/usr/bin/env bash
# PostToolUse on edits. Fast feedback only; exit 2 shows stderr to Claude.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -f package.json ] || exit 0
PM=npm; [ -f pnpm-lock.yaml ] && PM=pnpm
has() { python3 -c "import json;print('$1' in json.load(open('package.json')).get('scripts',{}))" 2>/dev/null | grep -q True; }
OUT=""
if has typecheck; then OUT=$($PM run -s typecheck 2>&1) || { echo "typecheck failed:" >&2; echo "$OUT" | tail -20 >&2; exit 2; }; fi
if has lint; then OUT=$($PM run -s lint 2>&1) || { echo "lint failed:" >&2; echo "$OUT" | tail -20 >&2; exit 2; }; fi
exit 0
