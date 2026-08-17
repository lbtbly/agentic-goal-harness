// Pattern: loop until done. Run by the lead at VERIFY when the defect count
// is unknown. The exit is a full sweep that finds nothing new, never a fixed
// number of passes; round 8 is a hard ceiling, not the exit.
export const meta = {
  name: 'defect-sweep',
  description: 'Sweep the product for defects area by area, fix, and repeat until a full sweep finds nothing new',
  whenToUse: 'VERIFY phase on L goals when the defect count is unknown',
  phases: [
    { title: 'Map', detail: 'areas to sweep, from the design and the plan' },
    { title: 'Sweep', detail: 'one sweeper per area, rounds until dry' },
    { title: 'Fix', detail: 'one dispatch per round of fresh defects' },
    { title: 'Record', detail: 'summary appended to RUNLOG.md' },
  ],
}

const AREAS_SCHEMA = {
  type: 'object',
  required: ['areas'],
  properties: { areas: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string' } } },
}

const DEFECTS_SCHEMA = {
  type: 'object',
  required: ['defects'],
  properties: {
    defects: {
      type: 'array',
      items: {
        type: 'object',
        required: ['where', 'what'],
        properties: {
          where: { type: 'string', description: 'file, screen, or route' },
          what: { type: 'string', description: 'the defect, one line' },
          rubricLine: { type: 'string' },
        },
      },
    },
  },
}

const mapped = await agent(
  'Read .forge/DESIGN.md and .forge/PLAN.md. Return the distinct areas of ' +
  'this product a defect sweep should cover: screens, flows, and cross-' +
  'cutting concerns like empty and error states. Six areas at most.',
  { label: 'map', phase: 'Map', schema: AREAS_SCHEMA },
)
const areas = (args && args.areas) || mapped.areas

const key = d => `${d.where}::${d.what}`.toLowerCase().replace(/\s+/g, ' ').trim()
const seen = new Set()
const all = []
let round = 0

while (round < 8) {
  const found = (await parallel(areas.map(area => () =>
    agent(
      `Sweep one area of this forge build for defects: ${area}. ` +
      `Read .forge/DOD.md and .claude/skills/standards/SKILL.md for the bar, ` +
      `then exercise the area for real: run it, click it, resize it, break ` +
      `it. Report every defect: placeholder copy, missing states, console ` +
      `errors, layout breaks, rubric misses. An empty list means the area ` +
      `is clean, not that you ran out of patience.`,
      { label: `sweep:${area}`, phase: 'Sweep', model: 'sonnet', schema: DEFECTS_SCHEMA },
    )
  ))).filter(Boolean).flatMap(r => r.defects)

  const fresh = found.filter(d => !seen.has(key(d)))
  log(`round ${round + 1}: ${found.length} reported, ${fresh.length} new`)
  if (fresh.length === 0) break // the real exit

  fresh.forEach(d => { seen.add(key(d)); all.push(d) })
  await agent(
    'Fix exactly these defects in the codebase, nothing else. Work from ' +
    '.forge/PLAN.md and the design bundle; commit when green. Defects:\n' +
    fresh.map((d, i) => `${i + 1}. ${d.where}: ${d.what}${d.rubricLine ? ` [${d.rubricLine}]` : ''}`).join('\n'),
    { label: `fix:round${round + 1}`, phase: 'Fix', model: 'sonnet' },
  )
  round += 1
}

const dry = round < 8
await agent(
  `Append one line to .forge/RUNLOG.md (create it if absent), exactly:\n` +
  `defect-sweep | ${dry ? 'clean' : 'ceiling'} | ${all.length} defect(s) over ${round + (dry ? 1 : 0)} sweep(s)`,
  { label: 'runlog', phase: 'Record', model: 'haiku' },
)

if (!dry) log('hit the 8-round ceiling with defects still appearing; the run is not clean')
return { clean: dry, rounds: round + (dry ? 1 : 0), defects: all }
