# Forge

One command, `/forge "<one-line goal>"`, from a sentence to a market-ready
product. One human gate: the greenlight. Everything after it is autonomous.

This README describes the harness. It is not the README of anything Forge
builds, and it must never be copied into a target project: one build shipped
this file verbatim inside a collection-tracking app, which then told strangers
it had seven seats and a greenlight.

## Layout

- `CLAUDE.md` — identity, the eight rules, compact policy
- `.claude/settings.json` — nine hooks, base permissions, the env block
- `.claude/commands/forge.md` — the pipeline, intake to ship
- `.claude/agents/` — eight seats
- `.claude/skills/` — standards, design, workflows, stack-picker, ship,
  launch-kit, compliance
- `.claude/workflows/` — three fan-out patterns the lead may run
- `scripts/` — the enforcement, capture and measurement layer
- `PROMPT.md`, `BUILD_REPORT.md` — dated records of the 17 August 2026 build

The counts above are asserted by `scripts/selftest.sh` against the filesystem,
because a README that can drift silently will. Before this was enforced it
listed six skills where seven existed, and told the operator to fill three slots
in the standards skill that were already written.

## The seats

| Seat | Does | Model |
|---|---|---|
| router | sizes the goal S, M or L | haiku |
| scout | market research and the Actors grid | sonnet |
| designer | the screen grid, the screens, the design spec | inherit |
| design-critic | judges hierarchy from blurred captures, blind | inherit |
| architect | stack, slices, the rubric, the pre-flight | inherit |
| builder | one slice per dispatch, the only writer | sonnet |
| verifier | rules every rubric line, fresh context each time | inherit |
| finisher | deploys, then writes the report | sonnet |

## The state a run keeps

Target projects get a `.forge/` folder. The harness repo stays clean.

`BRIEF` (goal, Actors grid, research) · `SCREENS` · `DESIGN` · `PLAN` · `DOD`
· `PREFLIGHT` · `GREENLIGHT` · `EVIDENCE` · `DEFECTS` · `ATTEMPTS.json` ·
`RUNLOG` · `RESUME` · `REPORT` · `evidence/` (the capture triple) · `probes/`
(one-off scripts, gitignored by the product) · `holdout/` (the verifier's suite,
which the builder never reads)

## Conventions

- Judgment seats declare `model: inherit` and follow the session.
- Every script no-ops outside a forge project: exit 0, nothing written.
- Writing style everywhere: direct, no em dashes, no hollow filler, no rocket
  emoji.

## Running the checks

    bash scripts/selftest.sh        the regression suite
    node scripts/seat-check.mjs     seat prose against seat frontmatter
    bash scripts/guard-test.sh scripts/guard.sh
    node scripts/cost.mjs --all     per-seat cost, read from past transcripts

`cost.mjs` is retroactive: it reads the transcripts Claude Code already wrote,
so it answers "which seat is expensive" for runs that finished months ago
without any telemetry having been switched on.

## After a change to the harness

1. Run the three checks above.
2. Update this file and `START_HERE.html` in the same branch.
3. Sync the vendored copy in any target project you are about to test in, or the
   trial exercises the old harness. `scripts/manifest.mjs` reports the drift.
