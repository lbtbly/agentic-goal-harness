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

# grep -c PRINTS the count and EXITS 1 when nothing matches, so a `|| echo N`
# fallback appends a second line and the arithmetic below dies on "0\n0". Keep
# the count, drop the status, then insist on a number.
num() { case "$1" in ''|*[!0-9]*) echo 0 ;; *) echo "$1" ;; esac; }
LEFT=$(num "$(grep -c '^- \[ \]' .forge/DOD.md 2>/dev/null || true)")
if [ "$LEFT" -eq 0 ]; then
  # Nothing unchecked. The run is done here, so retire any park record rather
  # than leaving it to greet the next session with numbers that are now false.
  rm -f .forge/PARKED
  exit 0
fi

# Read the payload. Bounded, because a gate that blocks on an idle pipe fails
# exactly the way the livelock did: silently, and for the whole turn.
INPUT=""
[ -t 0 ] || IFS= read -r -d '' -t 2 INPUT 2>/dev/null || true

# Three outcomes, and they must stay distinct: the flag is set, the flag is
# explicitly unset, or the payload could not be read at all. The first version
# of this fix collapsed the third into the second, which reinstates the very
# livelock it was written to end: on a machine whose python3 is missing or
# broken (stock macOS without the Xcode command line tools ships exactly such a
# stub) every stop reads as "flag not set" and blocks forever, and the
# condition never clears because it is a property of the machine.
#
# The safe default is inverted from the obvious one. Yielding wrongly costs one
# missed reminder. Blocking wrongly cannot be escaped from inside the run.
ACTIVE=""
if command -v python3 >/dev/null 2>&1; then
  ACTIVE=$(printf '%s' "$INPUT" | python3 -c \
    'import json,sys;print("1" if json.load(sys.stdin).get("stop_hook_active") else "0")' 2>/dev/null)
fi
case "$ACTIVE" in
  0|1) ;;                                  # the interpreter answered, trust it
  *) if [ -z "$INPUT" ]; then
       ACTIVE=1                            # nothing to read at all: yield
     else
       case "$INPUT" in                    # no interpreter, read the raw text
         *stop_hook_active*[Tt]rue*) ACTIVE=1 ;;
         *) ACTIVE=0 ;;
       esac
     fi ;;
esac

if [ "$ACTIVE" = 1 ]; then
  # The reminder already landed this turn and the run still wants to stop.
  # Record the park so the next session opens on it, and commit so nothing
  # rests only on disk.
  DONE=$(num "$(grep -c '^- \[x\]' .forge/DOD.md 2>/dev/null || true)")
  {
    printf 'parked %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '%s of %s rubric line(s) checked, %s unchecked\n' \
      "${DONE:-0}" "$(( ${DONE:-0} + LEFT ))" "$LEFT"
    printf 'A park is not a PASS. The gate stays armed.\n'
  } > .forge/PARKED
  "$HERE/commit.sh" --now "forge: parked, ${DONE:-0} of $(( ${DONE:-0} + LEFT )) lines" >/dev/null 2>&1
  exit 0
fi

# Still blocking means the run is working, so the park record is stale.
rm -f .forge/PARKED
{
  echo "forge gate: $LEFT rubric line(s) unchecked. Not done. Next unchecked:"
  grep '^- \[ \]' .forge/DOD.md | head -5
  echo "Continue the run: build, verify, record evidence. Never soften a line."
  echo "Nothing left to do? Stop again and the gate yields, recording the park."
} >&2
exit 2
