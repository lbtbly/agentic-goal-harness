#!/usr/bin/env bash
# PreCompact. Save state before summarization eats the details.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
TS=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p ".forge/snapshots/$TS"
for f in BRIEF.md DESIGN.md PLAN.md DOD.md RESUME.md; do
  [ -f ".forge/$f" ] && cp ".forge/$f" ".forge/snapshots/$TS/"
done
exit 0
