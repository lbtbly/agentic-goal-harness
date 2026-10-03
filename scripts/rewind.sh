#!/usr/bin/env bash
# Rewind one slice: put the product back to the slice's pre-slice commit and
# keep the run's own record.
#
#   rewind.sh <slice>
#
# `git reset --hard` would also roll back .forge/: the attempt ledger, the
# defects, the evidence, the RUNLOG lines that count the Fable cap, and an
# amendment made since. The run would forget what it learned from the failure
# it is rewinding. So only product paths move; .forge/ stays as it is, and the
# rewind itself is a commit.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
SLICE=${1:-}
[ -z "$SLICE" ] && { echo "usage: rewind.sh <slice>" >&2; exit 2; }
HERE=$(cd "$(dirname "$0")" 2>/dev/null && pwd)

BASE=$(node -e '
  try { const r = JSON.parse(require("fs").readFileSync(".forge/ATTEMPTS.json", "utf8"))[process.argv[1]] || {}; process.stdout.write(r.base || "") } catch {}
' "$SLICE")
[ -z "$BASE" ] && { echo "forge rewind: no base commit recorded for slice $SLICE" >&2; exit 1; }
git cat-file -e "$BASE^{commit}" 2>/dev/null || { echo "forge rewind: base $BASE is not a commit here" >&2; exit 1; }

# The slice's untracked work is committed first, so it shows up as added and
# goes; anything commit.sh holds back (a secret) and every ignored file stays.
# Then tracked product files go back to the base and the slice's additions go.
# No git clean: it would also take files the operator left untracked.
"$HERE/commit.sh" --now "forge: before rewinding slice $SLICE" >/dev/null 2>&1
git checkout "$BASE" -- . ':(exclude).forge' 2>/dev/null
git diff --no-renames --name-only --diff-filter=A "$BASE" HEAD -- . ':(exclude).forge' | while IFS= read -r f; do git rm -q -f -- "$f" 2>/dev/null; done

node "$HERE/attempt.mjs" reset "$SLICE" >/dev/null
printf '%s | lead | rewind | slice %s to %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SLICE" "${BASE:0:8}" >> .forge/RUNLOG.md
"$HERE/commit.sh" --now "forge: rewind slice $SLICE to ${BASE:0:8}" >/dev/null 2>&1
echo "forge: slice $SLICE rewound to ${BASE:0:8}; .forge kept"
