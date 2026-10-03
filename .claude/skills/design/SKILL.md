---
name: design
description: The Actors grid, the screen grid, and the Claude Design runbook for the forge pipeline.
---

# Design

Two artifacts carry this phase. The Actors grid says who the product is for and
what binds because of it. The screen grid says what gets built. Everything else
here serves one of those two.

## The Actors grid

Written into BRIEF.md under `## Actors`, by the scout on M and L goals and by
the lead on S. It replaces the old role census and the persona panel both.

**One row is an actor-JOB pair, not a person and not a role.** Two people in the
same role who differ in proficiency and trigger need different interfaces; two
people in different roles with the same job usually need the same one. Role
stays a column, because PLAN.md's capability matrix and its seeded test
identities key on it. Two rows may share a Role and differ in Job. Two rows may
never share both.

Three to six rows, fixed before the first row is written. Two on an S goal: the
user's primary job, and the operator.

    ### R1 · <role> · <job>
    type:       executor-primary | executor-secondary | purchaser | support | served | negative
    role:       the census label, lowercase-hyphenated. A join key.
    job:        verb + object of control + contextual clarifier, solution-free
    situation:  one sentence beginning "When ". An observed circumstance.
    outcome:    minimize|maximize + unit of measure + object of control + clarifier
    band:       below-1 | 1 | 2 | 3
    steps:      N, the declared action budget for this row's job
    stage:      novice | advanced-beginner | competent | proficient | expert
    vocab-uses: at most five terms, each quotable from a retrieved source
    vocab-unknown: at most five terms
    incumbent:  a named product, or "by hand: <how>"
    anxiety:    <fear about the new thing> -> <reassurance surface>
    habit:      <what must carry over> -> <migration surface>
    constraint: none | SIID:<condition> | SCSI:<condition>

Exactly one row types `executor-primary`. At most two `executor-secondary`, at
most one `negative`.

### What each field binds

- **job** must be statable without naming a screen, a control, or a product. If
  it names one, it is a solution assumption wearing a job's clothes. It names
  the sections of DESIGN.md: "Locate the record", never "Search bar".
- **situation** binds the entry route and the state the app is in on arrival:
  cold start, deep link, resumed session. It is the highest-yield field here and
  the one the old four-field card lacked entirely.
- **outcome** becomes exactly one DOD Function line carrying the same unit of
  measure and a threshold.
- **band** is PIAAC. Below 1 is 14 per cent of adults, Level 1 is 29, Level 2 is
  26, Level 3 is 5, and 26 per cent cannot use a computer at all. Assign it by
  matching the hardest task the job requires to that band's worked example,
  never from a job title: "senior accountant, therefore Level 3" is a claim
  about five per cent of everyone, professionals included. A cast where every
  row is band 2 or 3 is a claim about a 31 per cent tail and must be defended as
  one. At band 1 or below the flow completes inside one surface with no route
  transitions, affordances are labelled rather than iconic, and nothing requires
  inference across two sources.
- **steps** is why the band is not inert. A prose competence label produces no
  novice behaviour and no novice design; only an enforced number does. The E2E
  trace prints the discrete action count and the rubric compares it to this.
- **stage** is Dreyfus, and it is a SEPARATE axis from band. A Level 3 domain
  novice is common and needs a different interface from a Level 1 domain expert.
  Assign it by what the actor decides WITHOUT consulting a procedure. Novice and
  advanced-beginner mean the interface supplies the rule: one decision per
  screen, staged disclosure, confirm-plus-undo on destructive actions, because a
  novice cannot recognise a wrong outcome. Proficient and expert mean it
  supplies the saliences: density, deviation highlighting, undo with no dialog,
  and a keyboard path off the default visual one.
- **anxiety** and **habit** replace a single churn field, because switching has
  two forces and they name two different screens. Each clause must terminate in
  a named surface. A clause that cannot is deleted, not softened.

### What is deliberately absent

Name, photo, age, bio, hobbies, quote. They are presentational, nothing
downstream reads them, and fabricated colour is what a model produces most
fluently and what carries least information. Demographics as a differentiating
column: two rows separated only by demographics are one row wearing two names.
Population shares, importance ratings, willingness to pay: all survey-derived in
the methods that define them, and fabricated here. Slice order comes from the
human at the greenlight.

### Provenance, per cell

Every value ends in one of five tags. No sixth, no untagged cell.

    [B] the user's brief
    [R] published research the scout retrieved, with source and date
    [S] a scout observation of the market itself
    [I] a real artifact the human attached
    [A] assumed

The header carries three lines:

    tier:       proto | desk | qualitative
    assumed:    N        (grep -c '\[A\]' must reproduce it)
    incongruity: one sentence naming the pairing in this cast the model would
                 not have picked by default

`proto` means no retrieved evidence. `desk` means at least 60 per cent of cells
across executor rows are [B], [R] or [S], and every executor row's `band` and
`incumbent` are among them. `qualitative` means the human attached at least one
real transcript. A run may not upgrade its own tier: the figure is computed, and
the greenlight shows it.

The greenlight prints ONLY the `[A]` cells, grouped by row, primary first. That
is the human's whole job on this artifact. Expect `band` and `stage` to be the
hardest to lift off `[A]`; proficiency and authority are exactly the fields
teams assume rather than measure, which is why the gate must show them.

The tags are stripped before the grid reaches the builder or the designer.
Provenance read as instruction turns a citation into a directive.

### What the scout goes and finds

`[R]` is an assignment, not a hope. Digital-skill distribution for this market
rather than the OECD average. Professional-body and sector surveys, government
statistics, published usability studies. The incumbent's real complaints from
reviews and forums. Vocabulary quotable from a retrieved artifact. Named source
and date, or it does not count, and an empty vocab list is honest where a
fabricated one is anti-evidence.

Retrieved research is evidence about that population, not about this product's
users. Better than assumption, weaker than one transcript from somebody who does
the job. The tier says which you have in one word.

## The screen grid

Written to `.forge/SCREENS.md` by the designer. One row per route.

    route | primary object | roles
    | states: ideal / empty / loading / error / partial, each designed or "N/A: <reason>"
    | in: <affordance>@<route>   out: <affordance> -> <route>
    | LOUD: one element    QUIET: one region that paid for it    PRIMARY: one action
    | density: {tier: high|medium|low, rows-above-fold@1440x900: N, chrome-budget: N}
    | columns: <ordered>, identifier marked

Plus, per primary object, the ranked attribute table:

    rank | attribute | type (core|metadata|system) | on-card (yes|no)

Exactly one rank 1. At most three on-card. Rank 1 is the identity of the record,
and it is what makes "which field is loud" a lookup instead of a judgement.

**LOUD is what makes hierarchy checkable.** A blind critic can name a screen's
dominant region correctly and still have no way to know it is the wrong one;
the declared LOUD element is what turns that observation into a defect. Naming
QUIET makes de-emphasis a deliverable, because suppressing a region otherwise
reads as doing less work.

Density predicts where hierarchy fails: single-purpose screens hold, dense ones
do not. Declare it per route and let the rubric compare it to the shipped thing.

Every `manual:` step in a journey appears verbatim in PREFLIGHT.md. Back-office
work that maps to no screen becomes a named human dependency at the gate rather
than a surprise at slice six.

## Claude Design runbook

Server: claude-design, added at user scope:
claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp
Sign in once with /design-login. Verify with /mcp.

Working rules:
- Run /design-sync before designing when the repo holds real components, so
  screens use actual tokens instead of approximations.
- One project per goal. Key screens plus the core flow, not every state.
- Ask Claude Design for two alternative directions on the primary screen,
  merge the strongest elements of both into one, then iterate on it once.
- Inline canvas comments occasionally fail to persist. When feedback matters,
  paste it into the design chat as well.
- Finish with the internal share link (comment access) for the greenlight, and
  the handoff bundle for the builder. The bundle carries design files, chat,
  and annotations; builders read it natively, never from screenshots.
- Then export every approved screen to `.forge/screens/NN-name.png`, numbered to
  match the screen list. The export is the HUMAN's reference at the gate. It is
  not the verifier's diff target: two rasterizers never agree at the pixel, and
  a mock and a build from the same model in the same context agree on being
  wrong together. The verifier rules on structure, tokens and computed
  hierarchy, which are diffable where a cross-renderer image comparison is not.

## DESIGN.md format

1. Information architecture: screens and navigation, ten lines maximum.
2. Screen list: name, share link, local export path, one-line intent.
3. Tokens: the color, type and spacing decisions that bind the builder.
4. Interaction notes: the decisions a builder must not improvise.
5. Motion register: one line naming it, one line defending it for the category.
