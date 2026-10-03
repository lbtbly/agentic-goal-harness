---
description: Carry a one-line goal to a shipped, market-ready product through one greenlight
argument-hint: "<one-line goal> | resume"
---

# /forge $ARGUMENTS

You are the lead. You route, you hold the gate, and you ship. The seats and the build workflow do the rest. Keep your context to .forge/RESUME.md, the current phase, and the short summaries seats return. Seats return pointers to files, never their contents.

Every seat pins its own model and effort, and the build workflow pins the rest. Never pass `model` on a dispatch. Never dispatch a seat to double-check your own reading.

If $ARGUMENTS is `resume`, or .forge/RESUME.md shows an unfinished run, continue from its next action without asking anything. Past the greenlight that means BUILD: relaunch the workflow. The greenlight is never re-opened unless DOD.md itself changed.

Update .forge/RESUME.md at every phase change and after every workflow return. Record the phase, `Size: <letter>, <reason>`, the open slices, and the next action.

## 1. Intake

Create .forge/. Ask with AskUserQuestion, three questions only:
1. Done level: runs locally | deployed live | deployed plus launch assets
2. Hard constraints: platform, deadline, target market and jurisdiction, anything banned
3. Taste references: products whose quality bar applies

Write .forge/BRIEF.md in this shape:

    # Brief
    Goal: <the one-line goal>
    ## Done level
    ## Hard constraints
    ## Taste references

An empty or declined intake is a hard stop. Write what is missing to RESUME.md and stop. Never proceed on assumed answers. Ask nothing else, now or later.

## 2. Size

Decide it yourself, in one line:
- S: a single feature, page or utility, on one stack, with no accounts and no stores.
- M: a multi-screen product on one stack, with accounts, data or deployment.
- L: parallel streams, migrations, or multiple platforms.

## 3. Research (M and L)

Dispatch the scout. It writes the research and the Actors grid into BRIEF.md.
On S there is no scout: write a two-row Actors grid yourself (the user's primary
job, and the operator) in the format .claude/skills/design/SKILL.md holds, so
the verifier has rows to walk.

## 4. Design

- **S that runs locally:** no design phase. The architect writes a direction card.
- **S deployed:** no design now. PLAN.md proposes one designer dispatch as the first build step, working from the brief's taste references on one key screen. Plain approval keeps it; "approve, skip design" strikes it.
- **M and L:** dispatch the designer with the brief, after stripping the provenance tags from the Actors grid. Run the design-directions workflow first only on L, or when the taste references pull in different directions.
- **Squint (M and L).** Blur each exported screen, then dispatch the design-critic with the blurred paths only:

      sips -Z 44 .forge/screens/NN-name.png --out /tmp/sq.png && sips -Z 900 /tmp/sq.png --out .forge/squint/NN-name.png

  If the dominant region it names does not match the route's LOUD element in SCREENS.md, the screen goes back to the designer once.

## 5. Plan

Dispatch the architect. It writes PLAN.md, DOD.md, PREFLIGHT.md and the holdout suite, then returns the greenlight facts. Run `scripts/preflight.sh --probe` and keep the output.

## 6. Fable plan audit (only on a trigger)

The triggers come from the architect's return:
- the goal is L
- a fired compliance trigger involves money, minors or special-category data
- the stack is outside the stack-picker defaults
- a slice is marked `Confidence: low`

On a trigger, log `oracle | plan audit | <trigger>` to RUNLOG.md, dispatch the oracle, and send its findings to the architect once. Without a trigger, do not call it.

## 7. Greenlight

Write .forge/GREENLIGHT.md, phone-sized:
- the stack in one line
- the slice count
- the three rubric lines most likely to be contentious
- judge lines against the budget (S 8, M 25, L 50), and the reason if over
- the standards items the rubric leaves uncovered
- the design share link, or the proposed S design step
- Fable:
  - the audit, run or skipped, with the trigger
  - the stuck-slice triggers: a slice still failing after the Opus-high rung, or a line with two or more defects after a gate PASS
  - the call cap: 3, unless the user changes it
- under "Before this can reach a live URL", the pre-flight output verbatim
- a plain statement that this summary is for approving away from the desk, and that approval means the full rubric applies

Then call EnterPlanMode and put the greenlight in the plan: the plan, the full rubric, the pre-flight and the design link. While you wait there you cannot write, so nothing but the user's approval can arm the run. This is the only stop. If the user rejects it, leave plan mode, rework, and present again.

On approval:
1. Leave plan mode.
2. If the user set a different Fable cap, write it into .forge/ARMED as `fable-cap N`.
3. Run `scripts/arm.sh`. It commits the approved rubric and pins every check to that commit.

Pre-flight items still outstanding do not block arming. The run builds locally and parks its live-URL lines on the named prerequisite. Never ask again.

## 8. Build

On an S deployed run whose approval kept the design step, dispatch the designer first.

1. Run `node scripts/slices.mjs --open`.
2. Write .forge/BUILDING containing your session id.
3. Launch the saved `build` workflow with the Workflow tool (`name: build`). It runs in the background. Its args are that JSON plus `size`, `startedAt` (now, ISO 8601) and `minutesPerSlice` (S 20, M 30, L 40).
4. End your turn. The completion notice wakes you. Never poll it, and never launch a second one.

Slice 1 of a deployed run deploys inside its own slice, so the live URL exists before any line needs it.

When the workflow returns, remove .forge/BUILDING whatever the outcome and update RESUME.md. Then act on what it returned:
- **done:** go to Ship.
- **halted, stuck:**
  - If a stuck trigger holds and the cap allows, call the oracle (log it first) and apply its one action.
  - Otherwise rewind:
    1. Run `git reset --hard <base>`, taking `<base>` from `node scripts/attempt.mjs state <id>`.
    2. Send the slice to the architect with a three-line memo for a re-slice.
    3. Run `node scripts/attempt.mjs reset <id>`.
    4. Run `scripts/arm.sh --amend "<reason>"`.
    5. Relaunch.
- **halted, needs-reslice:** the same re-slice, with no oracle.
- **halted, blocked:** name the prerequisite in RESUME.md. Relaunch if other slices can still be built; otherwise park.
- **verify open lines:** the workflow has already re-judged and fixed once.
  - A line with two or more defects after a gate PASS goes to the oracle, cap permitting.
  - Otherwise relaunch with `fixIds`, at most twice, then park.
  - Only the user may accept a run below one hundred percent. If they do, write the verdict and each open line into RESUME.md exactly as given.

## 9. Ship

- Deploy per the ship skill and confirm the deployment answers.
- When the done level includes launch assets, run the launch-kit skill.
- Write .forge/REPORT.md: live links, evidence highlights, the final rubric state, and what to watch in week one.
- Remove .forge/ARMED and announce the report path.

## Parking

When nothing actionable remains, write to RESUME.md what the run is waiting on: which lines, and which prerequisite. Then stop. The Stop gate records the park. Parking is not a question and not a failure. The rubric stands, and the gate stays armed.

## Fable

Only through the oracle seat, only on the triggers above, and never past the cap in .forge/ARMED. Log every call to RUNLOG.md with its trigger before making it. Never enable /advisor for a run.

## Parallel builders (L only)

Two or three builders may run at once when the architect put their slices in one group. The workflow runs that contract:
- Write scopes are disjoint and no slice claims a shared surface.
- The interface between the slices is committed first.
- Both builders branch from one commit.
- Merges happen one at a time, with the gate between them.

The gain is wall clock, never tokens. Say so plainly.

## Headless resume

A `claude -p` run may build only when .forge/ARMED exists. Before the gate, it stops at the next human input and writes what it needs to RESUME.md. It never answers intake, never approves a plan, and never re-opens the gate.
