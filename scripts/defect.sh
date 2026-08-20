#!/usr/bin/env bash
# Usage: scripts/defect.sh "DOD line ref(s)" "severity" "one line: what is wrong"
#
# The counterpart to evidence.sh. A rubric line that failed verification four
# times used to be byte-identical on the board to a line nobody had attempted:
# DOD.md carries a checkbox and nothing else, RUNLOG.md records no failures at
# all, and the rulings sat unread inside VERDICT-*.md. So a red run and a green
# run drew the same.
#
# There is no clear command, and there must not be one. A defect is open while
# its rubric line is unchecked and no later PASS names the same id. Passing the
# line is the only legitimate way it closes, which is the same rule the Stop
# gate already enforces.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
printf '%s | %s | %s | %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "$3" >> .forge/DEFECTS.md
command -v node >/dev/null 2>&1 && node "$(dirname "$0")/progress.mjs" >/dev/null 2>&1
exit 0
