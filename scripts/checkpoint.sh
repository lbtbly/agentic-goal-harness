#!/usr/bin/env bash
# SessionEnd and StopFailure (rate_limit, overloaded). Stamp the resume pointer
# the moment a session ends or a limit kills a turn.
HERE=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
INPUT=$(cat)
WHY=$(printf '%s' "$INPUT" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("session_end_reason") or d.get("error_type") or d.get("hook_event_name") or "session_end")' 2>/dev/null)
[ -f .forge/RESUME.md ] || printf '# Resume\n\nlast phase: unknown\ncurrent slice: unknown\nnext action: check RUNLOG and PLAN\n' > .forge/RESUME.md
printf '\ncheckpoint: %s (%s)\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${WHY:-session_end}" >> .forge/RESUME.md
command -v node >/dev/null 2>&1 && node "$HERE/progress.mjs" >/dev/null 2>&1
# Unthrottled. This is the last thing that runs before a session dies, whether
# it ended cleanly or hit a rate limit, so the window never applies here.
"$HERE/commit.sh" --now "forge: ${WHY:-session_end}" >/dev/null 2>&1
exit 0
