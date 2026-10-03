#!/usr/bin/env bash
# Regression harness for the forge enforcement layer. Run it after any Claude
# Code update; drift recurs and this is the one-command answer.
# Checks: every script no-ops outside a forge project, behaves against a
# fixture .forge/, dod-gate blocks and releases correctly, the rubric runs
# from the armed commit in three states, rehydrate labels both arming states,
# the workflows parse, settings.json and every seat agree with v2's pins.
# Exits non-zero on any failure.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
S="$ROOT/scripts"
# Every script, not a frozen list of nine: commit.sh and preflight.sh shipped
# with no assertion that they stay silent and side-effect-free outside a
# forge project, which is the guarantee this loop exists to hold.
ALL="guard.sh runlog.sh dod-gate.sh checkpoint.sh rehydrate.sh snapshot.sh notify.sh evidence.sh defect.sh commit.sh preflight.sh capture.sh arm.sh craft-suite.sh attempt.mjs dod-check.mjs gate.mjs slices.mjs forge-lib.mjs"
FAILS=0
ok()   { printf 'ok   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; FAILS=$((FAILS+1)); }

# 0. Every script is executable.
for f in $ALL selftest.sh; do
  [ -x "$S/$f" ] && ok "executable: $f" || fail "not executable: $f"
done

# 1. No-op outside a forge project: exit 0, zero files created.
T1=$(mktemp -d)
for f in $ALL; do
  case "$f" in
    guard.sh|runlog.sh|checkpoint.sh) echo '{}' | CLAUDE_PROJECT_DIR="$T1" "$S/$f" >/dev/null 2>&1 ;;
    evidence.sh) CLAUDE_PROJECT_DIR="$T1" "$S/$f" "line" "proof" >/dev/null 2>&1 ;;
    commit.sh) CLAUDE_PROJECT_DIR="$T1" "$S/$f" "msg" >/dev/null 2>&1 ;;
    *) CLAUDE_PROJECT_DIR="$T1" "$S/$f" >/dev/null 2>&1 ;;
  esac
  RC=$?
  [ $RC -eq 0 ] && ok "no-op exit 0: $f" || fail "no-op exit $RC: $f"
done
LEFTOVER=$(find "$T1" -mindepth 1 | wc -l | tr -d ' ')
[ "$LEFTOVER" -eq 0 ] && ok "no files created without .forge/" || fail "$LEFTOVER file(s) created without .forge/"
rm -rf "$T1"

# 2. Behavior against a fixture .forge/.
T2=$(mktemp -d)
mkdir "$T2/.forge"
echo '{"agent_type":"builder","agent_id":"b1"}' | CLAUDE_PROJECT_DIR="$T2" "$S/runlog.sh" >/dev/null 2>&1
grep -q 'builder | stopped' "$T2/.forge/RUNLOG.md" 2>/dev/null && ok "runlog records agent_type" || fail "runlog missing agent_type entry"
echo '{"session_end_reason":"logout"}' | CLAUDE_PROJECT_DIR="$T2" "$S/checkpoint.sh" >/dev/null 2>&1
grep -q 'checkpoint: .*(logout)' "$T2/.forge/RESUME.md" 2>/dev/null && ok "checkpoint reads session_end_reason" || fail "checkpoint missed session_end_reason"
echo '{"error_type":"rate_limit"}' | CLAUDE_PROJECT_DIR="$T2" "$S/checkpoint.sh" >/dev/null 2>&1
grep -q 'checkpoint: .*(rate_limit)' "$T2/.forge/RESUME.md" 2>/dev/null && ok "checkpoint reads error_type" || fail "checkpoint missed error_type"
printf '# Brief\n' > "$T2/.forge/BRIEF.md"
CLAUDE_PROJECT_DIR="$T2" "$S/snapshot.sh" >/dev/null 2>&1
[ -n "$(find "$T2/.forge/snapshots" -name BRIEF.md 2>/dev/null)" ] && ok "snapshot copies state files" || fail "snapshot copied nothing"
CLAUDE_PROJECT_DIR="$T2" "$S/evidence.sh" "DOD line 3" "curl 200" >/dev/null 2>&1
grep -q 'curl 200' "$T2/.forge/EVIDENCE.md" 2>/dev/null && ok "evidence appends" || fail "evidence did not append"
echo '{"tool_input":{"command":"git push --force origin main"}}' | CLAUDE_PROJECT_DIR="$T2" "$S/guard.sh" >/dev/null 2>&1
[ $? -eq 2 ] && ok "guard blocks force-push to main" || fail "guard allowed force-push to main"
echo '{"tool_input":{"command":"git status"}}' | CLAUDE_PROJECT_DIR="$T2" "$S/guard.sh" >/dev/null 2>&1
[ $? -eq 0 ] && ok "guard allows benign commands" || fail "guard blocked git status"

# 3. dod-gate: blocks with unchecked lines, releases at zero (grep -c regression).
printf -- '- [ ] line one\n- [ ] line two\n' > "$T2/.forge/DOD.md"
touch "$T2/.forge/ARMED"
ERR=$(echo '{}' | CLAUDE_PROJECT_DIR="$T2" "$S/dod-gate.sh" 2>&1 >/dev/null)
RC=$?
{ [ $RC -eq 2 ] && printf '%s' "$ERR" | grep -q '2 rubric'; } && ok "dod-gate blocks with 2 unchecked" || fail "dod-gate did not block (rc=$RC)"
printf -- '- [x] line one\n- [x] line two\n' > "$T2/.forge/DOD.md"
echo '{}' | CLAUDE_PROJECT_DIR="$T2" "$S/dod-gate.sh" >/dev/null 2>&1
[ $? -eq 0 ] && ok "dod-gate releases at zero unchecked" || fail "dod-gate blocked at zero unchecked"
rm "$T2/.forge/ARMED"
echo '{}' | CLAUDE_PROJECT_DIR="$T2" "$S/dod-gate.sh" >/dev/null 2>&1
[ $? -eq 0 ] && ok "dod-gate inert without ARMED" || fail "dod-gate blocked without ARMED"

# 3b. The livelock. A gate that ignores stop_hook_active re-blocks the very
# continuation it caused, forever. Run one burned 40M cache tokens that way and
# was killed by the platform's own override. This is the regression that must
# never come back.
printf -- '- [x] one\n- [ ] two\n- [ ] three\n' > "$T2/.forge/DOD.md"
touch "$T2/.forge/ARMED"
rm -f "$T2/.forge/PARKED"
echo '{"stop_hook_active":true}' | CLAUDE_PROJECT_DIR="$T2" "$S/dod-gate.sh" >/dev/null 2>&1
RC=$?
{ [ $RC -eq 0 ] && [ -f "$T2/.forge/PARKED" ] && grep -q '1 of 3' "$T2/.forge/PARKED"; } \
  && ok "dod-gate yields on stop_hook_active and records the park" \
  || fail "dod-gate livelocks on stop_hook_active (rc=$RC)"
# 3b-ii. The park with NOTHING checked yet, which is every run before its first
# verdict and so the likeliest park of all. The fixture above carries one checked
# line, which is why this went unseen: grep -c prints 0 and exits 1 when nothing
# matches, so a `|| echo 0` fallback appended a second line and the arithmetic
# died on "0\n0 + LEFT". A population that never includes the failing case is not
# a test, which is the same rule this run's rubric now puts on every sweep.
printf -- '- [ ] one\n- [ ] two\n- [ ] three\n' > "$T2/.forge/DOD.md"
rm -f "$T2/.forge/PARKED"
ERR=$(echo '{"stop_hook_active":true}' | CLAUDE_PROJECT_DIR="$T2" "$S/dod-gate.sh" 2>&1 >/dev/null)
RC=$?
{ [ $RC -eq 0 ] && [ -f "$T2/.forge/PARKED" ] && grep -q '0 of 3' "$T2/.forge/PARKED" \
  && ! printf '%s' "$ERR" | grep -qi 'syntax error'; } \
  && ok "dod-gate parks cleanly with zero checked" \
  || fail "dod-gate park broke at zero checked (rc=$RC): $ERR"
printf -- '- [x] one\n- [ ] two\n- [ ] three\n' > "$T2/.forge/DOD.md"
rm -f "$T2/.forge/PARKED"

echo '{"stop_hook_active":false}' | CLAUDE_PROJECT_DIR="$T2" "$S/dod-gate.sh" >/dev/null 2>&1
[ $? -eq 2 ] && ok "dod-gate still blocks when the flag is false" || fail "dod-gate stopped blocking"
SEC0=$(date +%s)
CLAUDE_PROJECT_DIR="$T2" "$S/dod-gate.sh" </dev/null >/dev/null 2>&1
SEC1=$(date +%s)
[ $((SEC1 - SEC0)) -le 3 ] && ok "dod-gate does not hang without a payload" \
  || fail "dod-gate stalled $((SEC1 - SEC0))s on empty stdin"
rm -f "$T2/.forge/PARKED" "$T2/.forge/ARMED"

# 3c. commit.sh: the net under the build. Run one committed nothing for seven
# and a half hours of BUILD, so every branch of this gets a case.
T5=$(mktemp -d); mkdir -p "$T5/.forge"
( cd "$T5" && git init -q . && git config user.email t@t && git config user.name t \
  && echo a > a.txt && git add -A && git commit -q -m base ) >/dev/null 2>&1
( cd "$T5" && CLAUDE_PROJECT_DIR="$T5" "$S/commit.sh" "noop" ) >/dev/null 2>&1
N=$( cd "$T5" && git rev-list --count HEAD )
[ "$N" -eq 1 ] && ok "commit no-ops on a clean tree" || fail "commit made $N on a clean tree"
( cd "$T5" && echo b > b.txt && CLAUDE_PROJECT_DIR="$T5" "$S/commit.sh" "forge: first" ) >/dev/null 2>&1
N=$( cd "$T5" && git rev-list --count HEAD )
[ "$N" -eq 2 ] && ok "commit records a dirty tree" || fail "commit did not record (n=$N)"
( cd "$T5" && echo c > c.txt && CLAUDE_PROJECT_DIR="$T5" "$S/commit.sh" "forge: second" ) >/dev/null 2>&1
N=$( cd "$T5" && git rev-list --count HEAD )
[ "$N" -eq 2 ] && ok "commit throttles inside the window" || fail "commit ignored the throttle (n=$N)"
( cd "$T5" && CLAUDE_PROJECT_DIR="$T5" "$S/commit.sh" --now "forge: session end" ) >/dev/null 2>&1
N=$( cd "$T5" && git rev-list --count HEAD )
[ "$N" -eq 3 ] && ok "commit --now overrides the window" || fail "--now was throttled (n=$N)"
( cd "$T5" && printf 'k\n' > server.pem && FORGE_COMMIT_WINDOW=0 CLAUDE_PROJECT_DIR="$T5" "$S/commit.sh" "leak" ) >/dev/null 2>&1
N=$( cd "$T5" && git rev-list --count HEAD )
STAGED=$( cd "$T5" && git diff --cached --name-only | wc -l | tr -d ' ' )
{ [ "$N" -eq 3 ] && [ "$STAGED" -eq 0 ]; } && ok "commit refuses a secret path and unstages it" \
  || fail "commit leaked a secret path (n=$N staged=$STAGED)"
T6=$(mktemp -d)
( cd "$T6" && CLAUDE_PROJECT_DIR="$T6" "$S/commit.sh" "x" ) >/dev/null 2>&1
[ $? -eq 0 ] && ok "commit no-ops outside a git repo" || fail "commit errored outside a repo"
rm -rf "$T5" "$T6"

# 3d. preflight: reports real state for each check kind, and never gates.
T7=$(mktemp -d); mkdir -p "$T7/.forge"
{
  echo '- [ ] cmd:sh             | A shell     | impossible to miss'
  echo '- [ ] cmd:nosuchcmd77    | Missing tool| install it'
  echo '- [ ] path:here.txt      | A file here | make it'
  echo '- [ ] env:FORGE_TEST_VAR | A variable  | export it'
} > "$T7/.forge/PREFLIGHT.md"
: > "$T7/here.txt"
OUT=$(CLAUDE_PROJECT_DIR="$T7" "$S/preflight.sh" 2>&1); RC=$?
{ [ $RC -eq 0 ] && printf '%s' "$OUT" | grep -q '\[x\] A shell' \
  && printf '%s' "$OUT" | grep -q '\[ \] Missing tool' \
  && printf '%s' "$OUT" | grep -q '\[x\] A file here' \
  && printf '%s' "$OUT" | grep -q '2 of 4 outstanding'; } \
  && ok "preflight resolves cmd, path and env" || fail "preflight misreported"
OUT=$(FORGE_TEST_VAR=1 CLAUDE_PROJECT_DIR="$T7" "$S/preflight.sh" 2>&1)
printf '%s' "$OUT" | grep -q '1 of 4 outstanding' \
  && ok "preflight reads a variable from the environment" || fail "preflight missed an env var"
printf 'FORGE_TEST_VAR=x\n' > "$T7/.env.local"
OUT=$(CLAUDE_PROJECT_DIR="$T7" "$S/preflight.sh" 2>&1)
printf '%s' "$OUT" | grep -q 'set in .env.local' \
  && ok "preflight reads a variable from a dotenv file" || fail "preflight missed a dotenv var"
rm -rf "$T7"

# 3e. What the adversarial audit confirmed. Every case below FAILED before its
# fix, and each is here because the earlier fixture could not have caught it.
AUD=$(mktemp -d)
mkdir -p "$AUD/badbin"
{ echo '#!/bin/bash'
  echo 'echo "xcrun: error: invalid active developer path" >&2'
  echo 'exit 1'; } > "$AUD/badbin/python3"
chmod +x "$AUD/badbin/python3"

# THE LIVELOCK, second edition. The first fix read stop_hook_active through
# python3 and treated "could not read" as "flag is false", so a machine whose
# python3 is missing or broken blocks every stop forever. The condition never
# clears, because it is a property of the machine and not of the run.
AG="$AUD/gate"; mkdir -p "$AG/.forge" "$AG/scripts"
cp "$S/dod-gate.sh" "$AG/scripts/"
{ echo '#!/bin/bash'; echo 'exit 0'; } > "$AG/scripts/commit.sh"; chmod +x "$AG/scripts/commit.sh"
printf -- '- [ ] one\n' > "$AG/.forge/DOD.md"; touch "$AG/.forge/ARMED"
BLOCKED=0
for i in 1 2 3; do
  printf '{"stop_hook_active":true}' \
    | env PATH="$AUD/badbin:/usr/bin:/bin" CLAUDE_PROJECT_DIR="$AG" bash "$AG/scripts/dod-gate.sh" >/dev/null 2>&1
  [ $? -eq 2 ] && BLOCKED=$((BLOCKED+1))
done
{ [ "$BLOCKED" -eq 0 ] && [ -f "$AG/.forge/PARKED" ]; } \
  && ok "dod-gate yields when the payload cannot be parsed" \
  || fail "dod-gate livelocks with a broken python3 ($BLOCKED/3 blocked)"

# A park record that outlives the park tells the next session a false number.
rm -f "$AG/.forge/PARKED"; printf 'stale\n' > "$AG/.forge/PARKED"
echo '{}' | CLAUDE_PROJECT_DIR="$AG" bash "$AG/scripts/dod-gate.sh" >/dev/null 2>&1
[ -f "$AG/.forge/PARKED" ] && fail "stale PARKED survived a working turn" \
  || ok "dod-gate clears PARKED when the run has work"
printf 'stale\n' > "$AG/.forge/PARKED"; printf -- '- [x] one\n' > "$AG/.forge/DOD.md"
echo '{}' | CLAUDE_PROJECT_DIR="$AG" bash "$AG/scripts/dod-gate.sh" >/dev/null 2>&1
[ -f "$AG/.forge/PARKED" ] && fail "PARKED survived completion" \
  || ok "dod-gate retires PARKED at zero unchecked"

# The guard used to read "I cannot parse this" as "there is nothing to check",
# so one broken interpreter silently switched off all five safety rules.
printf '{"tool_input":{"command":"git push --force origin main"}}' \
  | env PATH="$AUD/badbin:/usr/bin:/bin" bash "$S/guard.sh" >/dev/null 2>&1
[ $? -eq 2 ] && ok "guard fails closed when the payload cannot be parsed" \
  || fail "guard fails OPEN without a usable python3"

# 3f. v2: the rubric runs from the armed commit, in three states. A check
# that could not run is UNKNOWN and never green; a command edited after the
# greenlight is ignored; judgment cannot overrule a command.
V2=$(mktemp -d)
dc () { local d=$1; shift; ( cd "$d" && CLAUDE_PROJECT_DIR="$d" node "$S/dod-check.mjs" "$@" 2>&1 ); }
P="$V2/unarmed"; mkdir -p "$P/.forge"
cat > "$P/.forge/DOD.md" <<'EOF'
# Definition of Done
## Function
- [ ] F1 | passes | check: true
- [ ] F2 | fails | check: false
- [ ] F3 | cannot run | check: definitely-not-a-binary-xyz
- [ ] F4 | flaky once | check: [ -f .forge/seen ] || { touch .forge/seen; exit 1; }
- [ ] C1 | hierarchy holds | judge: the dominant region is the declared LOUD element
- [ ] V0 | final verifier PASS | rule
EOF
dc "$P" --ids F1 --tick >/dev/null; RC=$?
{ [ $RC -eq 0 ] && grep -q '^- \[x\] F1' "$P/.forge/DOD.md"; } \
  && ok "a passing check ticks its line" || fail "a passing check did not tick (rc=$RC)"
perl -pi -e 's/^- \[ \] F2/- [x] F2/' "$P/.forge/DOD.md"
dc "$P" --ids F2 --tick >/dev/null; RC=$?
{ [ $RC -eq 1 ] && grep -q '^- \[ \] F2' "$P/.forge/DOD.md" && grep -q '| F2 | check |' "$P/.forge/DEFECTS.md"; } \
  && ok "a failing check exits 1, un-ticks its line and files a defect" || fail "a failing check was not ruled FAIL (rc=$RC)"
OUT=$(dc "$P" --ids F3); RC=$?
{ [ $RC -eq 2 ] && printf '%s' "$OUT" | tail -1 | grep -q '"verdict":"UNKNOWN"'; } \
  && ok "a check that cannot run is UNKNOWN, never green" || fail "could-not-run read as a ruling (rc=$RC)"
dc "$P" --ids F1,F3 >/dev/null; RC=$?
[ $RC -eq 2 ] && ok "a pass beside a could-not-run is UNKNOWN, not PASS" || fail "UNKNOWN was outvoted by a pass (rc=$RC)"
OUT=$(dc "$P" --ids F4); RC=$?
{ [ $RC -eq 0 ] && printf '%s' "$OUT" | grep -q 'flaky'; } \
  && ok "a check that fails once is re-run before it counts, and says so" || fail "a flake counted as a FAIL (rc=$RC)"
dc "$P" --judge F1 pass "looked at it" >/dev/null; RC=$?
[ $RC -eq 3 ] && ok "judgment cannot overrule a check line" || fail "a check line accepted a judge ruling (rc=$RC)"
dc "$P" --judge C1 pass "shot craft-home-1280" --tick >/dev/null; RC=$?
{ [ $RC -eq 0 ] && grep -q '^- \[x\] C1' "$P/.forge/DOD.md"; } \
  && ok "a judge ruling ticks its line with its evidence" || fail "a judge ruling did not tick (rc=$RC)"
dc "$P" --rule >/dev/null; RC=$?
{ [ $RC -ne 0 ] && grep -q '^- \[ \] V0' "$P/.forge/DOD.md"; } \
  && ok "V0 stays open while any line fails" || fail "V0 ticked over a failing line"
perl -pi -e 's/check: false/check: true/; s/check: definitely-not-a-binary-xyz/check: true/' "$P/.forge/DOD.md"
dc "$P" --rule >/dev/null; RC=$?
{ [ $RC -eq 0 ] && grep -q '^- \[x\] V0' "$P/.forge/DOD.md"; } \
  && ok "V0 ticks only when every line holds" || fail "V0 did not tick on a clean rubric (rc=$RC)"
dc "$P" --lint >/dev/null && ok "a well-formed rubric lints clean" || fail "lint rejected a valid rubric"
printf -- '- [ ] F9 broken line without fields\n' >> "$P/.forge/DOD.md"
dc "$P" --lint >/dev/null && fail "lint passed an unparsed checkbox" || ok "lint names a checkbox nobody will ever rule on"
grep -v 'V0' "$P/.forge/DOD.md" | grep -v 'F9' > "$P/.forge/D2" && mv "$P/.forge/D2" "$P/.forge/DOD.md"
dc "$P" --lint >/dev/null && fail "lint passed a rubric with no V0" || ok "lint requires the V0 line"

# Pinning and the gate need git. Without it they are refused, never skipped.
mkdir -p "$V2/nogit"
{ echo '#!/bin/bash'; echo 'echo "You have not agreed to the Xcode license agreements. Please run sudo xcodebuild -license" >&2'; echo 'exit 69'; } > "$V2/nogit/git"
chmod +x "$V2/nogit/git"
CB="$V2/blocked"; mkdir -p "$CB/.forge"
( cd "$CB" && echo x > x && env PATH="$V2/nogit:$PATH" CLAUDE_PROJECT_DIR="$CB" bash "$S/commit.sh" --now "x" ) >/dev/null 2>&1
[ -f "$CB/.forge/COMMIT-BLOCKED" ] && ok "unusable git is a loud COMMIT-BLOCKED, not silence" || fail "commit.sh hid a broken git"
( cd "$CB" && printf -- '- [ ] F1 | x | check: true\n' > .forge/DOD.md && env PATH="$V2/nogit:$PATH" CLAUDE_PROJECT_DIR="$CB" bash "$S/arm.sh" ) >/dev/null 2>&1
[ -f "$CB/.forge/ARMED" ] && fail "arm.sh armed a rubric it could not pin" || ok "arm.sh refuses to arm without a usable git"

if git --version >/dev/null 2>&1; then
  G="$V2/armed"; mkdir -p "$G/.forge/checks"
  ( cd "$G" && git init -q . && git config user.email t@t && git config user.name t ) >/dev/null 2>&1
  cat > "$G/.forge/DOD.md" <<'EOF'
- [ ] F1 | pinned | check: false
- [ ] F2 | scripted | check: bash .forge/checks/F2.sh
- [ ] V0 | final verifier PASS | rule
EOF
  printf 'exit 0\n' > "$G/.forge/checks/F2.sh"
  printf '# Plan\n## Checks\n- test: true\n## Slice 1: one\nCloses: F1, F2\n' > "$G/.forge/PLAN.md"
  ( cd "$G" && git add -A && git commit -q -m base && CLAUDE_PROJECT_DIR="$G" bash "$S/arm.sh" ) >/dev/null 2>&1
  grep -q '^sha [0-9a-f]\{7,\}' "$G/.forge/ARMED" && ok "arm.sh pins the rubric to a commit" || fail "arm.sh wrote no sha"
  perl -pi -e 's/check: false/check: true/' "$G/.forge/DOD.md"
  dc "$G" --ids F1 >/dev/null; RC=$?
  [ $RC -eq 1 ] && ok "a check rewritten after arming is ignored" || fail "the working copy overruled the armed rubric (rc=$RC)"
  printf 'exit 0 # edited\n' >> "$G/.forge/checks/F2.sh"
  dc "$G" --ids F2 >/dev/null; RC=$?
  [ $RC -eq 3 ] && ok "an edited check script refuses the run" || fail "an edited check script ran (rc=$RC)"
  ( cd "$G" && git checkout -q -- .forge/checks/F2.sh )
  OUT=$( cd "$G" && env PATH="$V2/nogit:$PATH" CLAUDE_PROJECT_DIR="$G" node "$S/dod-check.mjs" --ids F2 2>&1 ); RC=$?
  { [ $RC -eq 3 ] && printf '%s' "$OUT" | tail -1 | grep -q UNKNOWN; } \
    && ok "an armed rubric with unusable git is UNKNOWN, never green" || fail "unusable git read as a ruling (rc=$RC)"

  GT="$V2/gate"; mkdir -p "$GT/.forge"
  ( cd "$GT" && git init -q . && git config user.email t@t && git config user.name t ) >/dev/null 2>&1
  { echo 'console.error("a.ts(1,1): error TS2307: Cannot find module \"@/lib/db\".");'; echo 'process.exit(1);'; } > "$GT/fail.js"
  printf -- '- [ ] F1 | builds | check: true\n- [ ] V0 | final verifier PASS | rule\n' > "$GT/.forge/DOD.md"
  printf '# Plan\n## Checks\n- test: node fail.js\n## Slice 1: one\nCloses: F1\n' > "$GT/.forge/PLAN.md"
  ( cd "$GT" && git add -A && git commit -q -m base && CLAUDE_PROJECT_DIR="$GT" bash "$S/arm.sh" ) >/dev/null 2>&1
  gate () { ( cd "$GT" && CLAUDE_PROJECT_DIR="$GT" node "$S/gate.mjs" "$@" 2>&1 ); }
  gate 1 >/dev/null; RC=$?
  [ $RC -eq 1 ] && ok "the gate fails a real TS2307 saying Cannot find module" || fail "the gate passed a genuine failure (rc=$RC)"
  printf '# Plan\n## Checks\n- test: definitely-not-a-binary-xyz\n## Slice 1: one\nCloses: F1\n' > "$GT/.forge/PLAN.md"
  ( cd "$GT" && CLAUDE_PROJECT_DIR="$GT" bash "$S/arm.sh" --amend "binary test" ) >/dev/null 2>&1
  gate 1 >/dev/null; RC=$?
  [ $RC -eq 2 ] && ok "a missing binary is UNKNOWN at the gate, never green" || fail "a missing binary passed the gate (rc=$RC)"
  printf '# Plan\n## Checks\n- test: true\n## Slice 1: one\nCloses: F1\n' > "$GT/.forge/PLAN.md"
  ( cd "$GT" && CLAUDE_PROJECT_DIR="$GT" bash "$S/arm.sh" --amend "green" ) >/dev/null 2>&1
  ( cd "$GT" && CLAUDE_PROJECT_DIR="$GT" node "$S/attempt.mjs" base 1 "$(git rev-parse HEAD)" ) >/dev/null 2>&1
  gate 1 >/dev/null; RC=$?
  { [ $RC -eq 0 ] && grep -q '^- \[x\] F1' "$GT/.forge/DOD.md"; } \
    && ok "a green gate ticks the slice's lines" || fail "a green slice was not ruled PASS (rc=$RC)"
  OPEN=$( cd "$GT" && CLAUDE_PROJECT_DIR="$GT" node "$S/slices.mjs" --open | node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(0)).slices.length))' )
  [ "$OPEN" = 0 ] && ok "a green slice leaves the open list" || fail "slices.mjs still lists a green slice ($OPEN open)"
  ( cd "$GT" && printf '// eslint-disable-next-line\nexport const x = 1\n' > x.js && git add x.js && git commit -q -m sneak ) >/dev/null 2>&1
  OUT=$(gate 1); RC=$?
  { [ $RC -eq 1 ] && printf '%s' "$OUT" | grep -q 'suppression'; } \
    && ok "a suppression added by the slice fails the gate" || fail "a suppression slipped through (rc=$RC)"
else
  fail "git is not usable on this machine; pinning and the gate are unchecked"
fi

AT="$V2/attempt"; mkdir -p "$AT/.forge"
at () { ( cd "$AT" && CLAUDE_PROJECT_DIR="$AT" node "$S/attempt.mjs" "$@" 2>&1 ); }
at state s1 | grep -q 'rung: clear' && ok "a slice with no verdicts sits on no rung" || fail "attempt.mjs does not start clear"
at record s1 FAIL >/dev/null; at state s1 | grep -q 'rung: retry' && ok "one FAIL retries with the gate output" || fail "one FAIL escalates"
at record s1 FAIL >/dev/null; at state s1 | grep -q 'rung: raise to opus' && ok "two FAILs raise the builder to Opus, high" || fail "two FAILs do not raise"
at record s1 FAIL >/dev/null; at state s1 | grep -q 'rung: stuck' && ok "three FAILs are stuck" || fail "three FAILs are not stuck"
at state s1 | grep -q 'rung: stuck' && ok "the rung survives a fresh invocation, the compaction case" || fail "the ladder forgets"
at record s2 FAIL >/dev/null; at state s1 | grep -q '3 fail' && ok "slices count independently" || fail "fails leak between slices"
at record s1 PASS >/dev/null; at state s1 | grep -q 'rung: green' && ok "a PASS after FAILs is green" || fail "a passed slice still reads stuck"
at reset s1 | grep -q 'rung: clear' && ok "a rewind clears the counter" || fail "reset does not clear"

# A build workflow runs in the background while the lead idles: the Stop gate
# and the notifier both stand down, and only a fresh session clears the marker.
BW="$V2/building"; mkdir -p "$BW/.forge"
printf -- '- [ ] F1 | x | check: true\n' > "$BW/.forge/DOD.md"; touch "$BW/.forge/ARMED" "$BW/.forge/BUILDING"
echo '{}' | CLAUDE_PROJECT_DIR="$BW" bash "$S/dod-gate.sh" >/dev/null 2>&1
[ $? -eq 0 ] && ok "the Stop gate yields while a build workflow runs" || fail "the Stop gate pushes an idle lead mid-build"
[ -z "$(CLAUDE_PROJECT_DIR="$BW" bash "$S/notify.sh" 2>/dev/null)" ] && ok "no ping while the build runs" || fail "notify pings mid-build"
OUT=$(printf '{"source":"compact"}' | CLAUDE_PROJECT_DIR="$BW" bash "$S/rehydrate.sh" 2>/dev/null)
{ [ -f "$BW/.forge/BUILDING" ] && printf '%s' "$OUT" | grep -q 'BUILD IN FLIGHT'; } \
  && ok "a compaction keeps the build marker" || fail "a compaction cleared a live build"
OUT=$(printf '{"source":"startup"}' | CLAUDE_PROJECT_DIR="$BW" bash "$S/rehydrate.sh" 2>/dev/null)
{ [ ! -f "$BW/.forge/BUILDING" ] && printf '%s' "$OUT" | grep -q '/forge resume'; } \
  && ok "a fresh session clears a stale build marker and names /forge resume" || fail "a dead build marker survived a restart"
rm -rf "$V2"

# The defect ledger. A rubric line refused by the verifier used to be
# byte-identical here to one nobody had attempted.
ADF="$AUD/defect"; mkdir -p "$ADF/.forge"
( cd "$ADF" && CLAUDE_PROJECT_DIR="$ADF" bash "$S/defect.sh" "F19" "blocks" "rows visible to the wrong identity" >/dev/null 2>&1 )
grep -q '^[0-9-]*T[0-9:]*Z | F19 | blocks | rows visible to the wrong identity$' "$ADF/.forge/DEFECTS.md" \
  && ok "defect.sh appends a parseable ledger line" \
  || fail "defect.sh wrote nothing usable"

# RUNLOG carries one line per named seat with the elapsed seconds, so the time
# split stops being an estimate. Unnamed stops, about fifty per dispatch, get
# the throttled commit and no line.
ARL="$AUD/runlog"; mkdir -p "$ARL/.forge"
printf '{"agent_type":"builder"}' | ( cd "$ARL" && CLAUDE_PROJECT_DIR="$ARL" bash "$S/runlog.sh" >/dev/null 2>&1 )
printf '{"agent_type":"verifier"}' | ( cd "$ARL" && CLAUDE_PROJECT_DIR="$ARL" bash "$S/runlog.sh" >/dev/null 2>&1 )
grep -qE '^[0-9-]+T[0-9:]+Z \| verifier \| stopped \| [0-9]+s$' "$ARL/.forge/RUNLOG.md" \
  && ok "runlog records the seat and the elapsed time" \
  || fail "runlog still records a bare stop"
LINES=$(wc -l < "$ARL/.forge/RUNLOG.md" | tr -d ' ')
[ "$LINES" = 2 ] && ok "each seat stop appends exactly one whole line" || fail "runlog wrote $LINES lines for two stops"
printf '{"agent_id":"a1b2c3d4e5f6a7b8"}' | ( cd "$ARL" && CLAUDE_PROJECT_DIR="$ARL" bash "$S/runlog.sh" >/dev/null 2>&1 )
LINES=$(wc -l < "$ARL/.forge/RUNLOG.md" | tr -d ' ')
[ "$LINES" = 2 ] && ok "an unnamed stop writes no RUNLOG line" || fail "an unnamed stop was logged"

# v2 settings: the lead runs at high effort, two plugins whose hooks fire on
# every edit and stop stay off in forge projects, and no hook runs a typecheck
# on the edit path.
node -e '
const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
const post = JSON.stringify(d.hooks.PostToolUse || [])
const ok = d.effortLevel === "high"
  && (d.enabledPlugins || {})["impeccable@impeccable"] === false
  && (d.enabledPlugins || {})["superpowers@claude-plugins-official"] === false
  && d.subagentPromptCacheTtl
  && post.includes("commit.sh") && !JSON.stringify(d).includes("checks.sh")
process.exit(ok ? 0 : 1)' "$ROOT/.claude/settings.json" \
  && ok "settings.json carries v2's effort, plugin and hook shape" \
  || fail "settings.json drifted from v2"

# Vendored copies were never synced to begin with: four of five scripts differed
# between two real targets, commit.sh and defect.sh never arrived, and one ran a
# 601-byte dod-gate.sh against the harness's 3,947. The drift check is only
# worth having if it refuses to say clean while anything differs.
bash "$S/manifest-test.sh" >/dev/null 2>&1 \
  && ok "the drift loop converges and never reports a half-upgrade clean" \
  || fail "manifest-test.sh failed; drift can go silent"
grep -q 'manifest.mjs' "$S/rehydrate.sh" \
  && ok "a session start says which harness the run is executing" \
  || fail "a run can execute a stale vendored harness with no signal"
[ -f "$ROOT/MANIFEST.json" ] \
  && ok "the harness records its own file hashes" \
  || fail "no MANIFEST.json, so no target can be compared to anything"

# README carries counts, and counts break on every pipeline change. Before this
# was enforced it listed six skills where seven existed and told the operator to
# fill three slots that were already written. Prose discipline is what failed,
# so the fix is not more discipline.
SEATS=$(ls -1 "$ROOT/.claude/agents"/*.md 2>/dev/null | wc -l | tr -d ' ')
WFLOWS=$(ls -1 "$ROOT/.claude/workflows"/*.js 2>/dev/null | wc -l | tr -d ' ')
SKILLS=$(ls -1d "$ROOT/.claude/skills"/*/ 2>/dev/null | wc -l | tr -d ' ')
HOOKS=$(python3 -c "
import json;d=json.load(open('$ROOT/.claude/settings.json'))
print(sum(len(e.get('hooks',[])) for arr in d['hooks'].values() for e in arr))")
word () { case "$1" in 2) echo two ;; 3) echo three ;; 7) echo seven ;; 8) echo eight ;; 9) echo nine ;; *) echo "$1" ;; esac; }
grep -qi "$(word $SEATS) seats" "$ROOT/README.md" \
  && ok "README's seat count matches the filesystem ($SEATS)" \
  || fail "README does not say $(word $SEATS) seats, but $SEATS exist"
grep -qi "$(word $WFLOWS) workflows" "$ROOT/README.md" \
  && ok "README's workflow count matches the filesystem ($WFLOWS)" \
  || fail "README does not match the $WFLOWS workflows on disk"
grep -qi "$(word $HOOKS) hooks" "$ROOT/README.md" \
  && ok "README's hook count matches settings.json ($HOOKS)" \
  || fail "README does not say $(word $HOOKS) hooks, but $HOOKS are registered"
MISSING=""
for d in "$ROOT/.claude/skills"/*/; do
  n=$(basename "$d")
  grep -q "$n" "$ROOT/README.md" || MISSING="$MISSING $n"
done
[ -z "$MISSING" ] \
  && ok "README lists every skill directory ($SKILLS)" \
  || fail "README omits skill(s):$MISSING"

# The harness README once shipped verbatim inside a product, which told a
# stranger cloning a collection app that it had seven seats and a greenlight.
grep -qi "never be copied into a target project\|not the README of anything Forge" "$ROOT/README.md" \
  && ok "the README says it is not the product's README" \
  || fail "nothing stops the harness README travelling into a product"
grep -qi "harness's README into the product\|scaffold README" "$ROOT/.claude/agents/builder.md" \
  && ok "the builder is told not to ship the harness README" \
  || fail "the builder may ship the harness README again"
grep -q 'What changed in this version' "$ROOT/START_HERE.html" \
  && ok "START_HERE opens on what changed since the last version" \
  || fail "START_HERE has no changelog section"
for term in attempt.mjs capture.sh manifest.mjs cost.mjs design-critic gate.mjs dod-check.mjs oracle; do
  grep -qF "$term" "$ROOT/START_HERE.html" \
    && ok "START_HERE mentions $term" \
    || fail "START_HERE never mentions $term, so the onboarding page is behind the harness"
done
grep -qi "$(word $SEATS) seats" "$ROOT/START_HERE.html" \
  && ok "START_HERE's seat count is current ($SEATS)" \
  || fail "START_HERE does not say $(word $SEATS) seats"
{ grep -qi "$(word $SEATS) seats" "$ROOT/CLAUDE.md" && grep -qi "$(word $HOOKS) hooks" "$ROOT/CLAUDE.md"; } \
  && ok "CLAUDE.md's counts match the filesystem" \
  || fail "CLAUDE.md's seat or hook count is stale"
# Exact pins only: no Opus 5, no Haiku, nothing inherited, in seats or workflows.
grep -rnE "haiku|claude-opus-5([^-]|$)|model: *inherit|model: *'(opus|sonnet|fable)'" "$ROOT/.claude/agents" "$ROOT/.claude/workflows" >/dev/null \
  && fail "a seat or workflow names Opus 5, Haiku, an alias or inherit" \
  || ok "every seat and workflow pins Opus 5.5, Sonnet 5.5 or the Fable oracle"

grep -qi "TUTORIAL\|tutorial takes a stranger" "$ROOT/.claude/skills/standards/SKILL.md" \
  && ok "the four documentation kinds are named and kept apart" \
  || fail "documentation has no shape, so it collapses into one file"

# One command, one triple, every platform. The seat prose must never fork per
# target, so platform lives in data and the adapters end in the same three files.
for plat in ios android engine; do
  grep -q "  $plat)" "$S/capture.sh" \
    && ok "capture.sh carries the $plat adapter" \
    || fail "no $plat capture path, so that target has no evidence contract"
done
grep -q 'nographics' "$S/capture.sh" \
  && ok "the engine path refuses the flag that reports green over blank frames" \
  || fail "nothing warns about -nographics"
grep -q 'exec-out screencap' "$S/capture.sh" \
  && ok "android capture avoids the pipe that corrupts the png" \
  || fail "android capture uses the corrupting form"

# Sparse overrides, so a project never needs to edit a vendored file and the
# hash-clean overwrite stays the normal case. Overrides only ever ADD.
GOV=$(mktemp -d); mkdir -p "$GOV/.forge/overrides"
printf 'terraform[[:space:]]+destroy\n' > "$GOV/.forge/overrides/guard-deny"
payload () { python3 -c "import json,sys;print(json.dumps({'tool_input':{'command':sys.argv[1]}}))" "$1"; }
payload 'terraform destroy' | ( CLAUDE_PROJECT_DIR="$GOV" bash "$S/guard.sh" >/dev/null 2>&1 )
[ $? -eq 2 ] && ok "a project override adds a rule" || fail "overrides do not deny"
payload 'terraform destroy' | ( CLAUDE_PROJECT_DIR="$(mktemp -d)" bash "$S/guard.sh" >/dev/null 2>&1 )
[ $? -eq 0 ] && ok "with no override file the denylist is unchanged" || fail "overrides leak between projects"
rm -rf "$GOV"

# 196 hand-written probes shipped inside one product, 69 of them opening their
# own chromium, 23 covering two rubric lines, none sharing a helper, all
# committed. The contract is the floor that collapses them, and it only works if
# the seats are pointed at it and the debris is a disqualifier.
grep -q 'capture.sh' "$ROOT/.claude/agents/builder.md" \
  && ok "the builder composes from the capture contract" \
  || fail "the builder is free to reinvent capture per rubric line"
grep -q 'capture.sh' "$ROOT/.claude/agents/verifier.md" \
  && ok "the verifier composes from the capture contract" \
  || fail "the verifier is free to reinvent capture per rubric line"
grep -q 'probes' "$ROOT/.claude/agents/architect.md" \
  && ok "verification debris is a disqualifier" \
  || fail "nothing stops probe scripts shipping inside the product"
grep -qi 'anchor the render' "$ROOT/.claude/agents/verifier.md" \
  && ok "the render is anchored before anything is judged" \
  || fail "a blank frame can still be ruled on as a design difference"

# The design phase's falsification test earned exactly one gate, and it only
# works if LOUD is declared: a critic named a real build's dominant region
# correctly and had no way to know it was a filter chip rather than the content.
grep -q 'LOUD' "$ROOT/.claude/skills/design/SKILL.md" \
  && ok "the screen grid declares a loud element per route" \
  || fail "nothing declares LOUD, so the squint critic cannot be wrong about it"
[ -f "$ROOT/.claude/agents/design-critic.md" ] \
  && ok "the blind critic seat exists" \
  || fail "no design-critic seat"
grep -qE '^tools: Read$' "$ROOT/.claude/agents/design-critic.md" \
  && ok "the critic is blind by tool grant, not by request" \
  || fail "the critic can search the filesystem and find what it must not see"
[ -f "$ROOT/.claude/workflows/persona-panel.js" ] \
  && fail "the persona panel is back" \
  || ok "the persona panel stays struck"
[ -f "$ROOT/.claude/workflows/design-tournament.js" ] \
  && fail "the tournament crowns a winner again" \
  || ok "directions merge rather than crown"

# The verifier must be able to say it could not tell. A judge with no way out
# invents a verdict, and an invented PASS is indistinguishable from a real one
# in a rubric-driven run.
grep -q 'UNKNOWN' "$ROOT/.claude/agents/verifier.md" \
  && ok "the verifier has a third ruling" \
  || fail "the verifier can only invent PASS or FAIL"
grep -qi "builder's reasoning" "$ROOT/.claude/agents/verifier.md" \
  && ok "the verifier is denied the builder's framing" \
  || fail "the verifier may anchor on the work it is judging"
grep -q 'holdout' "$ROOT/.claude/agents/architect.md" \
  && ok "the architect writes a held-out suite the builder cannot read" \
  || fail "acceptance checks are all visible to the builder"
grep -q 'write scope' "$ROOT/.claude/agents/architect.md" \
  && ok "every slice declares a write scope, so parallelism is checkable" \
  || fail "no write scope, so parallel builders cannot be tested for overlap"

# guard.sh fires on 77 to 78 per cent of every tool call a run makes. Its five
# rules were five `echo | grep` pipes, ten processes a fire. Keep them builtins:
# this is structural, the same way the board is kept free of unlinkSync.
grep -q 'grep -Eq' "$S/guard.sh" \
  && fail "guard.sh is spawning grep again on the hot path" \
  || ok "guard.sh matches its five rules with bash builtins"
# Count the SHIPPED rules, not the deny calls: the per-project override handler
# is a sixth deny call and is deliberately not a sixth rule.
[ "$(grep -cE '^\[\[ \$CMD =~ \$R[0-9]+ \]\]' "$S/guard.sh")" = 5 ] \
  && ok "the shipped denylist is still five rules" \
  || fail "the shipped denylist changed size"

# `[ -lt ]` has three outcomes and the code read two: a non-integer operand
# exits 2, and && reads that exactly like "new enough".
APF="$AUD/pf"; mkdir -p "$APF/.forge" "$APF/oldbin"
{ echo '#!/bin/bash'; echo 'echo v8.17.0'; } > "$APF/oldbin/node"; chmod +x "$APF/oldbin/node"
printf -- '- [ ] cmd:node:20.11 | Node 20.11+ | nodejs.org\n' > "$APF/.forge/PREFLIGHT.md"
env PATH="$APF/oldbin:/usr/bin:/bin" CLAUDE_PROJECT_DIR="$APF" bash "$S/preflight.sh" 2>&1 \
  | grep -q '1 of 1 outstanding' \
  && ok "preflight compares a dotted version minimum" \
  || fail "preflight reports satisfied for a dotted minimum"

# read's status is the loop condition, so a file with no trailing newline lost
# its last line, and lost it in the direction of "nothing is waiting on you".
APF2="$AUD/pf2"; mkdir -p "$APF2/.forge"
printf -- '- [ ] cmd:sh | A shell | x\n- [ ] cmd:nosuchcmd77 | Missing | install' > "$APF2/.forge/PREFLIGHT.md"
CLAUDE_PROJECT_DIR="$APF2" bash "$S/preflight.sh" 2>&1 | grep -q '1 of 2 outstanding' \
  && ok "preflight keeps a last line with no trailing newline" \
  || fail "preflight dropped the last requirement"

# The throttle is the only thing standing between 1126 subagent stops and 1126
# commits, and a worded value made it fail open.
AR="$AUD/repo"; mkdir -p "$AR/.forge"
( cd "$AR" && git init -q . && git config user.email t@t && git config user.name t \
  && echo a > a.txt && git add -A && git commit -q -m base ) >/dev/null 2>&1
( cd "$AR" && echo b > b.txt && CLAUDE_PROJECT_DIR="$AR" bash "$S/commit.sh" "one" ) >/dev/null 2>&1
( cd "$AR" && echo c > c.txt && FORGE_COMMIT_WINDOW=soon CLAUDE_PROJECT_DIR="$AR" bash "$S/commit.sh" "two" ) >/dev/null 2>&1
N=$( cd "$AR" && git rev-list --count HEAD )
[ "$N" -eq 2 ] && ok "commit throttle survives a non-integer window" \
  || fail "a worded window disabled the throttle (n=$N)"

# The refusal used to stage everything, then git reset, discarding a hand-built
# index, and report nothing to callers who all redirect stderr to /dev/null.
AL="$AUD/leak"; mkdir -p "$AL/.forge"
( cd "$AL" && git init -q . && git config user.email t@t && git config user.name t \
  && echo a > a.txt && git add -A && git commit -q -m base ) >/dev/null 2>&1
( cd "$AL" && echo x > wanted.txt && printf 'k\n' > server.pem && git add wanted.txt ) >/dev/null 2>&1
( cd "$AL" && FORGE_COMMIT_WINDOW=0 CLAUDE_PROJECT_DIR="$AL" bash "$S/commit.sh" --now "leak" ) >/dev/null 2>&1
STAGED=$( cd "$AL" && git diff --cached --name-only | tr '\n' ' ' )
N=$( cd "$AL" && git rev-list --count HEAD )
case "$STAGED" in
  *wanted.txt*) [ "$N" -eq 1 ] && [ -f "$AL/.forge/COMMIT-BLOCKED" ] \
      && ok "commit refuses a leak without wiping the index, and says so on disk" \
      || fail "leak refusal: committed=$N record=$([ -f "$AL/.forge/COMMIT-BLOCKED" ] && echo yes || echo no)" ;;
  *) fail "leak refusal wiped the hand-staged index ('$STAGED')" ;;
esac
( cd "$AL" && printf 'server.pem\n' > .forge/commit-allow \
  && FORGE_COMMIT_WINDOW=0 CLAUDE_PROJECT_DIR="$AL" bash "$S/commit.sh" --now "allowed" ) >/dev/null 2>&1
N=$( cd "$AL" && git rev-list --count HEAD )
{ [ "$N" -eq 2 ] && [ ! -f "$AL/.forge/COMMIT-BLOCKED" ]; } \
  && ok "commit-allow releases the refusal and clears the record" \
  || fail "allow-list ignored (n=$N)"

rm -rf "$AUD"

# 3e-ii. A value is not a configuration. Run two's database URL was "set" at
# every step and failed three different ways: masked, then unreachable, then
# unauthenticated. The check only asked whether a value existed, so all three
# reported identically. A Supabase project created through an API has a
# generated password nobody has seen, and its connection string ships with the
# literal placeholder because there was never anything to substitute.
T10=$(mktemp -d); mkdir -p "$T10/.forge"
{
  echo '- [ ] env:FORGE_T_CONN    | A connection    | dashboard'
  echo '- [ ] remote-env:FORGE_T_CONN | Deploy holds it | vercel env add'
  echo '- [ ] run:true            | Works           | nothing'
} > "$T10/.forge/PREFLIGHT.md"

PH='postgresql://u:[YOUR-PASSWORD]@host:6543/postgres'
OUT=$(FORGE_T_CONN="$PH" CLAUDE_PROJECT_DIR="$T10" "$S/preflight.sh" 2>/dev/null)
printf '%s' "$OUT" | grep -q 'placeholder, not a value' \
  && ok "preflight refuses a value that is still a placeholder" \
  || fail "preflight accepted [YOUR-PASSWORD] as configured"

OUT=$(FORGE_T_CONN='postgresql://u:real@host:6543/postgres' CLAUDE_PROJECT_DIR="$T10" "$S/preflight.sh" 2>/dev/null)
printf '%s' "$OUT" | grep -q 'set on this machine' \
  && ok "preflight says WHERE a value is set, not just that it is" \
  || fail "preflight still reports a bare 'set'"

# A check that cannot run must never answer the question it was asked.
printf '%s' "$OUT" | grep -qE 'cannot read|cannot check|not linked|does not hold' \
  && ok "remote-env reports it could not check rather than passing" \
  || fail "remote-env passed without checking the deploy target"

# run: executes only under --probe, so a SessionStart report never runs
# arbitrary commands out of a file the architect wrote.
printf '%s' "$OUT" | grep -q 'not probed' \
  && ok "run: stays inert without --probe" || fail "run: executed unprompted"
OUT=$(CLAUDE_PROJECT_DIR="$T10" "$S/preflight.sh" --probe 2>/dev/null)
printf '%s' "$OUT" | grep -q '\[x\] Works' \
  && ok "run: executes under --probe" || fail "run: did not execute under --probe"

# Ordering lives in headings, not in remedy text: the remedy prints only while
# an item is outstanding, so the sequence vanishes the moment it is satisfied.
# Run two lost a seed run because storage provisioning was never sequenced.
{
  echo '## 1. Accounts'
  echo '- [ ] cmd:sh          | A shell     | none'
  echo '## 2. After the accounts'
  echo '- [ ] cmd:nosuchcmd77 | Missing     | install it'
} > "$T10/.forge/PREFLIGHT.md"
OUT=$(CLAUDE_PROJECT_DIR="$T10" "$S/preflight.sh" 2>/dev/null)
{ printf '%s' "$OUT" | grep -q '1. Accounts' && printf '%s' "$OUT" | grep -q '2. After the accounts' \
  && printf '%s' "$OUT" | grep -q '1 of 2 outstanding'; } \
  && ok "preflight renders stage headings without miscounting" \
  || fail "stage headings broke the report"
rm -rf "$T10"

# 4. rehydrate labels both arming states, and never asks for a /goal paste.
printf '# Plan\n## Slice 1: one\nCloses: F1\n' > "$T2/.forge/PLAN.md"
OUT=$(CLAUDE_PROJECT_DIR="$T2" "$S/rehydrate.sh" </dev/null 2>/dev/null)
printf '%s' "$OUT" | grep -q 'Awaiting greenlight. Nothing armed yet.' \
  && ok "rehydrate labels the pre-gate state" || fail "rehydrate pre-gate label wrong"
touch "$T2/.forge/ARMED"
OUT=$(CLAUDE_PROJECT_DIR="$T2" "$S/rehydrate.sh" </dev/null 2>/dev/null)
{ printf '%s' "$OUT" | grep -q 'Gate armed.' && ! printf '%s' "$OUT" | grep -q '/goal'; } \
  && ok "rehydrate labels the armed state without a /goal paste" || fail "rehydrate armed label wrong"
rm -f "$T2/.forge/ARMED"

# 4b. progress renderer: draws the fixture, no-ops without .forge/.
if command -v node >/dev/null 2>&1; then
  (cd "$T2" && node "$S/progress.mjs") 2>/dev/null
  { [ -f "$T2/.forge/PROGRESS.html" ] && grep -q 'Pipeline' "$T2/.forge/PROGRESS.html"; } \
    && ok "progress renders the fixture" || fail "progress did not render"
  T3=$(mktemp -d)
  (cd "$T3" && node "$S/progress.mjs") 2>/dev/null
  RC=$?
  { [ $RC -eq 0 ] && [ "$(find "$T3" -mindepth 1 | wc -l | tr -d ' ')" -eq 0 ]; } \
    && ok "progress no-ops without .forge/" || fail "progress misbehaved without .forge/ (rc=$RC)"
  rm -rf "$T3"

  # Both slice dialects light the chips and the cursor. The prose form is what
  # a lead actually writes; a renderer that only reads "Current slice: 2"
  # draws ten grey chips and calls it a build.
  T4=$(mktemp -d); mkdir -p "$T4/.forge"; touch "$T4/.forge/ARMED"
  # Slice 1 closes F1 and F2, and a slice is done only when both are verified.
  printf '# DOD\n\n## Function\n- [x] F1. One.\n- [x] F2. Two.\n- [ ] F3. Three.\n' > "$T4/.forge/DOD.md"
  printf '# Plan\n\n## Slices\n\n### 1. First slice\n\nBody.\n\nCloses on: F1 and F2 proven.\n\n### 2. Second slice\n\nBody.\n\nCloses on: F3 proven.\n' > "$T4/.forge/PLAN.md"
  printf '# Resume\n\nPhase 8, BUILD. Slice 2 of 2. The Stop gate is live.\n\n## Next action\n\n1. Dispatch the verifier.\n' > "$T4/.forge/RESUME.md"
  (cd "$T4" && node "$S/progress.mjs") 2>/dev/null
  H="$T4/.forge/PROGRESS.html"
  { grep -q 'chip sl-done' "$H" && grep -q 'chip sl-active' "$H" \
    && grep -q 'slice 2 of 2' "$H" && grep -q 'In play . slice 2' "$H"; } \
    && ok "progress reads the prose slice dialect" || fail "progress lost the prose slice dialect"
  printf '# Plan\n\n## Slice 1: First slice\n\nCloses: F1, F2\n\n## Slice 2: Second slice\n\nCloses: F3\n' > "$T4/.forge/PLAN.md"
  printf 'Last phase: BUILD\nCurrent slice: 2\nNext action: verify\n' > "$T4/.forge/RESUME.md"
  (cd "$T4" && node "$S/progress.mjs") 2>/dev/null
  { grep -q 'chip sl-done' "$H" && grep -q 'chip sl-active' "$H" \
    && grep -q 'slice 2 of 2' "$H" && grep -q 'In play . slice 2' "$H"; } \
    && ok "progress keeps the written slice dialect" || fail "progress lost the written slice dialect"

  # The screenmap: roster from DESIGN, slice from PLAN (by number and by the
  # "the X page" shape), state from captures, routes from the tree. A screen
  # with no capture must never read as built, however the plan words it.
  # Three screens so all three states are exercised: 01 has a capture, 02 belongs
  # to the current slice, 03 belongs to a later one. The old fixture had two and
  # asserted a planned state no screen in it could reach.
  printf '# Design\n\n## Screen list\n\n| # | Screen | Link |\n|---|---|---|\n| 01 | Aisle check | x |\n| 02 | Landing | x |\n| 03 | Contributor | x |\n' > "$T4/.forge/DESIGN.md"
  printf '# Plan\n\n## Slices\n\n### 1. First slice\n\nClient: screen 01 in full.\n\nCloses on: F1 proven.\n\n### 2. Second slice\n\nClient: the landing page.\n\nCloses on: F3 proven.\n\n### 3. Third slice\n\nClient: screen 03 later.\n\nCloses on: F4 proven.\n' > "$T4/.forge/PLAN.md"
  printf '# Resume\n\nPhase 8, BUILD. Slice 1 of 2.\n\n| # | Screen | Route | State |\n|---|---|---|---|\n| 01 | Aisle check | `/` | built |\n| 02 | Landing | not routed | slice 2 |\n' > "$T4/.forge/RESUME.md"
  mkdir -p "$T4/.forge/evidence" "$T4/app"
  : > "$T4/.forge/evidence/d5-01-aisle-dark-390.png"
  : > "$T4/.forge/evidence/c23-owned-1440.png"
  printf 'export default function P(){}\n' > "$T4/app/page.tsx"
  (cd "$T4" && node "$S/progress.mjs") 2>/dev/null
  { grep -q 'panel scr' "$H" && grep -q 'srow s-cap' "$H" \
    && grep -q 'designed, not routed' "$H" && grep -q '1 of 3' "$H" \
    && grep -q 'route(s) on disk' "$H"; } \
    && ok "progress draws the sitemap" || fail "progress did not draw the sitemap"
  # 1440 is a viewport width, not screen 14; 390 is not screen 39. Only the
  # aisle-check capture is attributed, and only because it carries the word
  # "aisle": no bare number may put a capture on a screen.
  SC=$(grep -o 'srow s-cap' "$H" | wc -l | tr -d ' ')
  [ "$SC" -eq 1 ] && ok "the sitemap counts captures by name, never by a bare number" \
    || fail "sitemap miscounted captures (s-cap=$SC)"

  # THE NUMBERING COLLISION. DESIGN.md numbers screens and DOD.md numbers
  # surfaces, and the two disagree from position two onward. Run three's
  # captures followed DOD's numbering, the matcher read them as DESIGN's, and
  # five of seven rows counted another screen's captures under a confident
  # "7 of 7". A leading 01 on a landing capture must not reach screen 01.
  : > "$T4/.forge/evidence/look-01-landing-1440-dark.png"
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  AISLE=$(grep -o 'title="[^"]*Aisle check[^"]*' "$H" | head -1)
  LAND=$(grep -o 'title="[^"]*Landing[^"]*' "$H" | head -1)
  case "$AISLE" in
    *"1 capture(s)"*) ok "a DOD surface number never lands on a DESIGN screen" ;;
    *) fail "the numbering collision is back: $AISLE" ;;
  esac
  case "$LAND" in
    *"1 capture(s)"*) ok "the capture reaches the screen its own name says" ;;
    *) fail "landing capture went nowhere: $LAND" ;;
  esac
  rm -f "$T4/.forge/evidence/look-01-landing-1440-dark.png"

  # Captures get filed per slice. A flat readdir returns the SUBDIRECTORY NAME
  # as if it were a file, so a screen whose captures all live one level down
  # counts zero and the panel says "0 of 7" with total confidence. Run two hit
  # this with .forge/shots/slice1/.
  rm -f "$T4/.forge/evidence/"*.png
  mkdir -p "$T4/.forge/evidence/slice1"
  : > "$T4/.forge/evidence/slice1/d5-01-aisle-dark-390.png"
  : > "$T4/.forge/evidence/slice1/d5-01-aisle-light-390.png"
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  SUB=$(grep -o 'srow s-cap' "$H" | wc -l | tr -d ' ')
  [ "$SUB" -eq 1 ] && ok "screenmap sees captures filed in a subdirectory" \
    || fail "screenmap blind to nested captures (s-cap=$SUB)"
  # And the copy in .forge/shots must not be counted a second time.
  mkdir -p "$T4/.forge/shots"
  : > "$T4/.forge/shots/ab12cd34-d5-01-aisle-dark-390.png"
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  TITLE=$(grep -o 'title="[^"]*Aisle check[^"]*' "$H" | head -1)
  case "$TITLE" in
    *"2 capture(s)"*) ok "the shots copy is not counted twice" ;;
    *) fail "capture double-count returned: $TITLE" ;;
  esac
  # THE BOARD MUST NOT DELETE EVIDENCE. progress.mjs pruned every file in
  # .forge/shots it did not recognise, on every evidence.sh call, from the
  # directory captures live in. Run two's captures survived only because they
  # sat in subdirectories, where unlinkSync throws EISDIR into an empty catch.
  # Luck, not design. A name test is not enough either: copies are
  # `<hash>-<basename>` and `d5-` is valid hex.
  rm -rf "$T4/.forge/shots"; mkdir -p "$T4/.forge/shots/slice1"
  printf 'capture\n' > "$T4/.forge/shots/flat-capture.png"
  printf 'capture\n' > "$T4/.forge/shots/d5-01-aisle-dark-390.png"
  printf 'capture\n' > "$T4/.forge/shots/slice1/nested.png"
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  KEPT=0
  for f in flat-capture.png d5-01-aisle-dark-390.png slice1/nested.png; do
    [ -f "$T4/.forge/shots/$f" ] && KEPT=$((KEPT + 1))
  done
  [ "$KEPT" -eq 3 ] && ok "the board never deletes a capture it did not write" \
    || fail "progress.mjs destroyed evidence ($KEPT of 3 survived)"
  # AND IT NO LONGER DELETES THE COPIES IT DID WRITE. Test runners wipe their
  # output directories mid-run: 169 of the 250 capture paths named in one run's
  # EVIDENCE.md no longer existed on disk. For those, this file's copy is the
  # last surviving image of a ruling, and pruning it because it aged out of the
  # newest sixty destroys the only proof there was. The unlink is gone from the
  # renderer entirely, import included, so this is structural and not a policy
  # anybody can walk back by editing a condition.
  grep -q 'unlinkSync' "$S/progress.mjs" \
    && fail "the renderer can delete files again" \
    || ok "the renderer holds no delete at all"
  mkdir -p "$T4/vanishing"
  printf 'capture\n' > "$T4/vanishing/gone-soon-390.png"
  printf '2026-01-01T00:00:00Z | F1 | vanishing/gone-soon-390.png\n' > "$T4/.forge/EVIDENCE.md"
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  COPY=$(ls "$T4/.forge/shots" 2>/dev/null | grep 'gone-soon-390.png' | head -1)
  rm -rf "$T4/vanishing"
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  { [ -n "$COPY" ] && [ -f "$T4/.forge/shots/$COPY" ]; } \
    && ok "the last copy of a vanished capture survives" \
    || fail "the board pruned the only surviving image of a ruling"
  rm -f "$T4/.forge/EVIDENCE.md"

  # A zero over a population the matcher never classified is not a measured
  # zero. Run two named 76 captures by rubric id, none carried a screen number,
  # and the panel said "0 of 7" beside a gallery full of screenshots.
  #
  # THE SENTENCE CHANGED, AND SO DID ITS ADVICE. It used to read "805 captures
  # carry no screen number, so none is counted here" while the rows above it
  # counted 46, and it prescribed naming captures <screen>-... , which is the
  # very collision that mislabelled five of seven rows. It now reports the
  # residue and prescribes nothing.
  # Clear BOTH capture directories: the previous case left a file carrying a
  # legitimate 01 token, which would satisfy this one for the wrong reason.
  rm -rf "$T4/.forge/evidence" "$T4/.forge/shots"
  mkdir -p "$T4/.forge/evidence"
  printf 'x\n' > "$T4/.forge/evidence/slice1-C34-catalogue-390.png"
  printf 'x\n' > "$T4/.forge/evidence/f7-not-in-collection-390.png"
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  grep -q 'prove no single screen' "$H" \
    && ok "the sitemap says when it could not attribute a capture" \
    || fail "sitemap reported a silent zero over unattributed captures"
  # And it must not guess from a bare number or from a directory it invented.
  # Neither capture names a screen in this roster: "catalogue" and "collection"
  # are not Aisle check, Landing or Contributor. A wrong screen is worse than
  # an unassigned one.
  #
  # WHAT THIS NO LONGER FORBIDS, AND WHY. The rule used to be that no name may
  # ever attribute a capture, and that rule is what left every attribution to
  # the number, which then read DOD's numbering as DESIGN's and put five of
  # seven rows on the wrong screen. A capture whose own filename carries a
  # screen's name IS a capture of that screen: "f7-not-in-collection-390.png"
  # shows the collection screen without the item, and counting it as a capture
  # of that screen is right. What it does NOT do is tell you the verdict, and
  # the board has never claimed to draw verdicts from filenames.
  grep -q 'srow s-cap' "$H" \
    && fail "sitemap attributed a capture that names no screen in this roster" \
    || ok "the sitemap does not guess a screen from an unrelated name"
  # A SITEMAP IS A TREE. The panel drew the designer's flat list of seven and
  # called it Screens while twenty-one routes sat on disk unmentioned, nested
  # three deep, and the footer admitted "0 tied to a screen". Routes are the
  # reality; the designed screens attach where they tie.
  rm -rf "$T4/.forge/evidence" "$T4/.forge/shots"
  mkdir -p "$T4/app/account/reset/confirm" "$T4/app/catalogue" "$T4/.forge/evidence"
  printf 'export default function P(){}\n' > "$T4/app/account/reset/confirm/page.tsx"
  printf 'export default function P(){}\n' > "$T4/app/catalogue/page.tsx"
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  { grep -q 'style="--d:1"' "$H" && grep -q 'style="--d:3"' "$H" \
    && grep -q 's-stub' "$H"; } \
    && ok "the sitemap nests routes by depth and marks bare path segments" \
    || fail "the sitemap is still flat"

  # VIEWPORT AND THEME WERE ALWAYS IN THE FILENAMES. The old comment called 390
  # and 1440 inert and dropped them, so a screen proved on a laptop only and a
  # screen proved everywhere drew identically.
  : > "$T4/.forge/evidence/aisle-390-light.png"
  : > "$T4/.forge/evidence/aisle-390-dark.png"
  : > "$T4/.forge/evidence/aisle-1440-light.png"
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  ONCELLS=$(grep -o '<i class="on" title="mobile light"></i>' "$H" | wc -l | tr -d ' ')
  OFFCELL=$(grep -c '<i class="" title="desktop dark"></i>' "$H" | tr -d ' ')
  { [ "$ONCELLS" -ge 1 ] && [ "$OFFCELL" -ge 1 ]; } \
    && ok "coverage separates mobile from desktop and light from dark" \
    || fail "viewport coverage not drawn (on=$ONCELLS off=$OFFCELL)"

  # The design is one click away. DESIGN.md already carries the Claude Design
  # file per screen; claude.ai refuses to be framed, so it opens in a new tab.
  printf '# Design\n\n## Screen list\n\n[00 Index](https://claude.ai/design/p/abc)\n\n| # | Screen | File |\n|---|---|---|\n| 01 | Aisle check | [open](https://claude.ai/design/p/abc?file=01+Aisle.dc.html) |\n| 02 | Landing | [open](https://claude.ai/design/p/abc?file=02+Landing.dc.html) |\n| 03 | Contributor | [open](https://claude.ai/design/p/abc?file=03+C.dc.html) |\n' > "$T4/.forge/DESIGN.md"
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  { grep -q 'class="dlink" href="https://claude.ai/design/p/abc?file=01' "$H" \
    && grep -q 'target="_blank"' "$H"; } \
    && ok "each screen links to its Claude Design file, in a new tab" \
    || fail "design links missing"

  # WORKTREES ARE NOT INVISIBLE. Seventeen had piled up on a two-day run, one
  # locked, each a full checkout with its own .forge. Nothing is pruned here;
  # the board says they are there.
  if command -v git >/dev/null 2>&1; then
    ( cd "$T4" && git init -q . && git config user.email t@t && git config user.name t \
      && git add -A >/dev/null 2>&1 && git commit -qm base >/dev/null 2>&1 \
      && git worktree add -q -b wt-one .wt-one >/dev/null 2>&1 ) 2>/dev/null
    ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
    grep -q '1 worktree' "$H" \
      && ok "the board reports worktrees still on disk" \
      || fail "worktrees stayed invisible"
  else
    ok "git absent; worktree chip unchecked"
  fi

  # THE CURSOR IS THE RUBRIC'S, NOT A SENTENCE'S. Run two's handoff line read
  # "Current slice: verifying against the live URL. Slice 1 closed. Slice 2 at 8
  # of 9". The parser took the first number on the line, which belonged to the
  # word "closed", so the board showed slice 1 in flight while slices 1 to 3
  # were fully verified and slice 4 stood at 8 of 12. A sentence ages; the
  # checkboxes are the same ones the Stop gate counts.
  printf '# DOD\n\n## Function\n- [x] F1. a\n- [x] F2. b\n- [x] F3. c\n- [ ] F4. d\n- [ ] F5. e\n' > "$T4/.forge/DOD.md"
  printf '# Plan\n\n## Slices\n\n### 1. One\n\nCloses: F1\n\n### 2. Two\n\nCloses: F2\n\n### 3. Three\n\nCloses: F3\n\n### 4. Four\n\nCloses: F4, F5\n' > "$T4/.forge/PLAN.md"
  printf 'Current slice: verifying against the live URL. Slice 1 closed. Slice 2 at 8 of 9.\n' > "$T4/.forge/RESUME.md"
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  { grep -q 'slice 4 of 4' "$H" && [ "$(grep -c 'chip sl-done' "$H")" -eq 3 ] \
    && grep -q 'sl-active" title="slice 4' "$H"; } \
    && ok "the slice cursor comes from the rubric, not from stale prose" \
    || fail "cursor read a sentence: $(grep -o 'slice [0-9]* of [0-9]*' "$H" | head -1)"

  # And the chip carries its own count, so a truncated title is not the only
  # thing the strip says about a slice.
  grep -q '<i>3/3</i>\|<i>1/1</i>' "$H" \
    && ok "each slice chip shows verified of total" \
    || fail "slice chips lost their counts"

  # The details popin groups by slice as well as by section, and the slice view
  # must account for every line: the Closes lists are supposed to partition the
  # rubric exactly, so a line in neither view is a plan defect worth seeing.
  SLICEROWS=$(sed -n '/class="bb bb-slice"/,/class="bb bb-sec"/p' "$H" | grep -c 'class="row"')
  SECROWS=$(sed -n '/class="bb bb-sec"/,$p' "$H" | grep -c 'class="row"')
  TOTALLINES=$(grep -c '^- \[' "$T4/.forge/DOD.md")
  { [ "$SLICEROWS" -eq "$TOTALLINES" ] && [ "$SECROWS" -eq "$TOTALLINES" ]; } \
    && ok "the popin groups every rubric line by slice and by section" \
    || fail "popin lost lines (slice=$SLICEROWS sec=$SECROWS of $TOTALLINES)"
  { grep -q 'data-g="slice"' "$H" && grep -q 'data-g="sec"' "$H"; } \
    && ok "the popin offers both groupings" || fail "grouping toggle missing"

  # The environments strip, and its running indicator. The board said what had
  # been built and never where to look at it. A dot that cannot go out is
  # decoration, so this asserts BOTH states against a real listener.
  #
  # A DEAD PORT IS NOT AN ENVIRONMENT. Twelve of them had piled up on a two-day
  # run, one the discard port :9 a verifier used as a deliberate negative
  # control, each drawn as a link somebody might click. They collapse into one
  # count that names them on hover, and only a port something is listening on
  # gets a chip of its own.
  PORT=54893
  printf 'Local dev at http://localhost:%s and nothing else.\n' "$PORT" > "$T4/.forge/BRIEF.md"
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  { grep -q 'env--dead' "$H" && grep -q "dead port" "$H" \
    && grep -q ":$PORT" "$H"; } \
    && ok "a port nothing is listening on collapses into the dead count" \
    || fail "a dead port was not collapsed"
  grep -q "env--up[^>]*localhost:$PORT" "$H" \
    && fail "a dead port was drawn as a live environment" \
    || ok "a dead port is never drawn as a live environment"

  # Now actually listen on it.
  ( python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > "$T4/.srv" )
  SRV=$(cat "$T4/.srv" 2>/dev/null)
  WAITED=0
  while [ "$WAITED" -lt 20 ]; do
    lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -q ":$PORT " && break
    WAITED=$((WAITED + 1))
  done
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  { grep -q 'env--up' "$H" && grep -q "localhost:$PORT" "$H"; } \
    && ok "the running indicator lights when the port is actually listening" \
    || fail "a live port never appeared"
  [ -n "$SRV" ] && kill "$SRV" 2>/dev/null
  rm -f "$T4/.srv"

  rm -rf "$T4"
else
  fail "node not found; progress renderer unchecked"
fi
rm -rf "$T2"

# 4d. The two states between open and evidence. A board that reads 0/0/N through
# hours of building looks identical to a run that never started, which is how an
# EVIDENCE.md that did not exist stayed invisible for a whole slice.
T8=$(mktemp -d); mkdir -p "$T8/.forge"; touch "$T8/.forge/ARMED"
printf '# DOD\n\n## Function\n- [ ] F1. a\n- [ ] F2. b\n- [ ] F3. c\n- [ ] F4. d\n' > "$T8/.forge/DOD.md"
printf '# Plan\n\n## Slices\n\n### Slice 1. First\n\nCloses: F1, F2\n\n### Slice 2. Second\n\nCloses: F3, F4\n' > "$T8/.forge/PLAN.md"

# Cursor on slice 1: its two lines are in build, the rest stay open, no debt.
printf '# Resume\n\nCurrent slice: 1\n' > "$T8/.forge/RESUME.md"
( cd "$T8" && node "$S/progress.mjs" ) 2>/dev/null
H8="$T8/.forge/PROGRESS.html"
{ grep -q '2 in build' "$H8" && grep -q '2 open' "$H8" && ! grep -q 'class="debt"' "$H8"; } \
  && ok "rubric counts the current slice as in build" \
  || fail "in-build count wrong at slice 1"

# Cursor moves on with nothing recorded: slice 1's lines become debt, and the
# debt is named by the slice that owed it.
printf '# Resume\n\nCurrent slice: 2\n' > "$T8/.forge/RESUME.md"
( cd "$T8" && node "$S/progress.mjs" ) 2>/dev/null
{ grep -q 'class="debt"' "$H8" && grep -q '2 line(s) built in slice 1, 0 recorded' "$H8" \
  && grep -q '2 unrecorded' "$H8"; } \
  && ok "rubric surfaces lines built in a past slice and never recorded" \
  || fail "debt not surfaced after the cursor moved"

# Record slice 1 and the debt clears rather than lingering.
printf '2026-01-01T00:00:00Z | F1 | proof\n2026-01-01T00:00:00Z | F2 | proof\n' > "$T8/.forge/EVIDENCE.md"
( cd "$T8" && node "$S/progress.mjs" ) 2>/dev/null
{ ! grep -q 'class="debt"' "$H8" && grep -q '2 evidence' "$H8"; } \
  && ok "recording the evidence clears the debt" \
  || fail "debt survived the evidence that answers it"

# THE VERDICTS OF RECORD REACH THE BOARD. A line that failed verification four
# times was byte-identical here to a line nobody had attempted: DOD.md carries
# a checkbox and nothing else, RUNLOG.md records no failures at all, and the
# rulings sat unread in VERDICT-*.md. A red run and a green run drew the same.
printf '# Verdict slice 1, 2026-01-01\n\nF1 PASS on the live URL.\nF2 FAIL. The export writes a header row and no rows.\n' \
  > "$T8/.forge/VERDICT-slice1.md"
( cd "$T8" && node "$S/progress.mjs" ) 2>/dev/null
{ grep -q '1 failing' "$H8" && grep -q 'ruled against in slice 1' "$H8" \
  && grep -q 'dotln fail' "$H8" && grep -q 'header row and no rows' "$H8"; } \
  && ok "a FAIL ruling in a verdict file reaches the board with its reason" \
  || fail "the board still cannot show a failure"

# A later PASS closes it. Nothing is ever cleared by hand, because the only
# legitimate way a line closes is by passing.
printf '2026-01-02T00:00:00Z | F2 | PASS. 940 rows exported and read back.\n' >> "$T8/.forge/EVIDENCE.md"
( cd "$T8" && node "$S/progress.mjs" ) 2>/dev/null
grep -q '1 failing' "$H8" \
  && fail "a failure survived the pass that answers it" \
  || ok "a later pass clears the failure"

# A ledger entry is read the same way, so a harness that writes one and a run
# that never had one both light up.
printf '2026-01-03T00:00:00Z | F1 | blocks | the aisle check answers for the device\n' \
  > "$T8/.forge/DEFECTS.md"
( cd "$T8" && node "$S/progress.mjs" ) 2>/dev/null
grep -q 'answers for the device' "$H8" \
  && ok "the defect ledger is read when one exists" \
  || fail "DEFECTS.md went unread"
rm -f "$T8/.forge/DEFECTS.md" "$T8/.forge/VERDICT-slice1.md"

# Every line lands in exactly one bucket: the states must sum to the rubric.
printf '# Verdict 2026-01-05\n\nF2 FAIL. Still empty.\n' > "$T8/.forge/VERDICT-x.md"
printf '2026-01-01T00:00:00Z | F1 | proof\n' > "$T8/.forge/EVIDENCE.md"
( cd "$T8" && node "$S/progress.mjs" ) 2>/dev/null
SUM=$(node -e '
const h=require("fs").readFileSync(process.argv[1],"utf8");
const m=h.match(/([0-9]+) verified · ([0-9]+) evidence(?: · ([0-9]+) in build)? · ([0-9]+) open/);
const u=(h.match(/>([0-9]+) unrecorded</)||[,0])[1];
const f=(h.match(/>([0-9]+) failing</)||[,0])[1];
console.log(m ? (+m[1])+(+m[2])+(+(m[3]||0))+(+m[4])+(+u)+(+f) : -1);
' "$H8")
[ "$SUM" -eq 4 ] && ok "the rubric states partition every line" \
  || fail "states do not partition the rubric (sum=$SUM of 4)"
rm -rf "$T8"

# 5. The workflows parse under the runtime grammar (async body, export stripped).
if command -v node >/dev/null 2>&1; then
  node -e '
    const fs = require("fs");
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    let fail = 0;
    for (const f of fs.readdirSync(process.argv[1]).filter(x => x.endsWith(".js"))) {
      const src = fs.readFileSync(process.argv[1] + "/" + f, "utf8").replace(/^export /m, "");
      try { new AsyncFunction("agent","parallel","pipeline","phase","log","args","budget","workflow", src); }
      catch (e) { fail = 1; console.error(f + ": " + e.message); }
    }
    process.exit(fail);' "$ROOT/.claude/workflows" \
    && ok "every workflow parses" || fail "a workflow does not parse"
else
  fail "node not found; workflows unchecked"
fi

# 5b. The build workflow's control flow, simulated with agent() stubbed: the
# ladder, partials, UNKNOWN, resume at a rung, milestone, re-judge, fix mode,
# the parallel L merge, and a pin on every call. Zero model calls.
if command -v node >/dev/null 2>&1; then
  node "$S/build-sim.mjs" >/dev/null 2>&1 \
    && ok "build.js walks the ladder, verifies and pins every agent (build-sim)" \
    || { fail "build.js control flow broke:"; node "$S/build-sim.mjs" 2>&1 | grep FAIL | sed 's/^/     /'; }
fi

# 6b. A seat is a contract between prose and configuration. Run two shipped four
# seats that could not do their stated job: the verifier, the only seat allowed
# to clear the Stop gate, had no Edit and flipped seven checkboxes through
# `sed -i`; the finisher was told to write REPORT.md with `tools: Read, Bash`
# and would have failed at the run's last step. The frontmatter test caught none
# of it, because it only asked whether the YAML parsed.
if command -v node >/dev/null 2>&1; then
  node "$S/seat-check.mjs" "$ROOT/.claude/agents" >/dev/null 2>&1 \
    && ok "every seat's tools grant what its prose orders" \
    || { fail "a seat cannot do its own job:"; node "$S/seat-check.mjs" "$ROOT/.claude/agents" 2>&1 | sed 's/^/     /'; }

  # And the check must fail on a broken seat, or it is decorative. Run two's own
  # mutation pass found four tests that passed whether or not their code worked,
  # including one written to close a check-lies-about-its-subject bug.
  # And the check must fail on a broken seat, or it is decorative. Three
  # mutations, one per v2 contract: an inherited model, Fable outside the
  # oracle, and a seat ordered to run a script it has no Bash for.
  T9=$(mktemp -d)
  cp "$ROOT/.claude/agents/verifier.md" "$T9/verifier.md"
  sed -i.bak -E 's/^model:.*$/model: inherit/' "$T9/verifier.md"; rm -f "$T9"/*.bak
  node "$S/seat-check.mjs" "$T9" >/dev/null 2>&1 \
    && fail "seat-check passed a seat that inherits its model" \
    || ok "seat-check fails on an inherited model"
  cp "$ROOT/.claude/agents/verifier.md" "$T9/verifier.md"
  sed -i.bak -E 's/^model:.*$/model: claude-fable-5-1/' "$T9/verifier.md"; rm -f "$T9"/*.bak
  node "$S/seat-check.mjs" "$T9" >/dev/null 2>&1 \
    && fail "seat-check let Fable run outside the oracle" \
    || ok "seat-check keeps Fable to the oracle"
  rm -f "$T9/verifier.md"; cp "$ROOT/.claude/agents/architect.md" "$T9/architect.md"
  sed -i.bak -E 's/^tools:.*$/tools: Read, Grep, Glob, Write, Edit/' "$T9/architect.md"; rm -f "$T9"/*.bak
  node "$S/seat-check.mjs" "$T9" >/dev/null 2>&1 \
    && fail "seat-check passed an architect that cannot run dod-check" \
    || ok "seat-check fails on a seat that cannot do its job"
  rm -rf "$T9"
else
  fail "node not found; seat contracts unchecked"
fi
# 6. settings.json parses; every agent frontmatter is well formed.
python3 -c "import json; json.load(open('$ROOT/.claude/settings.json'))" 2>/dev/null \
  && ok "settings.json parses" || fail "settings.json invalid"
for a in "$ROOT"/.claude/agents/*.md; do
  python3 - "$a" <<'PYEOF' 2>/dev/null && ok "frontmatter: $(basename "$a")" || fail "frontmatter: $(basename "$a")"
import sys
lines = open(sys.argv[1]).read().split("\n")
assert lines[0] == "---", "missing opening ---"
end = lines[1:].index("---") + 1
fm = "\n".join(lines[1:end])
assert "name:" in fm and "description:" in fm, "name/description missing"
for l in lines[1:end]:
    if l and not l.startswith((" ", "\t", "#")):
        assert ":" in l, "bad frontmatter line: " + l
PYEOF
done

echo "---"
if [ $FAILS -eq 0 ]; then echo "selftest: all checks passed"; exit 0
else echo "selftest: $FAILS check(s) failed"; exit 1; fi
