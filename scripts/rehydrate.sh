#!/usr/bin/env bash
# SessionStart. Stdout lands in context: load state so no session starts cold.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
echo "=== FORGE STATE (auto-loaded) ==="
[ -f .forge/RESUME.md ] && { echo "--- RESUME ---"; cat .forge/RESUME.md; }
if [ -f .forge/DOD.md ]; then
  LEFT=$(grep -c '^- \[ \]' .forge/DOD.md 2>/dev/null || echo 0)
  echo "--- RUBRIC: $LEFT line(s) unchecked ---"
  grep '^- \[ \]' .forge/DOD.md | head -20
fi
[ -f .forge/RUNLOG.md ] && { echo "--- LAST RUNLOG ---"; tail -3 .forge/RUNLOG.md; }
[ -f .forge/ARMED ] && echo "Goal is ARMED. Continue from the next action above. Do not re-open the greenlight."
exit 0
