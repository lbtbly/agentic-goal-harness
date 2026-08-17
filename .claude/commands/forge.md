---
description: Carry a one-line goal to a shipped, market-ready product through one greenlight
argument-hint: "<one-line goal>"
---

# /forge $ARGUMENTS

You are the lead. Run this pipeline exactly. The only stop is the greenlight.

## 0. Setup

Create .forge/ in the current project if absent. Write the goal to
.forge/BRIEF.md. From now on, update .forge/RESUME.md after every phase change,
every slice, and every verdict: last phase, current slice, next action.

## 1. INTAKE

Ask the user with the AskUserQuestion tool, three questions only:
1. Done level: runs locally | deployed live | deployed plus launch assets
2. Hard constraints: platform, deadline, anything banned
3. Taste references: products whose quality bar applies to this goal
Append the answers to .forge/BRIEF.md. Do not ask anything else, now or later.

## 2. SIZE

Delegate to the router agent. It returns S, M, or L plus one reason. Record it.
- S: single feature or page, one evening of work. Skip phases 3 and 4 entirely.
- M: a multi-screen product on one stack.
- L: parallel streams or anything needing fan-out. Note for the user at the
  greenlight that an ultracode session is recommended for the build phase.

## 3. SCOUT (M and L only)

Delegate to the scout agent: market, comparable products, platform
requirements. One page back, saved to .forge/BRIEF.md under Research.

## 4. DESIGN (M and L only)

You, the lead, run the persona panel: build three personas from the research,
then fan out one interviewer pass per persona (use the persona-panel workflow
if available, otherwise three sequential Task calls) probing willingness to
use, objections, and missing table stakes. Synthesize findings.

Then, when the direction is not obvious, run the design-tournament workflow:
generate several directions, filter them against the standards rubric, and let
pairwise judging pick one. Taste decisions are compared, never scored.

Then delegate to the designer agent with the synthesis and the chosen direction: it creates the key
screens in Claude Design through the claude-design MCP server, runs
/design-sync when the repo already holds a design system, and writes
.forge/DESIGN.md with information architecture, screen list with share links,
tokens, and interaction notes. No MCP available: standalone HTML wireframes in
.forge/wireframes/.

## 5. PLAN

Delegate to the architect agent. It consumes BRIEF and DESIGN, picks the stack
and defends the choice in three sentences, breaks the work into vertical
slices that each cross every layer, and writes .forge/PLAN.md plus
.forge/DOD.md under the rubric rules in its instructions.

## 6. GREENLIGHT

Present together, once: the plan, the full rubric, and the Claude Design share
link. Wait for approval. This is the only stop. On approval, create the file
.forge/ARMED (this activates the Stop gate).

## 7. ARM

Set the native goal condition with the /goal command, exactly this shape:
"Every line of .forge/DOD.md checked, with evidence recorded in
.forge/EVIDENCE.md, and a PASS verdict from the verifier agent."

## 8. BUILD

Delegate slices to the builder agent, one slice per dispatch, working from the
Claude Design handoff bundle when available, canvas annotations included. M
and L may parallelize builders in git worktrees. Each green slice becomes a
commit. Record evidence with scripts/evidence.sh as you go.

## 9. VERIFY

Delegate to the verifier agent with a fresh dispatch: it walks the real
product as each persona, compares screens against the approved designs, runs
the full suite, and rules on every rubric line. On FAIL, send its defect list
back to the builder.

On L goals, run the verify-fanout workflow (one agent per rubric line) and,
when the defect count is unknown, the defect-sweep workflow: keep sweeping
until a full pass returns no new defects, never a fixed number of passes.

Escalation ladder, apply without asking:
- Two FAILs on the same slice: re-dispatch the builder with model raised one
  tier (sonnet to opus, opus to the session model).
- Three FAILs on the same slice: send the slice back to the architect for a
  re-plan. The bar never moves; the resources do.

## 10. SHIP

Delegate to the finisher agent: deploy per the ship skill, launch assets when
in scope, then write .forge/REPORT.md with links, screenshots, and the final
rubric state. Remove .forge/ARMED. Announce completion with the report path.

## Resume behavior

If a session starts and .forge/RESUME.md shows an unfinished run, continue
from its next action without re-asking anything. The greenlight is never
re-opened unless DOD.md itself changed.
