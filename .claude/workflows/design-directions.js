// Pattern: generate, then MERGE. Run by the lead during DESIGN when the
// direction is not obvious. Replaces design-tournament.js, which crowned a
// winner.
//
// Two numbers moved this. Nielsen Norman's four-alternative study, which they
// still publish: picking the single best of four scored 56 per cent above the
// average of the four, merging the best ideas from all four scored 70, and one
// iteration on the merged design scored 152. And on pairwise design judgement
// the best measured model agrees with human experts about 66 per cent of the
// time against a human baseline of 85, so a crowned winner discards the better
// direction roughly one time in three.
//
// Deleting the pick deletes the whole apparatus that existed to make the pick
// trustworthy: the filter to three, the bracket, the rotating lenses, the byes.
// That is the largest simplification in this phase and it is bought with the
// strongest evidence in it.
//
// The other change is where the five directions come from. Five hardcoded
// angles are static across every goal, which is the independent-generation
// baseline: it buys +0.039 mean pairwise distance. A per-goal stratification
// call buys +0.173, over four times more, and the divergence clause raises
// quality by +0.38 standardised units rather than trading against it. Five
// agents given five fixed angles produce five variations of one idea.
export const meta = {
  name: 'design-directions',
  description: 'Generate five per-goal design directions, merge the best of all five, iterate once',
  whenToUse: 'DESIGN phase, opt-in: L goals, or M when the taste references pull in different directions',
  phases: [
    { title: 'Stratify', detail: 'five semantic strata for THIS goal' },
    { title: 'Generate', detail: 'one direction per stratum, in parallel' },
    { title: 'Merge', detail: 'best of all five into one, with provenance' },
    { title: 'Iterate', detail: 'exactly one pass on the merged design' },
  ],
}

const STRATA_SCHEMA = {
  type: 'object',
  required: ['strata'],
  properties: {
    strata: {
      type: 'array', minItems: 5, maxItems: 5,
      items: {
        type: 'object',
        required: ['name', 'stance'],
        properties: {
          name: { type: 'string', description: 'Two or three words' },
          stance: { type: 'string', description: 'The design position this stratum takes, specific to this goal, in two sentences. Not a generic adjective.' },
        },
      },
    },
  },
}

const DIRECTION_SCHEMA = {
  type: 'object',
  required: ['name', 'summary', 'loud', 'empty_state', 'list_view'],
  properties: {
    name: { type: 'string' },
    summary: { type: 'string', description: 'Layout, tone, type, colour stance, one signature element. 6-10 sentences.' },
    loud: { type: 'string', description: 'On the primary screen, the ONE element that should pull the eye first, and what pays for it by going quiet.' },
    empty_state: { type: 'string', description: 'What the primary screen looks like holding nothing.' },
    list_view: { type: 'string', description: 'The list or table of the primary object, naming which attribute is rank 1 and which two support it.' },
  },
}

const MERGE_SCHEMA = {
  type: 'object',
  required: ['name', 'summary', 'loud', 'provenance'],
  properties: {
    name: { type: 'string' },
    summary: { type: 'string' },
    loud: { type: 'string' },
    provenance: {
      type: 'array',
      description: 'One row per element taken. Every direction must appear at least once, or carry a written reason it contributed nothing.',
      items: {
        type: 'object',
        required: ['element', 'from', 'why'],
        properties: {
          element: { type: 'string' },
          from: { type: 'string', description: 'The direction name it came from' },
          why: { type: 'string', description: 'Why it won that slot' },
        },
      },
    },
    omitted: { type: 'array', items: { type: 'string' }, description: 'Directions that contributed nothing, each with the reason.' },
  },
}

// Pinned, never inherited: a session on xhigh or on Fable must not leak into
// five parallel generators.
const OPUS = 'claude-opus-5-5'
const goal = (args && args.goal) || 'the goal in .forge/BRIEF.md'
const brief = (args && args.brief) || '.forge/BRIEF.md'

phase('Stratify')

// One planning call, and it comes first so the strata cannot be back-rationalised
// from directions that already exist.
const { strata } = await agent(
  `Read ${brief}. The goal is: ${goal}.

Name five design directions that are genuinely DIFFERENT POSITIONS for THIS product, not five adjectives. A stratum is a stance someone could argue for and someone else could argue against: what the interface is organised around, what it refuses to show, who it is fastest for, what it treats as the unit of work.

Do not produce the generic set. "Minimal", "bold", "playful", "data-first" and "warm" are the same five directions every product gets, and five agents given them return five variations of one idea. Ground each stratum in something specific to this goal: its objects, its actors' jobs, its incumbent, the situation the actor is in when they arrive.

Return exactly five.`,
  { label: 'stratify', phase: 'Stratify', schema: STRATA_SCHEMA, model: OPUS, effort: 'high' }
)

log(`strata: ${strata.map(s => s.name).join(' / ')}`)

phase('Generate')

const directions = (await parallel(strata.map((s, i) => () =>
  agent(
    `Read ${brief} and .forge/SCREENS.md if it exists. The goal is: ${goal}.

Design one direction, taking this stance and only this stance:

  ${s.name}: ${s.stance}

Try to make it stand out from other responses that might be generated for the same goal.

You must describe three things concretely, because a direction that only describes a hero is not comparable to another one:
- the ONE element on the primary screen that pulls the eye first, and what goes quiet to pay for it
- the primary screen holding nothing
- the list or table of the primary object, naming which attribute is rank 1 and which two support it

Design for the actors in the grid: their bands, their stages, their situations. A row at band 1 or below cannot be given a flow that spans surfaces.`,
    { label: `direction:${s.name}`, phase: 'Generate', schema: DIRECTION_SCHEMA, model: OPUS, effort: 'medium' }
  )
))).filter(Boolean)

log(`${directions.length} directions generated`)

phase('Merge')

const merged = await agent(
  `Five design directions for the same goal are below. Merge them into ONE.

${directions.map(d => `## ${d.name}\n${d.summary}\nLOUD: ${d.loud}\nEMPTY: ${d.empty_state}\nLIST: ${d.list_view}`).join('\n\n')}

This is a merge, not a pick and not a collage. Take the strongest element from each and make one coherent design that could not be mistaken for any of the five. Every direction must appear at least once in the provenance, or carry a written reason it contributed nothing.

The failure to avoid has a name: assembling a design from parts of several agents' output ranked LAST of twelve topologies measured, for token starvation and what the authors called the Frankenstein effect. The defence is coherence: this must read as one design somebody decided, not as five designs stapled together. If two elements cannot live in the same product, take one and say so in the omission.

Name the ONE element that pulls the eye first on the primary screen, and what goes quiet to pay for it.`,
  { label: 'merge', phase: 'Merge', schema: MERGE_SCHEMA, model: OPUS, effort: 'high' }
)

log(`merged: ${merged.name}, from ${merged.provenance.length} contributions`)

phase('Iterate')

// Exactly one. The NN/g number is for merge-plus-one-iteration; nothing measured
// says two is better, and an uncapped "iterate until it looks good" loop has no
// evidence behind it and unbounded cost.
const final = await agent(
  `Here is a merged design direction:

${merged.summary}
LOUD: ${merged.loud}

Run exactly ONE iteration pass on it. Sharpen what is vague, cut what is decorative, and resolve anything that reads as two ideas rather than one. Do not restart and do not add a new direction.

Then write the result to .forge/DESIGN.md under "## Direction", followed by a "### Provenance" table with one row per contribution: element, source direction, why it won that slot. Record the omissions too.

State the v1 to v2 diff in three lines at the end: what changed, what was cut, what was kept against pressure.`,
  { label: 'iterate', phase: 'Iterate', model: OPUS, effort: 'high' }
)

return { strata, directions: directions.map(d => d.name), merged: merged.name, provenance: merged.provenance, final }
