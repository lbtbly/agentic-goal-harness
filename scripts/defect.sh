#!/usr/bin/env bash
# Usage: scripts/defect.sh "<rubric id(s)>" "<severity>" "<one line: what is wrong>"
#
# The counterpart to evidence.sh. There is no clear command, and there must
# not be one: a defect is open while its line is unchecked, and passing the
# line is the only way it closes.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
printf '%s | %s | %s | %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "$(printf '%s' "$3" | tr '\n' ' ' | cut -c1-300)" >> .forge/DEFECTS.md
exit 0
