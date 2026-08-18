#!/usr/bin/env bash
# SessionStart. Stdout lands in context: load state so no session starts cold.
HERE=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
echo "=== FORGE STATE (auto-loaded) ==="
[ -f .forge/RESUME.md ] && { echo "--- RESUME ---"; cat .forge/RESUME.md; }
if [ -f .forge/DOD.md ]; then
  LEFT=$(grep -c '^- \[ \]' .forge/DOD.md 2>/dev/null || true)
  echo "--- RUBRIC: ${LEFT:-0} line(s) unchecked ---"
  grep '^- \[ \]' .forge/DOD.md | head -20
fi
[ -f .forge/RUNLOG.md ] && { echo "--- LAST RUNLOG ---"; tail -3 .forge/RUNLOG.md; }
# A parked run stopped on purpose. Say so before anything reads the rubric and
# concludes the run simply died.
[ -f .forge/PARKED ] && { echo "--- PARKED ---"; cat .forge/PARKED; }
# What the operator still owes. Run one found this at slice 1; it belongs on
# every session start until it is empty.
if [ -f .forge/PREFLIGHT.md ] && [ -x "$HERE/preflight.sh" ]; then
  echo "--- PRE-FLIGHT ---"
  "$HERE/preflight.sh" 2>/dev/null | tail -n +2
fi
# Arming reminder. ARMED marks approval, not arming: /goal is session-scoped
# and dies with the session, so an armed run resumed fresh has no condition.
if [ -f .forge/PLAN.md ]; then
  GOAL=$(grep -m1 -E '^[[:space:]]*/goal ' .forge/PLAN.md 2>/dev/null | sed 's/^[[:space:]]*//')
  if [ -f .forge/ARMED ]; then
    echo "Gate active. Continue from the next action above. Do not re-open the greenlight."
    [ -n "$GOAL" ] && echo "If this is a fresh session, paste: $GOAL"
  else
    echo "Awaiting greenlight. Nothing armed yet."
    [ -n "$GOAL" ] && echo "On approval, arm with: $GOAL"
  fi
fi
exit 0
