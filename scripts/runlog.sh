#!/usr/bin/env bash
# SubagentStop journal. Append-only black box.
HERE=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
INPUT=$(cat)
AGENT=$(printf '%s' "$INPUT" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("agent_type") or d.get("agent_id") or "agent")' 2>/dev/null)
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
printf '%s | %s | stopped | %ss\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${AGENT:-agent}" "$ELAPSED" >> .forge/RUNLOG.md

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
# Throttled safety commit. A subagent finishing is the most frequent natural
# boundary in a run; run one had 1126 of them, so this must never commit per
# stop. commit.sh holds the window.
num() { case "$1" in ''|*[!0-9]*) echo 0 ;; *) echo "$1" ;; esac; }
LEFT=$(num "$(grep -c '^- \[ \]' .forge/DOD.md 2>/dev/null || true)")
DONE=$(num "$(grep -c '^- \[x\]' .forge/DOD.md 2>/dev/null || true)")
if [ $(( DONE + LEFT )) -gt 0 ]; then
  MSG="forge: checkpoint, $DONE of $(( DONE + LEFT )) lines"
else
  MSG="forge: checkpoint"
fi
[ "$CHECKS" = red ] && MSG="$MSG, checks red"
"$HERE/commit.sh" "$MSG" >/dev/null 2>&1
exit 0
