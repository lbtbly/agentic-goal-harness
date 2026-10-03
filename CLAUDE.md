# Forge

A goal harness for Claude Code. One command, /forge, carries a one-line goal to
a shipped, market-ready product through seven seats, one build workflow,
nine hooks, and one human gate: the greenlight.

## Rules that live here

1. One human gate. The plan, the rubric, and the screens are approved once, at
   the greenlight. After that, no questions and no permission prompts.
   Everything the human must install, create, or authorise is named once, at
   the greenlight, in .forge/PREFLIGHT.md. A run never acquires a new human
   dependency mid-build without recording it.
2. Market ready is the bar. Deployed is the floor. A product that is live but
   ugly, confusing, or failing its own rubric is not done.
3. The bar never moves. When quality misses, escalate the model or re-plan the
   slice. Never soften a rubric line to reach PASS. Checks run from the armed
   commit, so the bar cannot be edited after approval either.
4. Simple stays simple. S goals get one or two slices, one builder dispatch
   each, and one verifier: no scout, no worktrees, no workflows beyond build.
   M adds the scout, the designer and a milestone verify. L adds parallel
   builders when scopes are disjoint, and the design-directions workflow. The
   designer follows the done level, not the size: an S goal shipping beyond
   the local machine is planned with one designer dispatch, kept or struck at
   the greenlight.
5. State is sacred. Every phase writes to .forge/ in the target project. The
   lead updates .forge/RESUME.md at every phase change and every workflow
   return. Work that is not committed does not exist: every green slice is a
   commit, and the hooks checkpoint between them, so no session loses more
   than ten minutes.
6. Evidence, never assertions. Nothing is checked off without a command output,
   a capture, or a live URL recorded in .forge/EVIDENCE.md, and boxes move only
   through scripts/dod-check.mjs.
7. The greenlight is never automated. No auto-approval, no scheduled /loop on
   a build goal, no unattended gate. A run that can approve its own plan has
   no gate.
8. A blocked run parks. When nothing actionable remains, write what the run is
   waiting on and rest. Parking is not a question, not a failure, and never a
   softened line: the rubric stands, the gate stays armed, and the next
   session opens on .forge/PARKED. A gate you cannot step away from is a
   livelock, not a bar.
9. Models are pinned, never inherited. Seats and workflow agents run Opus 5.5
   or Sonnet 5.5 at a fixed effort. Fable 5.1 runs only as the oracle, only on
   a trigger listed at the greenlight, and never past the run's cap.

## Compact policy

When compacting, always preserve: the current phase and slice, whether
.forge/BUILDING exists, every unchecked line of .forge/DOD.md, and the last
three RUNLOG entries.

## Where things live

- Enforcement: hooks in .claude/settings.json, scripts in scripts/
- Knowledge: .claude/skills/ (standards, design, stack-picker, compliance,
  ship, launch-kit, workflows)
- Delegation: .claude/agents/ (scout, designer, design-critic, architect,
  builder, verifier, oracle)
- Orchestration: .claude/workflows/ (build, design-directions), run by the
  lead, never by subagents
- Why each rule exists: docs/RATIONALE.md

## Writing style

Direct, rhythmic, concrete. No em dashes. No hollow filler. No rocket emoji.
Applies to code comments, commit messages, product copy, and reports.
