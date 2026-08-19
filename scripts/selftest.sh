#!/usr/bin/env bash
# Regression harness for the forge enforcement layer. Run it after any Claude
# Code update; drift recurs and this is the one-command answer.
# Checks: every script no-ops outside a forge project, behave against a
# fixture .forge/, dod-gate blocks and releases correctly, rehydrate labels
# both arming states, the four workflows parse, settings.json and every agent

# frontmatter parse. Exits non-zero on any failure.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
S="$ROOT/scripts"
# Every script, not a frozen list of nine: commit.sh and preflight.sh shipped
# with no assertion that they stay silent and side-effect-free outside a
# forge project, which is the guarantee this loop exists to hold.
ALL="guard.sh checks.sh runlog.sh dod-gate.sh checkpoint.sh rehydrate.sh snapshot.sh notify.sh evidence.sh commit.sh preflight.sh"
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

# "Cannot find module" is the literal wording of TS2307, the commonest real
# TypeScript error there is. Deciding from the message swallowed it.
AC="$AUD/checks"; mkdir -p "$AC/node_modules"
printf '{"name":"x","scripts":{"typecheck":"node ./fail.js"}}\n' > "$AC/package.json"
{ echo 'console.error("a.ts(1,1): error TS2307: Cannot find module \"@/lib/db\".");'
  echo 'process.exit(1);'; } > "$AC/fail.js"
printf '{"tool_input":{"file_path":"x"}}' | ( cd "$AC" && CLAUDE_PROJECT_DIR="$AC" bash "$S/checks.sh" >/dev/null 2>&1 )
[ $? -eq 2 ] && ok "checks blocks a real TS2307 saying Cannot find module" \
  || fail "checks swallowed a genuine typecheck failure"
AC2="$AUD/checks2"; mkdir -p "$AC2/node_modules"
printf '{"name":"x","scripts":{"typecheck":"definitely-not-a-real-binary-xyz"}}\n' > "$AC2/package.json"
printf '{"tool_input":{"file_path":"x"}}' | ( cd "$AC2" && CLAUDE_PROJECT_DIR="$AC2" bash "$S/checks.sh" >/dev/null 2>&1 )
[ $? -eq 0 ] && ok "checks stands down when the binary is genuinely absent" \
  || fail "checks blocked on a missing binary"

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
printf '%s' "$OUT" | grep -qE 'cannot check|not linked|does not hold' \
  && ok "remote-env reports it could not check rather than passing" \
  || fail "remote-env passed without checking the deploy target"

# run: executes only under --probe, so a SessionStart report never runs
# arbitrary commands out of a file the architect wrote.
printf '%s' "$OUT" | grep -q 'not probed' \
  && ok "run: stays inert without --probe" || fail "run: executed unprompted"
OUT=$(CLAUDE_PROJECT_DIR="$T10" "$S/preflight.sh" --probe 2>/dev/null)
printf '%s' "$OUT" | grep -q '\[x\] Works' \
  && ok "run: executes under --probe" || fail "run: did not execute under --probe"
rm -rf "$T10"

# 4. rehydrate labels both arming states.
printf '# Plan\n\n/goal Every line of .forge/DOD.md checked, with evidence recorded in .forge/EVIDENCE.md, and a PASS verdict from the verifier agent.\n' > "$T2/.forge/PLAN.md"
OUT=$(CLAUDE_PROJECT_DIR="$T2" "$S/rehydrate.sh" 2>/dev/null)
{ printf '%s' "$OUT" | grep -q 'Awaiting greenlight. Nothing armed yet.' && printf '%s' "$OUT" | grep -q 'arm with: /goal '; } \
  && ok "rehydrate labels the pre-gate state" || fail "rehydrate pre-gate label wrong"
touch "$T2/.forge/ARMED"
OUT=$(CLAUDE_PROJECT_DIR="$T2" "$S/rehydrate.sh" 2>/dev/null)
{ printf '%s' "$OUT" | grep -q 'Gate active.' && printf '%s' "$OUT" | grep -q 'paste: /goal '; } \
  && ok "rehydrate labels the armed state" || fail "rehydrate armed label wrong"

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
  printf '# DOD\n\n## Function\n- [x] F1. One.\n- [ ] F2. Two.\n- [ ] F3. Three.\n' > "$T4/.forge/DOD.md"
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
  printf '# Design\n\n## Screen list\n\n| # | Screen | Link |\n|---|---|---|\n| 01 | Aisle check | x |\n| 02 | Landing | x |\n' > "$T4/.forge/DESIGN.md"
  printf '# Plan\n\n## Slices\n\n### 1. First slice\n\nClient: screen 01 in full.\n\nCloses on: F1 proven.\n\n### 2. Second slice\n\nClient: the landing page.\n\nCloses on: F3 proven.\n' > "$T4/.forge/PLAN.md"
  printf '# Resume\n\nPhase 8, BUILD. Slice 1 of 2.\n\n| # | Screen | Route | State |\n|---|---|---|---|\n| 01 | Aisle check | `/` | built |\n| 02 | Landing | not routed | slice 2 |\n' > "$T4/.forge/RESUME.md"
  mkdir -p "$T4/.forge/evidence" "$T4/app"
  : > "$T4/.forge/evidence/d5-01-aisle-dark-390.png"
  : > "$T4/.forge/evidence/c23-owned-1440.png"
  printf 'export default function P(){}\n' > "$T4/app/page.tsx"
  (cd "$T4" && node "$S/progress.mjs") 2>/dev/null
  { grep -q 'panel scr' "$H" && grep -q 'srow s-cap' "$H" && grep -q 'srow s-pln' "$H" \
    && grep -q '1 of 2' "$H" && grep -q 'route(s) in the tree' "$H"; } \
    && ok "progress draws the screenmap" || fail "progress did not draw the screenmap"
  # 1440 is a viewport width, not screen 14; 390 is not screen 39.
  SC=$(grep -o 'srow s-cap' "$H" | wc -l | tr -d ' ')
  [ "$SC" -eq 1 ] && ok "screenmap counts captures by exact screen token" \
    || fail "screenmap miscounted captures (s-cap=$SC)"

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
  TITLE=$(grep -o 'title="Aisle check[^"]*"' "$H" | head -1)
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

  # A zero over a population the matcher never classified is not a measured
  # zero. Run two named 76 captures by rubric id, none carried a screen number,
  # and the panel said "0 of 7" beside a gallery full of screenshots.
  # Clear BOTH capture directories: the previous case left a file carrying a
  # legitimate 01 token, which would satisfy this one for the wrong reason.
  rm -rf "$T4/.forge/evidence" "$T4/.forge/shots"
  mkdir -p "$T4/.forge/evidence"
  printf 'x\n' > "$T4/.forge/evidence/slice1-C34-catalogue-390.png"
  printf 'x\n' > "$T4/.forge/evidence/f7-not-in-collection-390.png"
  ( cd "$T4" && node "$S/progress.mjs" ) 2>/dev/null
  grep -q 'carry no screen number' "$H" \
    && ok "the screenmap says when it could not classify a capture" \
    || fail "screenmap reported a silent zero over unclassified captures"
  # And it must not GUESS: "not-in-collection" is an aisle-check verdict, not
  # the collection screen. A wrong screen is worse than an unassigned one.
  # Neither capture carries a 01 or 02 token, so NO screen may claim one. The
  # tempting heuristic would match "catalogue" and "collection" against screen
  # names; "not-in-collection" is an aisle-check verdict and would land on the
  # wrong screen. A wrong screen is worse than an unassigned one.
  grep -q 'srow s-cap' "$H" \
    && fail "screenmap guessed a screen from a name substring" \
    || ok "the screenmap does not guess a screen from a name substring"
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

# Every line lands in exactly one bucket: the four must sum to the rubric.
SUM=$(node -e '
const h=require("fs").readFileSync(process.argv[1],"utf8");
const m=h.match(/([0-9]+) verified · ([0-9]+) evidence(?: · ([0-9]+) in build)? · ([0-9]+) open/);
const u=(h.match(/>([0-9]+) unrecorded</)||[,0])[1];
console.log(m ? (+m[1])+(+m[2])+(+(m[3]||0))+(+m[4])+(+u) : -1);
' "$H8")
[ "$SUM" -eq 4 ] && ok "the rubric states partition every line" \
  || fail "states do not partition the rubric (sum=$SUM of 4)"
rm -rf "$T8"

# 5. The four workflows parse under the runtime grammar (async body, export stripped).
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
    && ok "four workflows parse" || fail "a workflow does not parse"
else
  fail "node not found; workflows unchecked"
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
  T9=$(mktemp -d)
  cp "$ROOT/.claude/agents/verifier.md" "$T9/verifier.md"
  # Strip Edit and Write back out, which is exactly how run two shipped it.
  sed -i.bak -E 's/^tools:.*$/tools: Read, Grep, Glob, Bash, WebFetch/' "$T9/verifier.md"
  rm -f "$T9"/*.bak
  node "$S/seat-check.mjs" "$T9" >/dev/null 2>&1 \
    && fail "seat-check passed a verifier with no way to write a checkbox" \
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
