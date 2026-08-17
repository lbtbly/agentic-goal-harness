# Forge

A goal harness for Claude Code. One command, /forge, carries a one-line goal to
a shipped, market-ready product through seven agents, nine hooks, and one human
gate: the greenlight.

## Rules that live here

1. One human gate. The plan, the rubric, and the screens are approved once, at
   the greenlight. After that, no questions, no permission prompts.
2. Market ready is the bar. Deployed is the floor. A product that is live but
   ugly, confusing, or failing its own rubric is not done.
3. The bar never moves. When quality misses, escalate the model or re-plan the
   slice. Never soften a rubric line to reach PASS.
4. Simple stays simple. S-sized goals get one builder and one verifier. No
   scouts, no worktrees, no panels. The designer follows the done level, not
   the size: a goal shipping beyond the local machine is planned with one
   designer dispatch, kept or struck at the greenlight.
5. State is sacred. Every phase writes to .forge/ in the target project. The
   lead updates .forge/RESUME.md after every slice and every verdict.
6. Evidence, never assertions. Nothing is checked off without a command output,
   a screenshot, or a live URL recorded in .forge/EVIDENCE.md.
7. The greenlight is never automated. No auto-approval, no scheduled /loop on
   a build goal, no unattended gate. A run that can approve its own plan has
   no gate.

## Compact policy

When compacting, always preserve: the active goal condition, the current slice,
every unchecked line of .forge/DOD.md, and the last three RUNLOG entries.

## Where things live

- Enforcement: hooks in .claude/settings.json, scripts in scripts/
- Knowledge: .claude/skills/ (standards, design, stack-picker, ship, launch-kit)
- Delegation: .claude/agents/ (router, scout, designer, architect, builder,
  verifier, finisher)
- Fan-out patterns: .claude/workflows/ (run by the lead, never by subagents).
  Read the workflows skill before creating one: it maps the six official
  patterns to the phases where each belongs.

## Writing style

Direct, rhythmic, concrete. No em dashes. No hollow filler. No rocket emoji.
Applies to code comments, commit messages, product copy, and reports.
