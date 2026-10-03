# Forge

One command, `/forge "<one-line goal>"`, from a sentence to a market-ready
product. One human gate: the greenlight. Everything after it is autonomous.

This README describes the harness. It is not the README of anything Forge
builds, and it must never be copied into a target project: one build shipped
this file verbatim inside a collection-tracking app, which then told strangers
it had seats and a greenlight.

## Layout

- `CLAUDE.md`: identity, the nine rules, compact policy
- `.claude/settings.json`: nine hooks, base permissions, effort and plugin pins
- `.claude/commands/forge.md`: the pipeline, intake to ship
- `.claude/agents/`: seven seats
- `.claude/skills/`: standards, design, workflows, stack-picker, ship,
  launch-kit, compliance
- `.claude/workflows/`: two workflows, build and design-directions
- `scripts/`: the enforcement, rubric, capture and measurement layer
- `docs/RATIONALE.md`: the evidence behind every rule, kept out of the prompts
- `PROMPT.md`, `BUILD_REPORT.md`: dated records of the 17 August 2026 build

The counts above are asserted by `scripts/selftest.sh` against the filesystem,
because a README that can drift silently will.

## The seats

Every seat pins an exact model and effort. Nothing inherits the session.

| Seat | Does | Model, effort |
|---|---|---|
| scout | market research and the Actors grid, M and L | Sonnet 5.5, medium |
| designer | the screen grid, the screens, the design spec | Opus 5.5, high |
| design-critic | judges hierarchy from blurred captures, blind | Sonnet 5.5, medium |
| architect | stack, slices, the executable rubric, holdout, pre-flight | Opus 5.5, high |
| builder | one slice per dispatch, the only writer | Opus 5.5, medium; Sonnet on light slices; Opus high on the second FAIL |
| verifier | milestone and final rulings, fresh context | Opus 5.5, high |
| oracle | a second opinion on a recorded trigger only, capped | Fable 5.1, high |

The lead sizes the goal and ships. The build workflow runs every slice,
the gate, the escalation ladder and the verifier passes, so the lead's context
holds summaries, never phases.

## How a run is held to its rubric

- DOD.md lines carry `check:`, `judge:` or `operator:`. `scripts/arm.sh`
  commits the approved rubric at the greenlight, and `scripts/dod-check.mjs`
  runs every check from that commit, so a command edited after approval is
  ignored.
- Three states everywhere: pass, fail, could-not-run. Could-not-run is
  UNKNOWN and never green.
- `scripts/gate.mjs` is the per-slice gate: pinned typecheck, lint and tests,
  the slice's checks, and a scan for suppressions the slice added.
- `V0 | final verifier PASS` is the last line, ticked only by the final
  verifier when every other line holds. The Stop gate cannot release before it.

## The state a run keeps

Target projects get a `.forge/` folder. The harness repo stays clean.

`BRIEF` (goal, Actors grid, research) · `SCREENS` · `DESIGN` · `PLAN` · `DOD`
· `PREFLIGHT` · `GREENLIGHT` · `ARMED` (the pinned sha and the Fable cap) ·
`BUILDING` (a workflow is running) · `EVIDENCE` · `DEFECTS` · `ATTEMPTS.json`
· `AMENDMENTS` · `RUNLOG` · `RESUME` · `REPORT` · `checks/` · `evidence/` ·
`probes/` (gitignored by the product) · `holdout/` (the verifier's suite)

## Conventions

- Seats pin `claude-opus-5-5`, `claude-sonnet-5-5`, or, for the oracle only,
  `claude-fable-5-1`. No Opus 5, no Haiku, no `inherit`, no `/advisor`.
- Every script no-ops outside a forge project: exit 0, nothing written.
- Writing style everywhere: direct, no em dashes, no hollow filler, no rocket
  emoji.

## Running the checks

    bash scripts/selftest.sh             the regression suite
    node scripts/seat-check.mjs          seat prose and pins against frontmatter
    bash scripts/guard-test.sh scripts/guard.sh
    node scripts/cost.mjs --all          per-seat cost from past transcripts
    node scripts/cost.mjs --models       models actually used against declared pins

`cost.mjs` is retroactive: it reads the transcripts Claude Code already wrote,
counts each API call once, prices 1h cache writes at 2x, and includes
workflow agents.

## After a change to the harness

1. Run the checks above.
2. Update this file, `CLAUDE.md` and `START_HERE.html` in the same branch.
3. Run `node scripts/manifest.mjs record`, then sync the vendored copy in any
   target you are about to test in. `manifest.mjs check <target>` reports
   drift and files the harness no longer ships.
