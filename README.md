# Forge starter scaffold

One command, /forge "<one-line goal>", from a sentence to a market-ready product.
One human gate: the greenlight. Everything after it is autonomous.

This scaffold is a starting point, not a finished harness. Unzip it into an
empty git repo, then run the build prompt (PROMPT.md) in Claude Code. The build
audits your previous harness, verifies every file here against current official
docs, fixes drift, completes the TODO markers, and smoke tests the pipeline.

## Layout

- CLAUDE.md                 identity, one-gate rule, compact policy
- .claude/settings.json     nine hooks plus base permissions
- .claude/commands/forge.md the pipeline
- .claude/agents/           seven seats
- .claude/skills/           standards, design, workflows, stack-picker, ship, launch-kit
- .claude/workflows/        four templates covering the six official patterns
- scripts/                  the enforcement and memory layer
- PROMPT.md                 the build prompt to paste into Claude Code

## Conventions

- Target projects get a .forge/ folder: BRIEF, DESIGN, PLAN, DOD, EVIDENCE,
  RUNLOG, RESUME, REPORT. The harness repo itself stays clean.
- Judgment seats (designer, architect, verifier) declare model: inherit and
  follow the session: Opus 5 on standard days, Fable 5 on flagship days.
- Writing style everywhere: direct, no em dashes, no hollow filler, no rocket
  emoji.

## After the build

1. Fill the three slots in .claude/skills/standards/SKILL.md.
2. First real run: /forge with a mid-size product goal.
3. Save ultracode sessions for L goals, Fable 5 sessions for goals that earn it.
