#!/usr/bin/env bash
# Notification. A ping when the greenlight waits or the run needs eyes.
if command -v osascript >/dev/null 2>&1; then
  osascript -e 'display notification "Forge needs you" with title "Forge"' 2>/dev/null
fi
printf '\a'
exit 0
