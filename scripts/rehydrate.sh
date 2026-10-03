#!/usr/bin/env bash
# SessionStart. Stdout lands in context: load state so no session starts cold.
# Fires on startup, resume, clear and compact; the source decides two things.
HERE=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
INPUT=""
[ -t 0 ] || IFS= read -r -d '' -t 2 INPUT 2>/dev/null || true
SRC=startup
[[ $INPUT =~ \"source\"[[:space:]]*:[[:space:]]*\"([a-z]+)\" ]] && SRC=${BASH_REMATCH[1]}

echo "=== FORGE STATE (auto-loaded, $SRC) ==="
[ -f .forge/RESUME.md ] && { echo "--- RESUME ---"; cat .forge/RESUME.md; }
if [ -f .forge/DOD.md ]; then
  LEFT=$(grep -c '^- \[ \]' .forge/DOD.md 2>/dev/null || true)
  echo "--- RUBRIC: ${LEFT:-0} line(s) unchecked ---"
  grep '^- \[ \]' .forge/DOD.md | head -12
fi
[ -f .forge/RUNLOG.md ] && { echo "--- LAST RUNLOG ---"; tail -3 .forge/RUNLOG.md; }
[ -f .forge/PARKED ] && { echo "--- PARKED ---"; cat .forge/PARKED; }
[ -f .forge/COMMIT-BLOCKED ] && { echo "--- COMMITS BLOCKED ---"; cat .forge/COMMIT-BLOCKED; }
[ -f .forge/LEAK-WARNING ] && { echo "--- SECRETS HELD BACK ---"; cat .forge/LEAK-WARNING; }

# A workflow dies with the session that launched it. On a fresh start or a
# resume, a BUILDING marker can only be stale; on compact or clear the
# workflow is still running and the marker must stay.
if [ -f .forge/BUILDING ]; then
  case "$SRC" in
    startup|resume)
      rm -f .forge/BUILDING
      echo "--- BUILD INTERRUPTED ---"
      echo "A build workflow was running when the last session ended. Type /forge resume to relaunch it from the ledger." ;;
    *)
      echo "--- BUILD IN FLIGHT ---"
      echo "The build workflow is still running. Wait for its completion notice; do not launch a second one." ;;
  esac
fi

# The operator's pre-flight, on a fresh start only: it can reach the network,
# and a compaction is not news about the machine.
if [ "$SRC" = startup ] && [ -f .forge/PREFLIGHT.md ] && [ -x "$HERE/preflight.sh" ]; then
  echo "--- PRE-FLIGHT ---"
  "$HERE/preflight.sh" 2>/dev/null | tail -n +2
fi

# Which harness is this run executing? Silent when every file matches.
if [ -f .forge/MANIFEST.json ] && command -v node >/dev/null 2>&1 && [ -f "$HERE/manifest.mjs" ]; then
  DRIFT=$(node "$HERE/manifest.mjs" check . 2>/dev/null | grep -E '^  (stale|edited|absent|orphan) ' | head -8)
  if [ -n "$DRIFT" ]; then
    echo "--- HARNESS DRIFT ---"
    printf '%s\n' "$DRIFT"
    echo "This run executes the files above, not the harness's. Sync before trusting a result."
  fi
fi

if [ -f .forge/ARMED ]; then
  echo "Gate armed. Continue from the next action above. Never re-open the greenlight."
  [ "$SRC" = startup ] || [ "$SRC" = resume ] && [ -f .forge/PLAN.md ] && echo "Open slices remain? Type /forge resume."
elif [ -f .forge/PLAN.md ]; then
  echo "Awaiting greenlight. Nothing armed yet."
fi
exit 0
