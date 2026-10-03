#!/usr/bin/env bash
# Usage: scripts/evidence.sh "<rubric id>" "<evidence: command output, URL, or file path>"
#
# One line per entry, written here and nowhere else. When the evidence names a
# file that exists outside .forge/, a copy is filed under .forge/shots/evidence/
# at record time: test runners wipe their own output directories, and a
# capture deleted mid-run was once the only proof a line had passed.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
NOTE=$2
for P in $2; do
  case "$P" in .forge/*|/*|*..*) continue ;; esac
  if [ -f "$P" ]; then
    mkdir -p .forge/shots/evidence
    DST=".forge/shots/evidence/$(date -u +%Y%m%dT%H%M%S)-$(basename "$P")"
    cp "$P" "$DST" 2>/dev/null && NOTE="$NOTE (kept: $DST)"
  fi
done
printf '%s | %s | %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$(printf '%s' "$NOTE" | tr '\n' ' ' | cut -c1-300)" >> .forge/EVIDENCE.md
exit 0
