// BUILD and VERIFY for an armed forge run. Launched by the lead in the
// background with `node scripts/slices.mjs --open` as args; the lead's context
// holds only what this returns.
//
// args: { slices, milestone, screens, size: 'S'|'M'|'L', startedAt,
//         minutesPerSlice, fixIds?: [ids] }   fixIds skips building and runs one fix round
//
// The ladder lives here, in code, and its count lives on disk (attempt.mjs),
// so a relaunch resumes at the right rung:
//   gate FAIL 1  re-dispatch the builder with the gate output
//   gate FAIL 2  re-dispatch on Opus at high effort
//   gate FAIL 3  stuck: back to the lead (oracle on trigger, else rewind)
//   partial      one continuation on the same model, then needs-reslice
//   UNKNOWN      blocked: the environment, not the build; never a FAIL
export const meta = {
  name: 'build',
  description: 'Forge BUILD and VERIFY: one builder per open slice, a deterministic gate, the escalation ladder in code, then the milestone and final verifier',
  whenToUse: 'After the greenlight. The lead launches it with node scripts/slices.mjs --open as args.',
  phases: [
    { title: 'Build', detail: 'builder, then the deterministic gate, per slice' },
    { title: 'Verify', detail: 'milestone and final verifier, fresh context' },
    { title: 'Fix', detail: 'failed lines back to a builder, then the gate' },
  ],
}

const A = args || {}
const OPUS = 'claude-opus-5-5'
const SONNET = 'claude-sonnet-5-5'
const MIN = A.minutesPerSlice || 30
const slices = A.slices || []
const report = []

const BUILT = {
  type: 'object', required: ['status', 'summary'],
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    summary: { type: 'string', description: 'Under 120 words, paths not contents' },
    branch: { type: 'string', description: 'Worktree dispatches only: the branch holding the slice commit' },
  },
}
const GATE = {
  type: 'object', required: ['verdict', 'summary'],
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL', 'UNKNOWN'] },
    summary: { type: 'string' },
  },
}
const VERDICT = {
  type: 'object', required: ['verdict', 'failing', 'summary'],
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL', 'UNKNOWN'] },
    failing: { type: 'array', items: { type: 'string' }, description: 'Every failing rubric id' },
    judgeFailing: { type: 'array', items: { type: 'string' }, description: 'The failing ids that are judge: lines' },
    unknown: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string', description: 'Under 300 words' },
  },
}
const SHA = { type: 'object', required: ['sha'], properties: { sha: { type: 'string' } } }
const SHOTS = {
  type: 'object', required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', required: ['path', 'route', 'loud'],
    properties: { path: { type: 'string' }, route: { type: 'string' }, loud: { type: 'string' } } } } },
}

const clock = `The run started at ${A.startedAt || 'an unrecorded time'}. Time matters: aim for ${MIN} minutes; at ${MIN * 2}, commit and hand back partial.`

function buildPrompt (s, feedback, opts = {}) {
  return [
    `Build slice ${s.id} of .forge/PLAN.md: ${s.name}.`,
    `It closes: ${s.closes.join(', ') || 'no rubric lines'}.`,
    opts.inWorktree
      ? `You are in a fresh worktree. First run: git reset --hard ${opts.base}. The base is already recorded; skip that step. Commit on a branch named forge-slice-${s.id} and return that branch name.`
      : (s.base ? 'The base is already recorded; skip that step.' : ''),
    clock,
    feedback ? `\n${feedback}` : '',
  ].filter(Boolean).join('\n')
}

const gate = (label, cmd) => agent(
  `Run exactly this from the project root, then stop: ${cmd}\n` +
  'Do not fix, edit or explain anything, and do not run anything else. ' +
  'Return the verdict and the summary field from the JSON on its last line, verbatim.',
  { model: SONNET, effort: 'low', schema: GATE, label, phase: 'Build' },
)

async function runSlice (s, opts = {}) {
  let fails = s.fails || 0
  let partials = 0
  let feedback = ''
  for (;;) {
    const high = fails >= 2
    const model = high || s.tier !== 'light' ? OPUS : SONNET
    const effort = high ? 'high' : 'medium'
    const built = await agent(buildPrompt(s, feedback, opts), {
      agentType: 'builder', model, effort, schema: BUILT,
      isolation: opts.inWorktree ? 'worktree' : undefined,
      label: `build ${s.id}${high ? ' (opus high)' : ''}`, phase: 'Build',
    })
    if (!built) return { id: s.id, status: 'blocked', note: 'the builder returned nothing' }
    if (built.status === 'blocked') return { id: s.id, status: 'blocked', note: built.summary }
    if (built.status === 'partial') {
      partials++
      if (partials > 1) return { id: s.id, status: 'needs-reslice', note: built.summary }
      feedback = `A previous dispatch handed this slice back partial. Continue from .forge/RESUME.md and the last commit:\n${built.summary}`
      continue
    }
    // Worktree slices are gated after their merge, on the main tree.
    if (opts.inWorktree) return { id: s.id, status: 'built', branch: built.branch || `forge-slice-${s.id}`, note: built.summary }
    const g = await gate(`gate ${s.id}`, `node scripts/gate.mjs ${s.id}`)
    if (!g) return { id: s.id, status: 'blocked', note: 'the gate returned nothing' }
    if (g.verdict === 'PASS') return { id: s.id, status: 'green', note: built.summary }
    if (g.verdict === 'UNKNOWN') return { id: s.id, status: 'blocked', note: g.summary }
    fails++
    if (fails >= 3) return { id: s.id, status: 'stuck', note: g.summary }
    feedback = `The gate failed. Fix exactly these failures first, nothing else:\n${g.summary}`
    log(`slice ${s.id}: gate FAIL ${fails}${fails === 2 ? ', next dispatch on opus at high effort' : ''}`)
  }
}

// The blind squint on the shipped build: the critic gets blurred paths and
// nothing else; the verifier gets its answer beside each route's declared
// LOUD element. Only when the run designed screens.
let squintNote = ''
async function squint () {
  if (!A.screens || squintNote) return squintNote
  const shots = await agent(
    'For each route in .forge/SCREENS.md: capture it at 1280x800 with scripts/capture.sh squint-<NN> <url> (the live URL when one exists, else the local build), ' +
    'then blur it: sips -Z 44 .forge/evidence/shots/squint-<NN>.png --out /tmp/sq-<NN>.png && sips -Z 900 /tmp/sq-<NN>.png --out .forge/squint/final-<NN>.png. ' +
    'Return each blurred path with its route and the LOUD element SCREENS.md declares for it. Change nothing else.',
    { model: SONNET, effort: 'low', schema: SHOTS, label: 'squint capture', phase: 'Verify' })
  if (!shots || !shots.items.length) return (squintNote = 'Squint: no captures were possible; rule hierarchy lines from the capture tree alone.')
  const critic = await agent(`Judge these images:\n${shots.items.map(i => i.path).join('\n')}`,
    { agentType: 'design-critic', model: SONNET, effort: 'medium', label: 'squint critic', phase: 'Verify' })
  squintNote = 'Squint on the shipped build, from a critic who saw only blurred images. A dominant region that is not the declared LOUD element is a defect against the hierarchy line:\n' +
    shots.items.map(i => `${i.path}: route ${i.route}, declared LOUD ${i.loud}`).join('\n') + `\nCritic:\n${critic || 'no answer'}`
  return squintNote
}

async function verify (pass, ids) {
  const scope = pass === 'final'
    ? `Final pass: the whole rubric, then the holdout suite, the disqualifier sweep and dod-check --rule.\n${await squint()}`
    : `Milestone pass over the lines closed so far: ${ids.join(', ')}. No holdout, no --rule.`
  return agent(`${scope}\nRule from the files. Return failing ids, which of them are judge lines, and unknown ids.`, {
    agentType: 'verifier', model: OPUS, effort: 'high', schema: VERDICT, label: `verify ${pass}`, phase: 'Verify',
  })
}

// A failed judge line is re-judged once in a fresh context before it counts:
// a model judge's false negatives run near a quarter.
async function confirm (v) {
  const judged = v.judgeFailing || []
  const again = await parallel(judged.map(id => () => agent(
    `Re-judge one line, ${id}, in a fresh pass. Rule it on its own threshold and record the ruling with dod-check --judge ... --tick.`,
    { agentType: 'verifier', model: OPUS, effort: 'high', schema: VERDICT, label: `re-judge ${id}`, phase: 'Verify' },
  )))
  const cleared = judged.filter((id, i) => again[i] && again[i].verdict === 'PASS')
  return v.failing.filter(id => !cleared.includes(id))
}

async function fixRound (ids, round) {
  const effort = round > 1 ? 'high' : 'medium'
  const built = await agent(
    `Fix mode. The verifier failed these rubric lines: ${ids.join(', ')}. Read them with dod-check --show and the defect lines for them in .forge/DEFECTS.md. Fix exactly these, nothing else. The base is already recorded; skip that step.\n${clock}`,
    { agentType: 'builder', model: OPUS, effort, schema: BUILT, label: `fix ${ids.join(',')}`, phase: 'Fix' },
  )
  if (!built || built.status !== 'done') return { status: built ? built.status : 'blocked', note: built ? built.summary : 'no return' }
  const g = await gate('gate fix', `node scripts/gate.mjs fix --ids ${ids.join(',')}`)
  return { status: g && g.verdict === 'PASS' ? 'gated' : 'red', note: g ? g.summary : 'the gate returned nothing' }
}

async function finalVerify () {
  let v = await verify('final', [])
  if (!v) return { verdict: 'UNKNOWN', open: [], note: 'the verifier returned nothing' }
  if (v.verdict === 'PASS') return { verdict: 'PASS', open: [] }
  let open = await confirm(v)
  if (!open.length) v = await verify('final', [])
  else {
    const fx = await fixRound(open, 1)
    log(`fix round: ${fx.status}`)
    v = await verify('final', [])
    if (v && v.verdict !== 'PASS') open = await confirm(v)
  }
  return v && v.verdict === 'PASS' ? { verdict: 'PASS', open: [] } : { verdict: v ? v.verdict : 'UNKNOWN', open, note: v ? v.summary : '' }
}

// ---------------------------------------------------------------- fix mode
if (A.fixIds && A.fixIds.length) {
  phase('Fix')
  const fx = await fixRound(A.fixIds, 2)
  phase('Verify')
  const fin = await finalVerify()
  return { mode: 'fix', fix: fx, verify: fin, done: fin.verdict === 'PASS' }
}

// ---------------------------------------------------------------- build
phase('Build')
const groups = []
for (const s of slices) {
  const g = groups.find(x => x.key === String(s.group))
  g ? g.members.push(s) : groups.push({ key: String(s.group), members: [s] })
}

const closed = []
let halted = null
for (const g of groups) {
  const parallelOk = A.size === 'L' && g.members.length > 1 && g.members.length <= 3
  if (!parallelOk) {
    for (const s of g.members) {
      const r = await runSlice(s)
      report.push(r)
      log(`slice ${s.id}: ${r.status}`)
      if (r.status !== 'green') { halted = r; break }
      closed.push(...s.closes)
      if (A.milestone && s.id === A.milestone) {
        phase('Verify')
        const v = await verify('milestone', closed)
        const open = v && v.verdict !== 'PASS' ? await confirm(v) : []
        if (open.length) {
          const fx = await fixRound(open, 1)
          log(`milestone fix: ${fx.status}`)
          if (fx.status !== 'gated') { halted = { id: s.id, status: 'stuck', note: `milestone lines still failing: ${open.join(', ')}`, lines: open }; break }
        }
        phase('Build')
      }
    }
  } else {
    // Parallel L group: both builders branch from the same commit, merge
    // serially, and the gate runs on the main tree after each merge.
    const head = await agent('Run `git rev-parse HEAD` and, for each slice id in ' + JSON.stringify(g.members.map(s => s.id)) +
      ', run `node scripts/attempt.mjs base <id> <that sha>`. Return the sha.', { model: SONNET, effort: 'low', schema: SHA, label: `base group ${g.key}`, phase: 'Build' })
    if (!head) { halted = { id: g.key, status: 'blocked', note: 'could not read HEAD' }; break }
    const built = await parallel(g.members.map(s => () => runSlice(s, { inWorktree: true, base: head.sha })))
    for (let i = 0; i < g.members.length; i++) {
      const s = g.members[i]; const b = built[i]
      if (!b || b.status !== 'built') { report.push(b || { id: s.id, status: 'blocked', note: 'no return' }); halted = b || { id: s.id, status: 'blocked' }; continue }
      const m = await gate(`merge ${s.id}`, `git merge --no-ff ${b.branch} -m "forge: merge slice ${s.id}" || { git merge --abort; echo '{"verdict":"FAIL","summary":"merge conflict, aborted"}'; exit 1; }; node scripts/gate.mjs ${s.id}`)
      const r = { id: s.id, status: m && m.verdict === 'PASS' ? 'green' : 'stuck', note: m ? m.summary : 'no return' }
      report.push(r)
      if (r.status === 'green') closed.push(...s.closes)
      else halted = r
    }
    if (halted) break
  }
  if (halted) break
}

if (halted) return { mode: 'build', slices: report, halted, done: false }

phase('Verify')
const fin = await finalVerify()
return { mode: 'build', slices: report, verify: fin, done: fin.verdict === 'PASS' }
