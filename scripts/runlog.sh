#!/usr/bin/env bash
# SubagentStop journal. Append-only black box.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
INPUT=$(cat)
AGENT=$(printf '%s' "$INPUT" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("agent_type") or d.get("agent_id") or "agent")' 2>/dev/null)
printf '%s | %s | stopped\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${AGENT:-agent}" >> .forge/RUNLOG.md
command -v node >/dev/null 2>&1 && node "$(dirname "$0")/progress.mjs" >/dev/null 2>&1
exit 0
