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
      type: 'array', minItems: 3, maxItems: 5,
      items: {
        type: 'object',
        required: ['name', 'kind', 'context', 'motivation', 'churnTrigger'],
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: ['end-user', 'back-office', 'operator'] },
          context: { type: 'string' },
          motivation: { type: 'string' },
          churnTrigger: { type: 'string', description: 'what would make them churn, quit, or escalate' },
          accessNote: { type: 'string', description: 'what this role must see and must never see' },
        },
      },
    },
  },
}

const QUESTIONS = {
  'end-user':
    '1) Would you use this, and what do you use instead today? ' +
    '2) What is missing before you would pay or return? ' +
    '3) What annoys you most in comparable products?',
  'back-office':
    '1) What fills your queue, and what makes one case slow? ' +
    '2) What data must you see to do the job, and what must you never see? ' +
    "3) Where does the current tool make you do the system's work by hand?",
  operator:
    '1) What breaks first when real users arrive, and how do you find out? ' +
    '2) What do you do weekly that should be a surface, not a ritual? ' +
    '3) What can this platform tier not carry, and when do you hit that wall?',
}

const cast = await agent(
  'Read .forge/BRIEF.md, including its Roles and Research sections. Draw ' +
  'three to five personas from the role census: one per end-user kind (each ' +
  'B2B2C side is its own kind), one back-office persona when the census ' +
  'carries back-office roles, and the operator. Each: name, kind, context, ' +
  'motivation, the one thing that would make them churn or quit, and what ' +
  'their role must and must never see. Distinct means different contexts ' +
  'and different reasons to care, not shades of one user.',
  { label: 'personas', phase: 'Personas', schema: PERSONAS_SCHEMA },
)

const interviews = (await parallel(cast.personas.map((p, i) => () =>
  agent(
    `You are interviewing this persona about the goal in .forge/BRIEF.md ` +
    `(read it first). Persona: ${p.name} (${p.kind}). Context: ${p.context}. ` +
    `Motivation: ${p.motivation}. Would churn over: ${p.churnTrigger}. ` +
    `${p.accessNote ? `Access: ${p.accessNote}. ` : ''}` +
    `Answer as the persona would, concretely: ` +
    `${QUESTIONS[p.kind] || QUESTIONS['end-user']} ` +
    `No hedging, no flattery. Specific complaints beat polite interest.`,
    { label: `interview:${p.name}`, phase: 'Interviews', model: 'sonnet' },
  )
))).filter(Boolean)

const synthesis = await agent(
  'Synthesize these persona interviews into one page: three findings, ' +
  'three table stakes, one risk, and the access boundaries the interviews ' +
  'surfaced (who must never see what). Then append it to .forge/BRIEF.md ' +
  'under a new "## Panel" heading, keeping the rest of the file intact.\n\n' +
  interviews.map((t, i) => `--- Interview ${i + 1} ---\n${t}`).join('\n\n'),
  { label: 'synthesis', phase: 'Synthesize' },
)

return { synthesis }
