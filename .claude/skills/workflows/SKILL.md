---
name: workflows
description: The two forge workflows, what each is for, and the rules for adding one. Read before creating or changing any workflow.
---

# Workflows

A workflow is a JavaScript file that spawns and coordinates agents with control flow in code. Forge uses one for a single reason: work whose control flow should not live in the lead's context. A loop the lead runs turn by turn grows the lead's context on every pass. A loop in a script costs the lead one launch and one summary.

Only the lead runs workflows. No seat carries the Agent tool.

## The two

**build** (`.claude/workflows/build.js`), on every armed run. One builder per open slice, then the deterministic gate (`scripts/gate.mjs`), with the escalation ladder in code:
- FAIL 1: a retry with the gate output.
- FAIL 2: the builder on Opus at high effort.
- FAIL 3: stuck, which goes back to the lead.

It runs the milestone verifier after the core-loop slice and the final verifier after the last slice. A failed judge line is re-judged once in a fresh context, then gets one fix round.

The lead launches it in the background with `node scripts/slices.mjs --open` as args. The ladder's count lives on disk, so a relaunch resumes at the right rung. `args.fixIds` runs a fix round and a final verify only.

**design-directions** (`.claude/workflows/design-directions.js`), opt-in on L, or on M when the taste references pull in different directions. It stratifies five positions for this goal, generates one direction each, merges the best of all five into one, and iterates once. It never crowns a winner.

## Rules for adding one

- Add a workflow only when control flow would otherwise run through the lead's turns, or when items are independent and numerous (ten or more). Otherwise a single dispatch is cheaper.
- Pin `model` and `effort` on every `agent()` call. Use Opus 5.5 for judgment and building, and Sonnet 5.5 at low effort for running a script and reporting its output. Never inherit, and never use Fable.
- Keep deterministic work in scripts and let agents run them. A script cannot read files, so the lead passes state in `args`.
- Never cap coverage silently. If a workflow bounds its work, it logs what it dropped.
- Never on the greenlight. The gate is never automated, and no /loop runs a build.
