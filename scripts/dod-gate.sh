#!/usr/bin/env bash
# Stop gate. Blocks a turn from ending while armed rubric lines sit unchecked.
# The platform overrides after repeated consecutive blocks; that is the valve.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -f .forge/ARMED ] || exit 0
[ -f .forge/DOD.md ] || exit 0
LEFT=$(grep -c '^- \[ \]' .forge/DOD.md 2>/dev/null || echo 0)
[ "$LEFT" -eq 0 ] && exit 0
{
  echo "forge gate: $LEFT rubric line(s) unchecked. Not done. Next unchecked:"
  grep '^- \[ \]' .forge/DOD.md | head -5
  echo "Continue the run: build, verify, record evidence. Never soften a line."
} >&2
exit 2
