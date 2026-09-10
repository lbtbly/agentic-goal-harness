#!/usr/bin/env bash
# SubagentStop journal. Append-only black box.
HERE=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
INPUT=$(cat)
AGENT=$(printf '%s' "$INPUT" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("agent_type") or d.get("agent_id") or "agent")' 2>/dev/null)
AGENT=${AGENT:-agent}

# SubagentStop IS NOT THE DISPATCH BOUNDARY, and the whole cost of this hook
# turned on believing that it was. The vitrine build logged 9,324 stops against
# 185 real subagent transcripts: fifty fires per dispatch. 9,081 of those lines
# carry an opaque agent hash rather than a seat name, and only 196 name a seat.
#
# So a seat name is the boundary. SEAT is set only when this stop belongs to a
# forge dispatch, and the two expensive things below run only then. At the
# measured 2,692 ms median for a full check, gating it here is about seven
# hours of blocking hook time per M or L run.
case "$AGENT" in
  router|scout|designer|architect|builder|verifier|finisher|design-critic) SEAT=1 ;;
  *) SEAT= ;;
esac

# The log records stops and nothing else: no starts, no durations, no phase.
# "Does the harness spend longer verifying than building" then costs a forensic
# reconstruction over three and a half thousand events, which is a question a
# run should be able to answer at a glance. The elapsed time since the previous
# stop turns the stream into a measurement.
NOW=$(date +%s)
LASTF=.forge/.runlog-last
PREV=$(cat "$LASTF" 2>/dev/null)
case "$PREV" in ''|*[!0-9]*) PREV=$NOW ;; esac
ELAPSED=$(( NOW - PREV ))
[ "$ELAPSED" -lt 0 ] && ELAPSED=0
printf '%s\n' "$NOW" > "$LASTF" 2>/dev/null

# One writer, one atomic append. Run two's RUNLOG carried 45 interleaved lines
# with verdict prose spliced mid-record ("C3 is unch", "The worktr"), because
# concurrent stops each appended separately. Build the line, write it once.
# printf into a variable and command substitution strips the trailing newline,
# so the write must put it back or every record runs into the next one.
LINE=$(printf '%s | %s | stopped | %ss%s' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$AGENT" "$ELAPSED" "${SEAT:+ | dispatch}")
printf '%s\n' "$LINE" >> .forge/RUNLOG.md

# The ten-minute floor from rule 5 lives here, and it must not move behind the
# seat gate: a builder dispatch runs for hours, and the stops that fire inside
# it are exactly the unnamed ones. commit.sh exits on a clean tree or inside
# its window after one `git status` and a stamp read, so paying it on every
# fire is cheap and skipping it would cost a crashed run its afternoon.
num() { case "$1" in ''|*[!0-9]*) echo 0 ;; *) echo "$1" ;; esac; }
checkpoint() {
  LEFT=$(num "$(grep -c '^- \[ \]' .forge/DOD.md 2>/dev/null || true)")
  DONE=$(num "$(grep -c '^- \[x\]' .forge/DOD.md 2>/dev/null || true)")
  if [ $(( DONE + LEFT )) -gt 0 ]; then
    MSG="forge: checkpoint, $DONE of $(( DONE + LEFT )) lines"
  else
    MSG="forge: checkpoint"
  fi
  [ -n "$1" ] && MSG="$MSG, $1"
  "$HERE/commit.sh" "$MSG" >/dev/null 2>&1
}

if [ -z "$SEAT" ]; then
  checkpoint
  exit 0
fi

# The per-dispatch gate. checks.sh throttles itself on PostToolUse so a builder
# mid-refactor is not pulled off every edit; here it runs unthrottled, so a
# slice can never END dirty without the log saying so. The bar did not move: it
# is enforced once per dispatch instead of once per keystroke.
#
# A red result does NOT block the checkpoint. Rule 5 says work that is not
# committed does not exist, and a builder whose typecheck is red mid-slice is
# exactly the one who must not lose an hour to a crash. So the commit happens
# and carries the word, and the log carries it too.
CHECKS=ok
FORGE_CHECKS_FULL=1 "$HERE/checks.sh" >/dev/null 2>&1 || CHECKS=red
[ "$CHECKS" = red ] && printf '%s | checks | red\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .forge/RUNLOG.md

command -v node >/dev/null 2>&1 && node "$HERE/progress.mjs" >/dev/null 2>&1

[ "$CHECKS" = red ] && checkpoint "checks red" || checkpoint
exit 0
