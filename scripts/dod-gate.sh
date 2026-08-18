#!/usr/bin/env bash
# Stop gate. Blocks a turn from ending while armed rubric lines sit unchecked.
#
# It fires ONCE per stop attempt. The platform sets stop_hook_active on the
# re-entry this hook itself causes; a gate that ignores that flag re-blocks its
# own continuation forever. Run one did exactly that: 468 blocks, 40M cache
# tokens spent on the word "Holding.", and a forced platform override that read
# to the operator like a crash. A bar you cannot step away from is a livelock,
# not a bar.
#
# So: remind once, then let the run rest and write down where it stopped. The
# bar itself does not move. ARMED stays, the rubric is untouched, a park is
# never a PASS.
HERE=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -f .forge/ARMED ] || exit 0
[ -f .forge/DOD.md ] || exit 0

LEFT=$(grep -c '^- \[ \]' .forge/DOD.md 2>/dev/null || true)
[ "${LEFT:-0}" -eq 0 ] && exit 0

# Read the payload. Bounded, because a gate that blocks on an idle pipe fails
# exactly the way the livelock did: silently, and for the whole turn.
INPUT=""
[ -t 0 ] || IFS= read -r -d '' -t 2 INPUT 2>/dev/null || true
ACTIVE=$(printf '%s' "$INPUT" | python3 -c \
  'import json,sys;print("1" if json.load(sys.stdin).get("stop_hook_active") else "")' 2>/dev/null)

if [ -n "$ACTIVE" ]; then
  # The reminder already landed this turn and the run still wants to stop.
  # Record the park so the next session opens on it, and commit so nothing
  # rests only on disk.
  DONE=$(grep -c '^- \[x\]' .forge/DOD.md 2>/dev/null || echo 0)
  {
    printf 'parked %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '%s of %s rubric line(s) checked, %s unchecked\n' \
      "${DONE:-0}" "$(( ${DONE:-0} + LEFT ))" "$LEFT"
    printf 'A park is not a PASS. The gate stays armed.\n'
  } > .forge/PARKED
  "$HERE/commit.sh" --now "forge: parked, ${DONE:-0} of $(( ${DONE:-0} + LEFT )) lines" >/dev/null 2>&1
  exit 0
fi

{
  echo "forge gate: $LEFT rubric line(s) unchecked. Not done. Next unchecked:"
  grep '^- \[ \]' .forge/DOD.md | head -5
  echo "Continue the run: build, verify, record evidence. Never soften a line."
  echo "Nothing left to do? Stop again and the gate yields, recording the park."
} >&2
exit 2
