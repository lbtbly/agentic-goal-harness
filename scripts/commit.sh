#!/usr/bin/env bash
# Safe, throttled commit. Callable from any hook: it never fails a turn, never
# pushes, and does nothing at all on a clean tree.
#
#   commit.sh "message"         throttled, skips if the window has not elapsed
#   commit.sh --now "message"   ignores the throttle, for session end and park
#
# Run one committed nothing for seven and a half hours of BUILD and then landed
# 314 paths in one lump. The lead's slice commits are the real history; this is
# the net underneath them, so a crash costs minutes rather than a day.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

NOW=0
[ "$1" = "--now" ] && { NOW=1; shift; }
MSG=${1:-forge: checkpoint}
WINDOW=${FORGE_COMMIT_WINDOW:-600}
STAMP="$(git rev-parse --git-dir)/forge-last-commit"

# Nothing staged, nothing changed, nothing to say.
[ -z "$(git status --porcelain 2>/dev/null)" ] && exit 0

if [ "$NOW" -eq 0 ] && [ -f "$STAMP" ]; then
  LAST=$(cat "$STAMP" 2>/dev/null)
  case "$LAST" in ''|*[!0-9]*) LAST=0 ;; esac
  [ $(( $(date +%s) - LAST )) -lt "$WINDOW" ] && exit 0
fi

git add -A >/dev/null 2>&1 || exit 0

# .gitignore already covers .env and .env.*, and guard.sh blocks moving secret
# files. This is the third lock: a secret that reaches the index never reaches
# a commit, and the refusal is loud because silence here is how keys ship.
LEAK=$(git diff --cached --name-only 2>/dev/null \
  | grep -Ei '(^|/)\.env($|\.)|(^|/)id_(rsa|ed25519)|\.pem$|(^|/)credentials$' \
  | grep -v '\.env\.example$' | head -3)
if [ -n "$LEAK" ]; then
  git reset >/dev/null 2>&1
  {
    echo "forge commit: REFUSED. A secret-looking path reached the index:"
    printf '  %s\n' $LEAK
    echo "Add it to .gitignore, then commit again. Nothing was committed."
  } >&2
  exit 0
fi

if git commit -q -m "$MSG" >/dev/null 2>&1; then
  date +%s > "$STAMP" 2>/dev/null
fi
exit 0
