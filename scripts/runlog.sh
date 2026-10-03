#!/usr/bin/env bash
# SubagentStop. One line per seat dispatch, plus the commit floor.
#
# SubagentStop is not the dispatch boundary: v1 saw about fifty fires per
# dispatch, nearly all unnamed. Only a named seat earns a RUNLOG line. Every
# fire still pays the throttled commit, because rule 5's ten-minute floor
# lives in the stops that fire inside a long dispatch. Checks and the board
# render left this hook: the gate owns checks, SessionEnd owns the board.
HERE=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
INPUT=$(cat)
AGENT=""
[[ $INPUT =~ \"agent_type\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]] && AGENT=${BASH_REMATCH[1]}

case "$AGENT" in
  scout|designer|design-critic|architect|builder|verifier|oracle)
    NOW=$(date +%s)
    PREV=$(cat .forge/.runlog-last 2>/dev/null)
    case "$PREV" in ''|*[!0-9]*) PREV=$NOW ;; esac
    printf '%s\n' "$NOW" > .forge/.runlog-last 2>/dev/null
    # One atomic append per record, so concurrent stops never splice lines.
    LINE=$(printf '%s | %s | stopped | %ss' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$AGENT" "$(( NOW - PREV ))")
    printf '%s\n' "$LINE" >> .forge/RUNLOG.md
    ;;
esac

"$HERE/commit.sh" "forge: checkpoint${AGENT:+, $AGENT}" >/dev/null 2>&1
exit 0
