---
name: workflows
description: The six dynamic workflow patterns and where each one belongs in the forge pipeline. Read before creating any workflow.
---

# Workflows

Dynamic workflows are JavaScript files that spawn and coordinate subagents,
choosing each agent's model and whether it runs in its own worktree. They exist
to beat three failure modes that a single context window cannot: agentic
laziness (stopping at partial progress), self-preferential bias (grading your
own work), and goal drift (losing constraints across compaction). Those three
are exactly what a Forge run must survive.

Only the lead runs workflows. Subagents cannot spawn subagents.

## The six patterns, mapped

1. **Classify-and-act.** Route by task type. Forge: the router sizes S, M, or L
   at phase 2, and the escalation ladder routes a slice by fail count. Also
   available as intelligence routing: classify a slice, then pick its model.
2. **Fan-out-and-synthesize.** Split, run an agent per step, merge at a barrier.
   Forge: persona-panel.js at DESIGN, parallel builders across worktrees on L.
3. **Adversarial verification.** A separate agent checks each output against a
   rubric. Forge: the verifier seat, and verify-fanout.js one agent per rubric
   line on L.
4. **Generate-and-filter.** Produce many candidates, filter by rubric, dedupe,
   return only what survives. Forge: design-tournament.js at DESIGN, and any
   time the answer is taste based.
5. **Tournament.** N agents attempt the same task differently, then pairwise
   judging picks a winner. Comparative judgment beats absolute scoring. Forge:
   the second half of design-tournament.js, and naming or copy decisions.
6. **Loop until done.** Keep spawning until a stop condition, not a fixed number
   of passes. Forge: defect-sweep.js at VERIFY, looping until a sweep returns no
   new defects.

## Rules of use

- Match the pattern to the phase, never all six to one goal. Most traditional
  coding tasks do not need a panel of five reviewers.
- S goals use no workflows at all. M uses the panel. L adds fan-out verification
  and may use the sweep.
- Quick workflows are legitimate: a two-agent adversarial check on one
  assumption is a workflow.
- Set a token budget in the prompt when a workflow could sprawl, for example
  "use 20k tokens" for a panel.
- Pair with the armed /goal for a hard completion requirement. Pair with /loop
  only for recurring work like triage, never for a one-shot build.
- The ultracode trigger forces workflow creation. Use it to open L-sized build
  sessions; skip it for S and M.
- Save a good workflow by pressing s in the workflow menu; it lands in
  ~/.claude/workflows. Workflows shipped in a skill are templates to adapt, not
  scripts to run verbatim.
