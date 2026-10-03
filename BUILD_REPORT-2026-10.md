# Forge v2 build report, 3 October 2026

A dated record, like BUILD_REPORT.md for the 17 August build. Approved plan:
`~/.claude/plans/validated-rolling-lynx.md`.

## Why

v1 was tuned for Opus 5 and Fable 5. The one full M run (vitrine) measured:
- **Cost:** $1,911 at list price. Earlier cost.mjs output said $2,599 because it counted every API call once per content block: 2,272 usage lines for 1,227 real calls in the lead transcript alone.
- **Time:** about 120 h of wall clock and 153 dispatches.
- **Lead context:** peaked near 1M tokens.
- **Verification:** took more agent time than building, 29.4 h against 25.2 h.
- **Model pins:** the lead overrode the builder's model on 44 of 44 dispatches.
- **Process markdown:** 5.6 MB of it.

## What v2 is

Seats went from 8 to 7:
- router and finisher are deleted.
- The new oracle seat runs on Fable 5.1, only on mechanical triggers, with a cap of 3 calls per run.
- Every seat pins `claude-opus-5-5`, `claude-sonnet-5-5` or, for the oracle only, `claude-fable-5-1`, each with an explicit effort.

BUILD and VERIFY run as one background workflow, `.claude/workflows/build.js`:
- A builder works each slice, then the deterministic gate `scripts/gate.mjs` checks it.
- The escalation ladder is code, not prose.
- A milestone verifier runs after the core-loop slice, and a final verifier closes the run with one re-judge and one fix round.
- The lead's context holds the return value only.

The rubric is now code:
- **Line kinds:** DOD lines are `check:`, `judge:` or `operator:`.
- **Pinning:** `scripts/arm.sh` pins the approved rubric to a commit.
- **Execution:** `scripts/dod-check.mjs` runs checks from that commit in three states, and could-not-run is never green.
- **V0:** only the final verifier can tick it.
- **Budget:** judge lines are budgeted per size.
- **Craft:** `scripts/craft-suite.sh` makes the disqualifier list checkable.

Hooks stay at 9, retargeted:
- typecheck and lint left the edit path
- runlog logs named seats only
- dod-gate and notify stand down while `.forge/BUILDING` exists
- rehydrate branches on the session source and points to `/forge resume`

`/goal` is gone from arming. Project settings pin `effortLevel: high` and turn off the impeccable and superpowers plugins inside forge projects.

Prompt text dropped from 939 lines (50.5 KB) to 480 lines (30.1 KB). `forge.md` went from 18.1 KB to 8.2 KB. The evidence behind each rule moved to `docs/RATIONALE.md`: 104 entries, so nothing learned is lost.

Retired: `verify-fanout.js`, `defect-sweep.js`, `checks.sh`, and `attempt.sh` (now `attempt.mjs`).

## Verification so far

- `selftest.sh`: every check that does not need git passes. The 10 git-dependent checks fail on this machine because the Xcode license is not accepted, so `git` exits 69. They are reported as failures, never skipped.
- `scripts/build-sim.mjs`: 35 of 35. It runs the workflow's control flow with `agent()` stubbed, covering:
  - the ladder: FAIL, retry, Opus high, stuck
  - partial leading to needs-reslice
  - UNKNOWN leading to blocked
  - resume at a recorded rung
  - milestone ordering
  - re-judge and fix rounds
  - fix mode
  - the parallel L merge
  - a pin on every call
  - the blind squint on the shipped build: the critic sees blurred paths only
- `seat-check.mjs`: 7 seats agree. Mutations for an inherited model, Fable outside the oracle, and a seat without the Bash it needs all fail as they should.
- `guard-test.sh`: 25 ms per fire. `manifest-test.sh`: 8 of 8 pass.
- `cost.mjs --models` on vitrine: exits 1 and names the 44 builder overrides v1 never saw.

## Still to do before merging to main

1. `sudo xcodebuild -license accept`, then create the `forge-v2` branch, commit, and re-run selftest until it is fully green.
2. `/doctor prompt-audit` on the v2 harness, with its findings applied.
3. Benchmark the same S goal on v1 and v2, then one M goal on v2. Acceptance:
   - **S:** v2 at or below 50% of v1 on wall clock and on cost, both at 100% PASS.
   - **M:**
     - 100% PASS
     - at most $5 per rubric line, against vitrine's corrected $15.5
     - lead peak context at most 300K
     - verifier hours at most builder hours
     - zero pin overrides
     - the product judged market ready

## Review and fixes, same day

Four independent reviews (runtime, cost, contracts, platform) and a regression
review of the fixes found 14 defects that would stop a run or let it pass
falsely. All are fixed, each with a fixture in `selftest.sh` or a case in
`build-sim.mjs`:

1. A new project could not arm: arm.sh now starts the repo, and keeps env
   files and BUILDING out of git locally.
2. The plan parser dropped bulleted, bold, backticked, ranged and wrapped
   `Closes:` fields; it now reads them, and `--lint` checks that the slices
   partition the rubric.
3. Operator lines could never close: they no longer hold V0, and the report
   lists them with `dod-check --operator`.
4. Real failures read as could-not-run: every non-zero exit now fails except
   126, 127, 69, a timeout, and curl's unreachable codes.
5. A pipe hid failures: checks run under pipefail, except pipes into
   `grep -q`, which keep grep's verdict.
6. The gate outlived the Bash timeout: settings raise it, and the holdout gets
   its own limit.
7. Parallel merges conflicted on `.forge`: `.forge` merges keep the main
   tree's copy, worktrees get env files and the pinned install, a merge FAIL
   climbs the ladder, and a group stops at its first red member.
8. A rewind erased the run's record: `rewind.sh` resets product paths only.
9. A headless run dropped its build after 10 idle minutes: the wait is now
   unlimited.
10. A product commit hook could unpin the rubric: forge commits skip hooks and
    arm.sh verifies the pinned commit holds the rubric.
11. The ship skill never deployed: it probes the pre-flight.
12. The designer overwrote the merged direction: it keeps it.
13. The suppression scan missed uncommitted and new files and trusted an
    unpinned allow file: fixed, and blocked commits read as UNKNOWN.
14. A failing holdout could not hold V0: `--rule` runs the pinned holdout.

Not yet fixed, by the operator's choice, until the benchmark shows what
matters: the cost caps (sharded final verify, re-judge cap, persisted relaunch
limits, the oracle trigger), session model pinning, the permission allowlist,
and the smaller items in the review.
