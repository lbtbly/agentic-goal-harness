#!/usr/bin/env bash
# PostToolUse on edits. Fast feedback only; exit 2 shows stderr to Claude.
#
# A manifest exists before its dependencies do, and a half-installed tree names
# scripts whose binaries are not there yet. That window produces "command not
# found", which is a setup state and not a defect, and blocking on it stalls the
# very install that would clear it. So: a check that RAN and found problems
# blocks. A check that could not run says so and stands down. The bar does not
# move, it just waits for its tools.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -f package.json ] || exit 0
PM=npm; [ -f pnpm-lock.yaml ] && PM=pnpm
has() { python3 -c "import json;print('$1' in json.load(open('package.json')).get('scripts',{}))" 2>/dev/null | grep -q True; }

run() {
  has "$1" || return 0
  OUT=$($PM run -s "$1" 2>&1) && return 0
  RC=$?
  # Ask the PROCESS, not the prose. 127 is the shell's "binary not found",
  # which is what a half-installed tree produces; a check that ran and failed
  # exits 1. The message cannot carry this distinction: "Cannot find module" is
  # the literal wording of TS2307, the most common real TypeScript error there
  # is, and it is exactly what a builder importing a not-yet-created file
  # produces. Reading that as "tooling missing" turns the gate off at the
  # moment it matters most.
  if [ "$RC" -eq 127 ] || [ ! -d node_modules ]; then
    echo "checks: $1 could not run, its tooling is not installed yet" >&2
    return 0
  fi
  echo "$1 failed:" >&2
  printf '%s\n' "$OUT" | tail -20 >&2
  return 2
}

run typecheck || exit 2
run lint || exit 2
exit 0
