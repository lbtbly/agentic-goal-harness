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
2. Hard constraints: platform, deadline, target market and jurisdiction,
   anything banned
3. Taste references: products whose quality bar applies to this goal

Write .forge/BRIEF.md in exactly this shape, so every later phase reads a
known format:

    # Brief
    Goal: <the one-line goal>
    ## Done level
    ## Hard constraints
    ## Taste references

A declined or empty intake is a hard stop, never a default. If AskUserQuestion
returns nothing, write what is missing to .forge/RESUME.md and stop. Never
proceed on assumed answers. Do not ask anything else, now or later.

## 2. SIZE

Delegate to the router agent. It returns S, M, or L plus one reason. Record it.
- S: single feature or page, one evening of work. Skip phase 3. Phase 4 is
  proposed designer-only when the done level leaves the machine; the
  greenlight decides.
- M: a multi-screen product on one stack.
- L: parallel streams or anything needing fan-out. Note for the user at the
  greenlight that an ultracode session is recommended for the build phase.

## 3. SCOUT (M and L only)

Delegate to the scout agent: market, comparable products, platform
requirements, and current obligations and deadlines for the target market,
primary sources first. One page back, saved to .forge/BRIEF.md under Research.

## 4. DESIGN

On S goals: no panel, no tournament, and the architect's direction card
stands either way. When the done level is deployed or beyond, PLAN.md
proposes one designer dispatch as the first build step, run after approval
with the brief and taste references for the key screen and tokens. Plain
approval keeps it; "approve, skip design" strikes it. A runs-locally S
skips this phase entirely. Everything below is M and L.

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

Before presenting, record the arming line as the last line of .forge/PLAN.md,
exactly:

    /goal Every line of .forge/DOD.md checked, with evidence recorded in .forge/EVIDENCE.md, and a PASS verdict from the verifier agent.

Write .forge/GREENLIGHT.md, phone-sized: the stack in one line, the slice
count, the three rubric lines most likely to be contentious, the Claude Design
share link, the proposed design step to keep or strike on deployed S goals,
and the /goal line to paste. The file states plainly: this is a
summary for approving away from the desk, never a replacement. Approving means
the full rubric applies.

Present together, once: the plan, the full rubric, and the Claude Design share
link. On S goals, no screens exist; GREENLIGHT.md names the craft lines as
the screen contract. Plan mode blocks writes, so leave it before this phase:
the gate documents exist on disk when presented, never only in the
transcript. Wait for approval. This is the only stop. On approval, create
the file .forge/ARMED (this activates the Stop gate).

## 7. ARM

/goal is a user command; you cannot run it. End the greenlight presentation
with the exact /goal line from PLAN.md for the user to paste with their
approval. If they skip it, the Stop gate still holds the run; rehydrate.sh
re-surfaces the line on every session start until the goal is armed.

## 8. BUILD

Delegate slices to the builder agent, one slice per dispatch, working from the
Claude Design handoff bundle when available, canvas annotations included. M
and L may parallelize builders in git worktrees. Each green slice becomes a
commit. Record evidence with scripts/evidence.sh as you go.

## 9. VERIFY

Delegate to the verifier agent with a fresh dispatch: it walks the real
product as each persona, compares screens against the approved designs, runs
the full suite, and rules on every rubric line, flipping each passed line to
[x] itself; the checkboxes are the verifier's alone, and the Stop gate reads
them. On FAIL, send its defect list back to the builder. Defects are fixed
by a builder dispatch, never by the lead. Only the user may conclude a run
below one hundred percent; the verdict and each open line then land in
RESUME.md, exactly as written.

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

Headless resume is bounded: a `claude -p --continue` run may build only when
.forge/ARMED exists and RESUME.md points past the greenlight. Before the
gate, a headless run advances no further than the next human input: it stops
there and writes what it needs to RESUME.md. It never answers intake, never
approves a plan, never re-opens the gate.
