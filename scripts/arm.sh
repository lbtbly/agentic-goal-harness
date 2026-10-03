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

# Three states. Git that cannot run is the machine. A folder that is not a
# repo yet is a new project, which is most of them: start the repo here.
if ! git --version >/dev/null 2>&1; then
  echo "forge arm: REFUSED. git cannot run here: $(git --version 2>&1 | head -1)" >&2
  echo "On macOS this is usually the Xcode license: sudo xcodebuild -license accept" >&2
  exit 1
fi
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  git init -q . || { echo "forge arm: REFUSED. git init failed here." >&2; exit 1; }
  [ -f .gitignore ] || printf '%s\n' node_modules/ /.next/ /dist/ /build/ /coverage/ /.vercel/ /.expo/ .DS_Store '*.log' > .gitignore
  echo "forge arm: started a git repository for this project"
fi
[ -f .forge/DOD.md ] || { echo "forge arm: no .forge/DOD.md to arm" >&2; exit 1; }

# Local rules the product's own files never see, written once per clone:
# secrets and the build marker never enter a commit, and .forge merges keep
# the main tree's copy so parallel worktrees cannot conflict on the ledgers.
GD=$(git rev-parse --git-common-dir)
mkdir -p "$GD/info"
for p in '.env' '.env.*' '!.env.example' '.forge/BUILDING' '.forge/.runlog-last' '.forge/.attempts.lock'; do
  grep -qxF "$p" "$GD/info/exclude" 2>/dev/null || printf '%s\n' "$p" >> "$GD/info/exclude"
done
grep -qxF '.forge/** merge=ours' "$GD/info/attributes" 2>/dev/null || printf '%s\n' '.forge/** merge=ours' >> "$GD/info/attributes"
git config merge.ours.driver true

MODE=arm; WHY=""
[ "${1:-}" = "--amend" ] && { MODE=amend; WHY=${2:-}; }
[ "$MODE" = amend ] && [ -z "$WHY" ] && { echo "forge arm: --amend needs a reason" >&2; exit 1; }

for p in .forge/DOD.md .forge/PLAN.md .forge/PREFLIGHT.md .forge/checks .forge/holdout .forge/overrides .forge/AMENDMENTS.md .gitignore; do
  [ -e "$p" ] && git add -f "$p"
done
# --no-verify: a product's commit hooks (husky, commitlint, lint-staged) judge
# product commits, and a forge commit message is not one. A hook that rejects
# this commit must not leave ARMED pointing at a commit without the rubric.
ERR=$(git commit -q --no-verify -m "forge: ${MODE} rubric${WHY:+, $WHY}" 2>&1)
SHA=$(git rev-parse HEAD 2>/dev/null)
if [ -z "$SHA" ] || ! git cat-file -e "$SHA:.forge/DOD.md" 2>/dev/null; then
  echo "forge arm: REFUSED. The rubric is not in a commit: ${ERR:-no commit was made}" >&2
  exit 1
fi

CAP=$(grep -m1 '^fable-cap ' .forge/ARMED 2>/dev/null)
FIRST=$(grep -m1 '^first ' .forge/ARMED 2>/dev/null)
{
  printf 'armed %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'sha %s\n' "$SHA"
  printf '%s\n' "${FIRST:-first $SHA}"
  printf '%s\n' "${CAP:-fable-cap 3}"
} > .forge/ARMED
git add -f .forge/ARMED && git commit -q --no-verify -m "forge: ${MODE}ed at ${SHA:0:8}" >/dev/null 2>&1
printf '%s | lead | %s | rubric pinned at %s%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$MODE" "${SHA:0:8}" "${WHY:+, $WHY}" >> .forge/RUNLOG.md
echo "forge: ${MODE}ed, rubric pinned at ${SHA:0:8}"
