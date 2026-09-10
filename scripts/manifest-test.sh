#!/usr/bin/env bash
# Does the drift loop converge, and does it ever lie?
H=/Users/lambertbouley/Claude/agentic-goal-harness
M="$H/scripts/manifest.mjs"
T=/tmp/mtest
pass=0; fail=0
ok () { pass=$((pass+1)); echo "  ok   $1"; }
no () { fail=$((fail+1)); echo "  FAIL $1"; }

fresh () {
  cd /tmp && rm -rf ./mtest && mkdir -p mtest/scripts mtest/.claude/agents
  # The real damage, reproduced: a gate stub, a missing script, a local edit.
  printf '#!/usr/bin/env bash\n# stub\nexit 0\n' > mtest/scripts/dod-gate.sh
  cp "$H/.claude/agents/router.md" mtest/.claude/agents/router.md
  printf '\n# a local edit\n' >> mtest/.claude/agents/router.md
}

echo "--- a first install is never reported clean ---"
fresh
node "$M" check "$T" >/dev/null 2>&1 && no "check passed on an unsynced target" || ok "check fails on an unsynced target"

echo "--- plain sync lands what never arrived, keeps what it cannot judge ---"
fresh
out=$(node "$M" sync "$T" 2>&1)
echo "$out" | grep -q "never arrived" && ok "absent files are written and named" || no "absent files not reported"
[ "$(wc -c < $T/scripts/dod-gate.sh)" -lt 100 ] && ok "the unknown gate stub is preserved, not clobbered" || no "an unjudgeable file was overwritten"

echo "--- and it does NOT then report clean ---"
node "$M" check "$T" >/dev/null 2>&1 && no "reported clean while the gate was a stub" || ok "refuses to report clean while files differ"

echo "--- the baseline records what is on disk, not what we wish were there ---"
python3 - "$T" "$H" <<'PY'
import json,sys,hashlib,os
t,h=sys.argv[1],sys.argv[2]
m=json.load(open(os.path.join(t,'.forge/MANIFEST.json')))
disk=hashlib.sha256(open(os.path.join(t,'scripts/dod-gate.sh'),'rb').read()).hexdigest()
har=hashlib.sha256(open(os.path.join(h,'scripts/dod-gate.sh'),'rb').read()).hexdigest()
rec=m['files']['scripts/dod-gate.sh']
print("  ok   baseline records the real on-disk hash" if rec==disk
      else "  FAIL baseline recorded the harness hash for a file it kept")
print("  ok   and that hash is not the harness's" if rec!=har else "  FAIL indistinguishable")
PY

echo "--- second sync closes it, because the file is now provably stale ---"
node "$M" sync "$T" >/dev/null 2>&1
[ "$(wc -c < $T/scripts/dod-gate.sh)" -gt 3000 ] && ok "the gate is the real gate now" || no "the gate never got fixed"
node "$M" check "$T" >/dev/null 2>&1 && ok "check finally reports clean, and only when it is" || no "still dirty after two syncs"

echo "--- a deliberate edit survives sync ---"
printf '\n# deliberate\n' >> "$T/scripts/dod-gate.sh"
node "$M" sync "$T" >/dev/null 2>&1
grep -q '# deliberate' "$T/scripts/dod-gate.sh" && ok "a real local edit is preserved" || no "sync discarded a local edit"
node "$M" sync "$T" --force >/dev/null 2>&1
grep -q '# deliberate' "$T/scripts/dod-gate.sh" && no "--force did not overwrite" || ok "--force overwrites a local edit"

echo
echo "  passed $pass, failed $fail"
cd /tmp && rm -rf ./mtest
[ "$fail" -eq 0 ]
