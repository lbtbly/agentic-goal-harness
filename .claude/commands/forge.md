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

Delegate to the router agent. It returns S, M, or L plus one reason. Record
"Size: <letter>" with the reason in RESUME.md, and keep that line through
every later rewrite.
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

You, the lead, first write the role census into BRIEF.md under Roles: every
end-user kind, back-office roles by mandate, admin tiers, the operator, each
with its access rights (the design skill holds the format). Then run the
persona panel: three to five personas drawn from the census, one interviewer
pass per persona (use the persona-panel workflow if available, otherwise
sequential Task calls), probing by kind per the design skill. Synthesize
findings, access boundaries included.

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
slices that each cross every layer, and writes .forge/PLAN.md, .forge/DOD.md
and .forge/PREFLIGHT.md under the rules in its instructions.

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

Run scripts/preflight.sh and put its output in GREENLIGHT.md verbatim, under
the heading "Before this can reach a live URL". This is not optional and not a
summary: it is the complete list of what the user must install, create, or
authorise, with real state read from their machine rather than assumed. It does
not block arming. They may approve with items outstanding, and the run then
knows from its first turn that it is deploy-blocked instead of discovering it
mid-build. Run one learned that the Vercel CLI was missing at slice 1, hours
in, and nine rubric lines had been waiting on it the whole time.

Present together, once: the plan, the full rubric, the pre-flight, and the
Claude Design share link. On S goals, no screens exist; GREENLIGHT.md names the craft lines as
the screen contract. The gate is a plan-mode moment, so it is mechanical,
not behavioral: with every gate document already on disk, call EnterPlanMode
and put the greenlight in the plan file. While you wait there you cannot
write, so no /goal paste, no inference, and no eagerness can arm the run;
only the user's native approval ends the wait. This is the only stop. On
approval, leave plan mode and create .forge/ARMED (this activates the Stop
gate). If the screens are rejected, leave plan mode, rework, and re-enter:
the gate stays open until an approval, however many presentations that takes.

## 7. ARM

/goal is a user command; you cannot run it. End the greenlight presentation
with the exact /goal line from PLAN.md for the user to paste with their
approval. If they skip it, the Stop gate still holds the run; rehydrate.sh
re-surfaces the line on every session start until the goal is armed. The
reverse never holds: a /goal paste is not approval. Approval is explicit
words. If the goal arrives while the gate is open, say so, keep waiting, and
never create ARMED; the evaluator's push never outranks the gate.

## 8. BUILD

On a deployed done level, BUILD opens with the skeleton deploy: slice 1 is the
walking skeleton, and the moment it builds, deploy it per the ship skill so the
live URL exists before any line needs it. When scripts/preflight.sh still
reports items outstanding, say so once, build locally, and park the live-URL
lines against the named missing prerequisite. Never re-ask; the pre-flight was
presented at the greenlight and rehydrate.sh re-surfaces it every session.

Delegate slices to the builder agent, one slice per dispatch, working from the
Claude Design handoff bundle when available, canvas annotations included. M
and L may parallelize builders in git worktrees.

Each green slice becomes a commit, and you make it with
`scripts/commit.sh --now "<message>"`, written in the project's voice. This is
a step, not a sentiment: run one wrote this same instruction into the harness
and then went seven and a half hours without a single commit, landing 314 paths
in one lump at shutdown. The hooks now checkpoint underneath you on a throttle,
so the floor is ten minutes, but a checkpoint is a safety net and a slice
commit is history. Record evidence with scripts/evidence.sh as you go.

## 9. VERIFY

Delegate to the verifier agent with a fresh dispatch: it walks the real
product as each persona, compares screens against the approved designs, runs
the full suite, and rules on every rubric line, flipping each passed line to
[x] itself; the checkboxes are the verifier's alone, and the Stop gate reads
them. On FAIL, send its defect list back to the builder. Defects are fixed
by a builder dispatch, never by the lead. Only the user may conclude a run
below one hundred percent; the verdict and each open line then land in
RESUME.md, exactly as written.

The FIRST verify of a slice is full scope. A RE-VERIFY after a FAIL is scoped
to the defect list plus that slice's `Closes:` ids plus any line still `- [ ]`,
and you say so in the dispatch. The architect already guarantees the Closes
lists partition DOD.md exactly, so the index exists; until now nothing but the
progress board read it, and every re-verify re-walked all hundred and twenty
lines, all personas and all screens to confirm one fix. Verification took as
much wall-clock as building.

Then, before SHIP, one FULL-SCOPE verify of the whole rubric against the
finished product. That is where one hundred percent is proven, once, end to
end. The bar does not move: the same lines are ruled on, by the same seat, to
the same thresholds. What stops is proving the settled ones over and over.

On L goals, run the verify-fanout workflow (one agent per UNCHECKED rubric
line, capped, and it logs what the cap dropped) and, when the defect count is
unknown, the defect-sweep workflow: keep sweeping until a full pass returns no
new defects, never a fixed number of passes.

Escalation ladder, apply without asking:
- Two FAILs on the same slice: re-dispatch the builder with model raised one
  tier (sonnet to opus, opus to the session model). The seat pins
  `model: sonnet`, so raising it means passing `model` on the dispatch itself,
  which takes precedence over the frontmatter. Naming the rung without naming
  the mechanism is how a ladder becomes a sentence.
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
