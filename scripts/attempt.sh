#!/usr/bin/env bash
# The escalation ladder's counter. Without it the ladder is a sentence.
#
#   attempt.sh record <slice> <PASS|FAIL>   log a verdict, print the new state
#   attempt.sh state  <slice>               print fails and the rung
#   attempt.sh reset  <slice>               clear after a re-plan
#
# forge.md says two FAILs on the same slice raise the builder's model and three
# send the slice back to the architect. Nothing on disk counted them. DEFECTS.md
# is a flat append with no aggregation and deliberately no clear; RESUME.md
# carries the phase, not the tally; and the compact policy preserves the goal,
# the slice and the unchecked lines, but never the fail count. So the ladder
# reset itself at every compaction, which on a long run means it effectively
# never fired.
#
# The rungs, and why they are in this order. First FAIL re-runs the check with
# the evidence attached rather than escalating: audited verifier false negatives
# run about 24 per cent against false positives of 8.5, so a red verdict is more
# often wrong than a green one, and escalating on it is the expensive branch
# taken on bad information roughly a quarter of the time.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0

LEDGER=.forge/ATTEMPTS.json
CMD=${1:-state}
SLICE=${2:-}
[ -z "$SLICE" ] && { echo "attempt.sh: no slice named" >&2; exit 1; }

python3 - "$LEDGER" "$CMD" "$SLICE" "${3:-}" <<'PY'
import json, os, sys, datetime

ledger, cmd, slice_id, verdict = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

try:
    with open(ledger) as f:
        d = json.load(f)
    if not isinstance(d, dict):
        d = {}
except Exception:
    d = {}

row = d.get(slice_id) or {"fails": 0, "passes": 0, "history": []}
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

if cmd == "record":
    v = (verdict or "").upper()
    if v not in ("PASS", "FAIL"):
        print("attempt.sh: verdict must be PASS or FAIL", file=sys.stderr)
        sys.exit(1)
    if v == "FAIL":
        row["fails"] += 1
    else:
        row["passes"] += 1
    row["history"].append({"ts": now, "verdict": v})
    d[slice_id] = row
    with open(ledger, "w") as f:
        json.dump(d, f, indent=2)
        f.write("\n")
elif cmd == "reset":
    row = {"fails": 0, "passes": 0, "history": [{"ts": now, "verdict": "RESET"}]}
    d[slice_id] = row
    with open(ledger, "w") as f:
        json.dump(d, f, indent=2)
        f.write("\n")
elif cmd != "state":
    print("attempt.sh: unknown command", file=sys.stderr)
    sys.exit(1)

fails = row["fails"]
# The rung is computed here rather than remembered, so it survives a compaction
# and reads the same to whoever asks.
if fails == 0:
    rung = "clear"
    action = "no escalation"
elif fails == 1:
    rung = "re-check"
    action = ("re-run the failing check with the evidence attached before "
              "changing anything; a FAIL is wrong about a quarter of the time")
elif fails == 2:
    rung = "raise the model"
    action = ("re-dispatch the builder with model passed on the dispatch, which "
              "overrides the seat frontmatter; naming the rung is not the mechanism")
else:
    rung = "re-plan"
    action = ("git reset --hard to the pre-slice commit, then send the slice to "
              "the architect with a failure memo. Rewinding beat continuing "
              "87.8 to 62.2 on 82 tasks, and leaving a half-broken tree while "
              "resetting only the conversation was the worst arm of that test")

print(f"slice {slice_id}: {fails} fail(s), {row['passes']} pass(es) | rung: {rung}")
print(f"  {action}")
PY
