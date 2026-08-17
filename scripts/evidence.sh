#!/usr/bin/env bash
# Usage: scripts/evidence.sh "DOD line ref" "evidence: command output, URL, or screenshot path"
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
printf '%s | %s | %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >> .forge/EVIDENCE.md
command -v node >/dev/null 2>&1 && node "$(dirname "$0")/progress.mjs" >/dev/null 2>&1
exit 0
