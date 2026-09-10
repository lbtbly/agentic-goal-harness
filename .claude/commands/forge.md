---
description: Carry a one-line goal to a shipped, market-ready product through one greenlight
argument-hint: "<one-line goal>"
---

# /forge $ARGUMENTS

You are the lead. Run this pipeline exactly. The only stop is the greenlight.

## What the lead carries

You are the most expensive seat in the run and the only one with no model pin,
no effort setting and no turn cap. Across three measured runs you were 30.8,
37.4 and 37.7 per cent of total cost, and your cache reads reached 1.46 billion
tokens in one session. Seven seats were tuned and you were not, because nobody
counted you.

Hold three things and nothing else: .forge/RESUME.md, the current slice, and the
rubric ids in flight. Never a verdict body, never an evidence dump, never a
builder's output. Every phase result you need is a file you re-read on demand,
not a payload you carry from the phase that produced it.

Ask every seat for a summary under two thousand tokens that cites file paths
rather than restating their contents. A seat that returns its work instead of a
pointer to its work has moved its context into yours, where it is re-read on
every turn for the rest of the run.

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

What you hand a verifier is the contract, and it is a short list: the diff, the
rubric lines in its scope, and paths to the evidence. Never the builder's
RUNLOG, never its reasoning, never a summary of what it tried. A reviewer who
sees the advocate's framing checks the code against itself instead of against
the rubric, and that is the whole reason this seat is separate. Verification is
25 to 29 per cent of an M or L run's cost, near parity with the builder, so a
dispatch handed the wrong context is expensive twice over: it costs more and it
judges worse.

Where the account allows it, pin the verifier to a different model family than
the builder. Top judges disagree on about four fifths of their errors, so
family diversity buys coverage for a config change and no extra dispatch.

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

Escalation ladder, apply without asking. Record every verdict the moment it
lands with `scripts/attempt.sh record <slice> <PASS|FAIL>`, and read the rung
back with `scripts/attempt.sh state <slice>`. The counter is the ladder: until
this existed nothing on disk counted fails per slice, DEFECTS.md is a flat
append with no aggregation, and the compact policy preserves the goal, the
slice and the unchecked lines but never the tally. So the ladder reset itself
at every compaction, which on a long run means it never fired.

- First FAIL: re-run the failing check with the evidence attached. Do not
  escalate and do not rebuild yet. Audited verifier false negatives run about
  24 per cent against false positives of 8.5, so a red verdict is more often
  wrong than a green one, and escalating on it takes the expensive branch on
  bad information a quarter of the time.
- Two FAILs on the same slice: re-dispatch the builder with model raised one
  tier (sonnet to opus, opus to the session model). The seat pins
  `model: sonnet`, so raising it means passing `model` on the dispatch itself,
  which takes precedence over the frontmatter. Naming the rung without naming
  the mechanism is how a ladder becomes a sentence. On a UI or craft line,
  re-specify the brief before raising the model: on identical prompts the gap
  between a vague and a specific brief measured wider than the gap between two
  models.
- Three FAILs on the same slice: `git reset --hard` to the pre-slice commit,
  then send the slice to the architect with a short failure memo, and
  `attempt.sh reset <slice>`. Rewind, do not continue: on 82 engineering tasks
  rewind-with-memory beat continue-from-failure 87.8 to 62.2 per cent, and the
  ablation is the load-bearing part, because resetting the conversation while
  leaving a half-broken tree was the worst arm of the three. That means the
  pre-slice commit must exist: commit before dispatching a builder, not only
  after a green verdict. The bar never moves; the resources do.

## Parallel builders, when the scopes are genuinely disjoint

M and L may run two or three builders at once, and the unit of disjointness is
the feature and the interface, never the file. One builder on a sharing surface
and one on an unrelated server-side algorithm do not collide; two on the same
feature do, however carefully they divide the files.

The reason to be careful is not merge conflicts, which git handles. It is that
parallel writers make independent implicit decisions about style, edge cases
and patterns, and three failure modes survive perfect feature-level separation:

- Shared surfaces. Two independent features still both reach the tokens, the
  component library, the API client, the shared types, the schema and
  migrations, the router, auth. A client half and a server half share the
  contract between them by construction, so a clean merge proves nothing.
- Precedent drift. The builder matches the nearest precedent in the repo, and a
  builder branched before its sibling landed can only match the older one.
- The worktree base. `isolation: worktree` branches from the DEFAULT branch, not
  the parent session's HEAD, so builders in worktrees cannot see each other's
  work at all, and a builder on slice 4 starts from a tree missing slices 1-3.

So the test is a set intersection the architect can run at plan time, and every
condition must hold:

1. Each slice in PLAN.md declares its write scope: the routes and modules it
   may touch, and whether it claims any shared surface from the list above.
2. Two slices may run at once only if their write scopes are disjoint AND
   neither claims a shared surface. A slice touching a shared surface runs
   alone.
3. Where two parallel slices meet, the architect writes and commits the contract
   between them BEFORE either dispatches. Without that they are not disjoint,
   they are coupled through an unwritten agreement.
4. Both builders branch from the same commit, so both match the same precedent.
   A style divergence found at merge is a defect against the later slice.
5. Merge serially and run the full check between. Never merge both and verify
   once.
6. Two or three, L only. S and M stay serial under rule 4.

The gain is wall clock, never tokens: parallel dispatches always consume more
than the serial equivalent. Buy it when the streams are genuinely independent
and say so plainly; never present it as a saving.

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
