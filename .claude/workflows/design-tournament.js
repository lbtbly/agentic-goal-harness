// Patterns: generate-and-filter, then tournament. Run by the lead during
// DESIGN, after the persona panel, when the direction is not obvious.
// Taste is compared, never scored: judges pick between two, with a reason.
// Judges rotate through distinct lenses so the winner is not one opinion
// repeated (the decorrelated-panel rule).
export const meta = {
  name: 'design-tournament',
  description: 'Generate five design directions, filter against the standards rubric, pick one by pairwise judging',
  whenToUse: 'DESIGN phase on M and L goals when no direction is obviously right',
  phases: [
    { title: 'Generate', detail: 'five directions from five angles' },
    { title: 'Filter', detail: 'rubric check and dedupe, keep three' },
    { title: 'Tournament', detail: 'pairwise judging until one stands' },
    { title: 'Record', detail: 'winner appended to DESIGN.md' },
  ],
}

const ANGLES = [
  'radical simplicity: the fewest screens and words that still deliver the whole loop',
  'craft-forward: one signature interaction or visual idea worth remembering',
  'data-first: the numbers and states are the interface',
  'warmth: tone, copy, and pacing that make it feel handmade',
  'speed: instant loads, optimistic updates, zero waiting as the aesthetic',
]

const DIRECTION_SCHEMA = {
  type: 'object',
  required: ['name', 'summary'],
  properties: {
    name: { type: 'string' },
    summary: { type: 'string', description: 'The direction in 6-10 sentences: layout, tone, type, color stance, one signature element' },
  },
}

const FILTER_SCHEMA = {
  type: 'object',
  required: ['survivors'],
  properties: {
    survivors: {
      type: 'array', maxItems: 3,
      items: DIRECTION_SCHEMA,
    },
  },
}

const candidates = (await parallel(ANGLES.map((angle, i) => () =>
  agent(
    `Read .forge/BRIEF.md, including Research and Panel sections. Propose one ` +
    `design direction for this goal from this angle: ${angle}. ` +
    `Commit to the angle; a hedged direction loses to a clear one.`,
    { label: `direction:${i + 1}`, phase: 'Generate', model: 'sonnet', schema: DIRECTION_SCHEMA },
  )
))).filter(Boolean)

if (candidates.length < 2) {
  return { winner: candidates[0] || null, note: 'not enough candidates for a tournament' }
}

const filtered = await agent(
  'Read .claude/skills/standards/SKILL.md (the rubric source) and ' +
  '.forge/BRIEF.md. From these candidate directions, drop any that fail the ' +
  'standards bar or duplicate another, and return the strongest three at ' +
  'most, rewritten no further:\n\n' +
  candidates.map((c, i) => `--- Candidate ${i + 1}: ${c.name} ---\n${c.summary}`).join('\n\n'),
  { label: 'filter', phase: 'Filter', schema: FILTER_SCHEMA },
)

const LENSES = [
  'first-use clarity: which one does a new user understand in five seconds',
  'craft and restraint: which one would still look intentional after a week of use',
  'fit: which one answers the panel findings and table stakes in BRIEF.md',
]

let bracket = filtered.survivors.filter(Boolean)
let round = 0
while (bracket.length > 1) {
  const next = []
  if (bracket.length % 2 === 1) next.push(bracket.pop()) // bye
  const pairs = []
  for (let i = 0; i < bracket.length; i += 2) pairs.push([bracket[i], bracket[i + 1]])
  const winners = (await parallel(pairs.map((pair, i) => () => {
    const lens = LENSES[(round + i) % LENSES.length]
    return agent(
      `Judge two design directions for the goal in .forge/BRIEF.md (read it ` +
      `first). Judge through one lens only: ${lens}. Compare, never score. ` +
      `Name the winner and one sentence why.\n\n` +
      `--- A: ${pair[0].name} ---\n${pair[0].summary}\n\n` +
      `--- B: ${pair[1].name} ---\n${pair[1].summary}`,
      {
        label: `judge:r${round + 1}m${i + 1}`, phase: 'Tournament',
        schema: {
          type: 'object', required: ['winner'],
          properties: { winner: { type: 'string', enum: ['A', 'B'] }, reason: { type: 'string' } },
        },
      },
    ).then(v => (v && v.winner === 'B' ? pair[1] : pair[0]))
  }))).filter(Boolean)
  bracket = next.concat(winners)
  round += 1
}

const winner = bracket[0]

await agent(
  `Append a "## Direction" section to .forge/DESIGN.md (create the file if ` +
  `absent), containing exactly this, keeping the rest of the file intact:\n\n` +
  `${winner.name}\n\n${winner.summary}`,
  { label: 'record', phase: 'Record', model: 'haiku' },
)

return { winner, rounds: round }
