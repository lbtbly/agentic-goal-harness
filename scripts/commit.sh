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
# It is also the PostToolUse hook on every edit, so outside a forge project it
# must do nothing at all: no git call, no commit in someone else's repo.
[ -d .forge ] || exit 0

NOW=0
[ "$1" = "--now" ] && { NOW=1; shift; }
MSG=${1:-forge: checkpoint}
WINDOW=${FORGE_COMMIT_WINDOW:-600}
# A worded value made `[ -lt ]` exit 2, the `&& exit 0` never fired, and the
# throttle failed open: a commit per hook call, and run one had 1126 of them.
case "$WINDOW" in ''|*[!0-9]*) WINDOW=600 ;; esac
# Kept inside .git so the stamp never dirties the tree it is throttling; a
# worktree has a .git file instead of a directory and falls back to .forge.
STAMP=.git/forge-last-commit; [ -d .git ] || STAMP=.forge/.last-commit

# The throttle is read before git is touched, because this runs on every edit
# and inside the window the answer is already known.
if [ "$NOW" -eq 0 ] && [ -f "$STAMP" ]; then
  LAST=$(cat "$STAMP" 2>/dev/null)
  case "$LAST" in ''|*[!0-9]*) LAST=0 ;; esac
  [ $(( $(date +%s) - LAST )) -lt "$WINDOW" ] && exit 0
fi

# Three states. Not a repo is a choice and stays silent. Git that cannot run
# (a blocked Xcode license exits 69) is a broken safety net, and saying nothing
# about it is how a run once committed nothing for days.
GD=$(git rev-parse --git-dir 2>&1); RC=$?
if [ "$RC" -ne 0 ]; then
  case "$GD" in
    *"not a git repository"*) exit 0 ;;
  esac
  {
    printf 'commit blocked %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'git cannot run, so nothing is being committed:\n  %s\n' "$(printf '%s' "$GD" | head -1)"
    printf 'On macOS this is usually the Xcode license: sudo xcodebuild -license accept\n'
  } > .forge/COMMIT-BLOCKED 2>/dev/null
  echo "forge commit: BLOCKED, git cannot run. See .forge/COMMIT-BLOCKED." >&2
  exit 0
fi

# Nothing staged, nothing changed, nothing to say.
[ -z "$(git status --porcelain 2>/dev/null)" ] && exit 0

# .gitignore already covers .env and .env.*, and guard.sh blocks moving secret
# files. This is the third lock: a secret must never reach a commit.
#
# Checked BEFORE staging, deliberately. The first version staged everything and
# then ran `git reset` on a hit, which discarded any index the lead had built
# by hand. Nothing here touches the index until the tree is known clean.
#
# .forge/commit-allow holds one path per line for the cases where a matching
# name is genuinely committable: a public certificate, a test fixture key.
CANDIDATES=$(git status --porcelain --untracked-files=all 2>/dev/null | cut -c4-)
LEAK=$(printf '%s\n' "$CANDIDATES" \
  | grep -Ei '(^|/)\.env($|\.)|(^|/)id_(rsa|ed25519)|\.pem$|\.key$|(^|/)credentials$' \
  | grep -v '\.env\.example$')
if [ -n "$LEAK" ] && [ -f .forge/commit-allow ]; then
  LEAK=$(printf '%s\n' "$LEAK" | grep -vxF -f .forge/commit-allow || true)
fi

if [ -n "$LEAK" ]; then
  # Every caller invokes this as `commit.sh ... >/dev/null 2>&1`, so stderr
  # goes nowhere. A refusal nobody can see stops the safety net for the rest of
  # the run while every call still reports success. Leave the record on disk,
  # where rehydrate.sh and the operator will both find it.
  {
    printf 'commit refused %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'A secret-looking path is in the working tree, so nothing is being\n'
    printf 'committed and the safety net is OFF until it is resolved:\n'
    printf '  %s\n' $LEAK
    printf 'Fix by adding it to .gitignore, or, if it is genuinely committable,\n'
    printf 'to .forge/commit-allow (one exact path per line).\n'
  } > .forge/COMMIT-BLOCKED 2>/dev/null
  [ -d .forge ] && printf '%s | commit | REFUSED, secret-looking path in tree\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .forge/RUNLOG.md 2>/dev/null
  {
    echo "forge commit: REFUSED. A secret-looking path is in the tree:"
    printf '  %s\n' $LEAK
    echo "Nothing was staged or committed. See .forge/COMMIT-BLOCKED."
  } >&2
  exit 0
fi
rm -f .forge/COMMIT-BLOCKED 2>/dev/null

git add -A >/dev/null 2>&1 || exit 0

if git commit -q -m "$MSG" >/dev/null 2>&1; then
  date +%s > "$STAMP" 2>/dev/null
fi
exit 0
