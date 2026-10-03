#!/usr/bin/env bash
# Notification. A ping when the greenlight waits or the run needs eyes, and
# silence while a build workflow runs: an idle lead is the design then, not a
# run waiting on its operator.
[ -f "${CLAUDE_PROJECT_DIR:-.}/.forge/BUILDING" ] && exit 0
if command -v osascript >/dev/null 2>&1; then
  osascript -e 'display notification "Forge needs you" with title "Forge"' 2>/dev/null
fi
printf '\a'
exit 0
