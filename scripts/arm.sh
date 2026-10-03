#!/usr/bin/env bash
# Freeze the approved contract. Run by the lead on greenlight approval, and
# after an amendment.
#
#   arm.sh                    commit rubric, plan, checks, holdout; write ARMED
#   arm.sh --amend "<why>"    commit an amended rubric and move ARMED to it
#
# ARMED carries the sha of the commit that holds the approved rubric. Every
# check runs from that commit, so a command edited after approval is ignored
# rather than trusted. Arming without git is refused: a contract nobody can
# pin is a contract anybody can rewrite.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "forge arm: REFUSED. git is not usable here ($(git --version 2>&1 | head -1))." >&2
  echo "Fix git (on macOS: sudo xcodebuild -license accept), then arm again." >&2
  exit 1
fi
[ -f .forge/DOD.md ] || { echo "forge arm: no .forge/DOD.md to arm" >&2; exit 1; }

MODE=arm; WHY=""
[ "${1:-}" = "--amend" ] && { MODE=amend; WHY=${2:-}; }
[ "$MODE" = amend ] && [ -z "$WHY" ] && { echo "forge arm: --amend needs a reason" >&2; exit 1; }

for p in .forge/DOD.md .forge/PLAN.md .forge/PREFLIGHT.md .forge/checks .forge/holdout .forge/AMENDMENTS.md; do
  [ -e "$p" ] && git add -f "$p"
done
git commit -q -m "forge: ${MODE} rubric${WHY:+, $WHY}" >/dev/null 2>&1
SHA=$(git rev-parse HEAD)

CAP=$(grep -m1 '^fable-cap ' .forge/ARMED 2>/dev/null)
{
  printf 'armed %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'sha %s\n' "$SHA"
  printf '%s\n' "${CAP:-fable-cap 3}"
} > .forge/ARMED
git add -f .forge/ARMED && git commit -q -m "forge: ${MODE}ed at ${SHA:0:8}" >/dev/null 2>&1
printf '%s | lead | %s | rubric pinned at %s%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$MODE" "${SHA:0:8}" "${WHY:+, $WHY}" >> .forge/RUNLOG.md
echo "forge: ${MODE}ed, rubric pinned at ${SHA:0:8}"
