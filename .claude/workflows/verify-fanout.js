// Pattern: adversarial verification, one agent per rubric line. L goals only,
// run by the lead during VERIFY. PASS exists only at one hundred percent;
// that ruling is computed here in script code, not by any agent.
export const meta = {
  name: 'verify-fanout',
  description: 'One adversarial verifier per unchecked rubric line, ruling computed at 100 percent only',
  whenToUse: 'VERIFY phase on L goals, when the rubric is too wide for one verifier pass',
  phases: [
    { title: 'Collect', detail: 'unchecked lines from DOD.md' },
    { title: 'Verify', detail: 'one verifier per line, evidence or a defect' },
    { title: 'Rule', detail: 'PASS at 100 percent, ruling appended to RUNLOG.md' },
  ],
}

const LINES_SCHEMA = {
  type: 'object',
  required: ['lines'],
  properties: { lines: { type: 'array', items: { type: 'string' } } },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['pass'],
  properties: {
    pass: { type: 'boolean' },
    evidence: { type: 'string' },
    defect: { type: 'string' },
  },
}

const collected = await agent(
  'Read .forge/DOD.md and return every unchecked rubric line (lines starting ' +
  'with "- [ ]"), verbatim, one array entry per line. Return an empty array ' +
  'if none remain.',
  { label: 'collect', phase: 'Collect', schema: LINES_SCHEMA },
)

if (collected.lines.length === 0) {
  return { ruling: 'PASS', note: 'no unchecked lines remained', defects: [] }
}

const verdicts = await pipeline(collected.lines, (line, _item, i) =>
  agent(
    `You verify one rubric line for a forge build. You did not build it; ` +
    `hunt for the reason it is not done. The line: "${line}". ` +
    `Run the real check: load the product, run the command, capture the ` +
    `output. Pass only with evidence you produced this dispatch, recorded ` +
    `via scripts/evidence.sh with the line reference. Otherwise fail it ` +
    `with one defect: where, what, which rubric line. Never soften the line.`,
    { label: `line:${i + 1}`, phase: 'Verify', model: 'sonnet', schema: VERDICT_SCHEMA },
  ).then(v => ({ line, ...v })),
)

const usable = verdicts.filter(Boolean)
const lost = collected.lines.length - usable.length
const defects = usable.filter(v => !v.pass)
  .map(v => ({ line: v.line, defect: v.defect || 'failed without a stated defect' }))
const ruling = defects.length === 0 && lost === 0 ? 'PASS' : 'FAIL'
if (lost > 0) log(`${lost} verifier(s) returned nothing; those lines count as unverified, so the ruling cannot be PASS`)

await agent(
  `Append one entry to .forge/RUNLOG.md (create it if absent), exactly this ` +
  `content on new lines, nothing else:\n` +
  `verify-fanout | ${ruling} | ${usable.length - defects.length}/${collected.lines.length} lines passed` +
  (defects.length ? `\n` + defects.map((d, i) => `defect ${i + 1}: ${d.defect} [${d.line}]`).join('\n') : ''),
  { label: 'runlog', phase: 'Rule', model: 'haiku' },
)

return { ruling, checked: collected.lines.length, unverified: lost, defects }
