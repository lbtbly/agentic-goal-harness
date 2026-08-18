#!/usr/bin/env bash
# SubagentStop journal. Append-only black box.
HERE=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
INPUT=$(cat)
AGENT=$(printf '%s' "$INPUT" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("agent_type") or d.get("agent_id") or "agent")' 2>/dev/null)
printf '%s | %s | stopped\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${AGENT:-agent}" >> .forge/RUNLOG.md
command -v node >/dev/null 2>&1 && node "$HERE/progress.mjs" >/dev/null 2>&1
# Throttled safety commit. A subagent finishing is the most frequent natural
# boundary in a run; run one had 1126 of them, so this must never commit per
# stop. commit.sh holds the window.
LEFT=$(grep -c '^- \[ \]' .forge/DOD.md 2>/dev/null || echo 0)
DONE=$(grep -c '^- \[x\]' .forge/DOD.md 2>/dev/null || echo 0)
case "$LEFT$DONE" in *[!0-9]*) LEFT=0; DONE=0 ;; esac
if [ $(( DONE + LEFT )) -gt 0 ]; then
  MSG="forge: checkpoint, $DONE of $(( DONE + LEFT )) lines"
else
  MSG="forge: checkpoint"
fi
"$HERE/commit.sh" "$MSG" >/dev/null 2>&1
exit 0
