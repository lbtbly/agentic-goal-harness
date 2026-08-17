// Pattern: fan-out-and-synthesize. Run by the lead during DESIGN on M and L.
// The script coordinates; agents do all file reads and writes.
export const meta = {
  name: 'persona-panel',
  description: 'Three synthetic user interviews from the brief, synthesized into findings',
  whenToUse: 'DESIGN phase on M and L goals, after scout research lands in BRIEF.md',
  phases: [
    { title: 'Personas', detail: 'build three personas from the brief' },
    { title: 'Interviews', detail: 'one interviewer per persona, in parallel' },
    { title: 'Synthesize', detail: 'findings, table stakes, one risk, written to BRIEF.md' },
  ],
}

const PERSONAS_SCHEMA = {
  type: 'object',
  required: ['personas'],
  properties: {
    personas: {
      type: 'array', minItems: 3, maxItems: 3,
      items: {
        type: 'object',
        required: ['name', 'context', 'motivation', 'churnTrigger'],
        properties: {
          name: { type: 'string' },
          context: { type: 'string' },
          motivation: { type: 'string' },
          churnTrigger: { type: 'string' },
        },
      },
    },
  },
}

const cast = await agent(
  'Read .forge/BRIEF.md, including its Research section. Build exactly three ' +
  'distinct personas for this goal: name, context, motivation, and the one ' +
  'thing that would make them churn. Distinct means different contexts and ' +
  'different reasons to care, not three shades of one user.',
  { label: 'personas', phase: 'Personas', schema: PERSONAS_SCHEMA },
)

const interviews = (await parallel(cast.personas.map((p, i) => () =>
  agent(
    `You are interviewing this persona about the goal in .forge/BRIEF.md ` +
    `(read it first). Persona: ${p.name}. Context: ${p.context}. ` +
    `Motivation: ${p.motivation}. Would churn over: ${p.churnTrigger}. ` +
    `Answer as the persona would, concretely: 1) Would you use this, and ` +
    `what do you use instead today? 2) What is missing before you would pay ` +
    `or return? 3) What annoys you most in comparable products? ` +
    `No hedging, no flattery. Specific complaints beat polite interest.`,
    { label: `interview:${p.name}`, phase: 'Interviews', model: 'sonnet' },
  )
))).filter(Boolean)

const synthesis = await agent(
  'Synthesize these three persona interviews into one page: three findings, ' +
  'three table stakes, one risk. Then append it to .forge/BRIEF.md under a ' +
  'new "## Panel" heading, keeping the rest of the file intact.\n\n' +
  interviews.map((t, i) => `--- Interview ${i + 1} ---\n${t}`).join('\n\n'),
  { label: 'synthesis', phase: 'Synthesize' },
)

return { synthesis }
