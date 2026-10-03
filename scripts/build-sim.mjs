#!/usr/bin/env node
// Offline simulation of .claude/workflows/build.js: agent() is stubbed with a
// scripted responder, so the ladder, milestone, final verify, fix mode and the
// parallel L path are exercised with zero model calls.
import { readFileSync } from 'node:fs'
const SRC = readFileSync(new URL('../.claude/workflows/build.js', import.meta.url), 'utf8').replace(/^export const meta/m, 'const meta')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

async function sim (name, args, responder) {
  const calls = []
  const agent = async (prompt, opts = {}) => {
    const c = { label: opts.label, model: opts.model, effort: opts.effort, agentType: opts.agentType, isolation: opts.isolation, prompt }
    calls.push(c)
    return responder(c, calls)
  }
  const parallel = async thunks => Promise.all(thunks.map(t => t().catch(() => null)))
  const fn = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', 'workflow', SRC)
  const out = await fn(agent, parallel, null, () => {}, () => {}, args, { total: null }, null)
  return { name, out, calls }
}

const sl = (id, extra = {}) => ({ id, name: `s${id}`, tier: 'standard', group: id, closes: [`F${id}`], fails: 0, base: null, ...extra })
let pass = 0, fail = 0
const check = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`) }
const PASSV = { verdict: 'PASS', failing: [], summary: 'ok' }

// 1. Ladder: slice 2 fails the gate three times.
{
  let g2 = 0
  const r = await sim('ladder', { slices: [sl('1'), sl('2')], size: 'M' }, c => {
    if (c.agentType === 'builder') return { status: 'done', summary: 'built' }
    if (c.label === 'gate 1') return { verdict: 'PASS', summary: 'green' }
    if (c.label === 'gate 2') { g2++; return { verdict: 'FAIL', summary: `test failed ${g2}` } }
    return PASSV
  })
  const b2 = r.calls.filter(c => c.label && c.label.startsWith('build 2'))
  check(r.out.halted && r.out.halted.status === 'stuck' && r.out.halted.id === '2', 'three gate FAILs halt the slice as stuck')
  check(b2.length === 3, `slice 2 got three builder dispatches (${b2.length})`)
  check(b2[0].model === 'claude-opus-5-5' && b2[0].effort === 'medium' && b2[1].effort === 'medium' && b2[2].effort === 'high', 'medium, medium, then Opus high')
  check(b2[1].prompt.includes('test failed 1') && b2[2].prompt.includes('test failed 2'), 'each retry carries the latest gate output')
  check(!r.calls.some(c => c.agentType === 'verifier'), 'no verifier runs on a halted build')
}
// 2. Light tier starts on Sonnet, escalates to Opus high.
{
  let g = 0
  const r = await sim('light', { slices: [sl('1', { tier: 'light' })], size: 'S' }, c => {
    if (c.agentType === 'builder') return { status: 'done', summary: 'b' }
    if (c.label === 'gate 1') { g++; return g < 3 ? { verdict: 'FAIL', summary: 'x' } : { verdict: 'PASS', summary: 'g' } }
    return PASSV
  })
  const b = r.calls.filter(c => c.agentType === 'builder')
  check(b[0].model === 'claude-sonnet-5-5' && b[1].model === 'claude-sonnet-5-5' && b[2].model === 'claude-opus-5-5' && b[2].effort === 'high', 'light slice: Sonnet, Sonnet, then Opus high')
  check(r.out.done === true, 'it goes green on the third try and the run completes')
}
// 3. Partial twice is needs-reslice, never a FAIL.
{
  const r = await sim('partial', { slices: [sl('1')], size: 'M' }, c => c.agentType === 'builder' ? { status: 'partial', summary: 'half' } : PASSV)
  check(r.out.halted && r.out.halted.status === 'needs-reslice', 'two partials come back needs-reslice')
  check(!r.calls.some(c => c.label && c.label.startsWith('gate')), 'a partial slice never reaches the gate')
}
// 4. Gate UNKNOWN is blocked, not a FAIL.
{
  const r = await sim('unknown', { slices: [sl('1')], size: 'M' }, c => c.agentType === 'builder' ? { status: 'done', summary: 'b' } : c.label === 'gate 1' ? { verdict: 'UNKNOWN', summary: 'test could not run' } : PASSV)
  check(r.out.halted && r.out.halted.status === 'blocked', 'an UNKNOWN gate blocks the slice')
  check(r.calls.filter(c => c.agentType === 'builder').length === 1, 'UNKNOWN does not climb the ladder')
}
// 5. Resume at rung 2: the first dispatch is already Opus high.
{
  const r = await sim('resume', { slices: [sl('1', { fails: 2, base: 'abc1234' })], size: 'M' }, c => c.agentType === 'builder' ? { status: 'done', summary: 'b' } : c.label === 'gate 1' ? { verdict: 'PASS', summary: 'g' } : PASSV)
  const b = r.calls.filter(c => c.agentType === 'builder')
  check(b[0].effort === 'high', 'a relaunch resumes at the recorded rung')
  check(b[0].prompt.includes('already recorded'), 'a recorded base is not overwritten')
}
// 6. Milestone verify after the core-loop slice, then final.
{
  const r = await sim('milestone', { slices: [sl('1'), sl('2'), sl('3')], milestone: '2', size: 'M' }, c => c.agentType === 'builder' ? { status: 'done', summary: 'b' } : c.label && c.label.startsWith('gate') ? { verdict: 'PASS', summary: 'g' } : PASSV)
  const order = r.calls.map(c => c.label)
  check(order.indexOf('verify milestone') > order.indexOf('gate 2') && order.indexOf('verify milestone') < order.indexOf('build 3'), 'the milestone verify runs between slice 2 and slice 3')
  check(r.calls.find(c => c.label === 'verify milestone').prompt.includes('F1, F2'), 'it covers only the lines closed so far')
  check(order[order.length - 1] === 'verify final' && r.out.done === true, 'the final verify closes the run')
  check(r.calls.filter(c => c.agentType === 'verifier').every(c => c.model === 'claude-opus-5-5' && c.effort === 'high'), 'every verifier pass is Opus high')
}
// 7. Final FAIL on a judge line: re-judged once, cleared, re-verified.
{
  let finals = 0
  const r = await sim('rejudge', { slices: [sl('1')], size: 'S' }, c => {
    if (c.agentType === 'builder') return { status: 'done', summary: 'b' }
    if (c.label === 'gate 1') return { verdict: 'PASS', summary: 'g' }
    if (c.label === 'verify final') { finals++; return finals === 1 ? { verdict: 'FAIL', failing: ['C1'], judgeFailing: ['C1'], summary: 'C1 flat' } : PASSV }
    if (c.label === 're-judge C1') return PASSV
    return PASSV
  })
  check(r.calls.some(c => c.label === 're-judge C1'), 'a failed judge line gets a fresh re-judge')
  check(!r.calls.some(c => c.label && c.label.startsWith('fix')), 'a cleared re-judge needs no fix round')
  check(finals === 2 && r.out.done, 'the final verify re-runs and passes')
}
// 8. Final FAIL confirmed: one fix round, then a final re-verify.
{
  let finals = 0
  const r = await sim('fix', { slices: [sl('1')], size: 'S' }, c => {
    if (c.agentType === 'builder') return { status: 'done', summary: 'b' }
    if (c.label === 'gate 1' || c.label === 'gate fix') return { verdict: 'PASS', summary: 'g' }
    if (c.label === 'verify final') { finals++; return finals === 1 ? { verdict: 'FAIL', failing: ['F1', 'C1'], judgeFailing: ['C1'], summary: 'two lines' } : PASSV }
    if (c.label === 're-judge C1') return { verdict: 'FAIL', failing: ['C1'], summary: 'still flat' }
    return PASSV
  })
  const fx = r.calls.find(c => c.label && c.label.startsWith('fix'))
  check(fx && fx.prompt.includes('F1, C1'), 'confirmed failures go to one fix round together')
  check(r.calls.some(c => c.label === 'gate fix'), 'the fix goes through the gate')
  check(r.out.done, 'the run completes after the fix')
}
// 9. Fix mode from the lead.
{
  const r = await sim('fixmode', { fixIds: ['C3'], size: 'M' }, c => c.agentType === 'builder' ? { status: 'done', summary: 'b' } : c.label === 'gate fix' ? { verdict: 'PASS', summary: 'g' } : PASSV)
  check(r.out.mode === 'fix' && r.out.done, 'fixIds runs a fix round and a final verify only')
  check(!r.calls.some(c => c.label && /^build /.test(c.label)), 'fix mode builds no slices')
}
// 10. L parallel group: worktrees, one base, serial merge with the gate.
{
  const a = sl('2', { group: 'g' }), b = sl('3', { group: 'g' })
  const r = await sim('parallel', { slices: [sl('1'), a, b], size: 'L' }, c => {
    if (c.label === 'base group g') return { sha: 'deadbeef' }
    if (c.agentType === 'builder') return { status: 'done', summary: 'b', branch: c.isolation ? `forge-slice-${c.label.split(' ')[1]}` : undefined }
    if (c.label && (c.label.startsWith('gate') || c.label.startsWith('merge'))) return { verdict: 'PASS', summary: 'g' }
    return PASSV
  })
  const wt = r.calls.filter(c => c.agentType === 'builder' && c.isolation === 'worktree')
  check(wt.length === 2 && wt.every(c => c.prompt.includes('git reset --hard deadbeef')), 'both parallel builders start from one base in worktrees')
  const merges = r.calls.filter(c => c.label && c.label.startsWith('merge'))
  check(merges.length === 2 && merges.every(c => c.prompt.includes('gate.mjs')), 'each worktree merges then runs the gate on the main tree')
  check(r.out.done, 'the parallel group completes')
  const s = await sim('parallel-M', { slices: [sl('1'), a, b], size: 'M' }, c => c.agentType === 'builder' ? { status: 'done', summary: 'b' } : c.label && c.label.startsWith('gate') ? { verdict: 'PASS', summary: 'g' } : PASSV)
  check(!s.calls.some(c => c.isolation), 'an M run never parallelises, whatever the groups say')
}
// 10b. A designed run gets the blind squint before the final verify, once.
{
  let finals = 0
  const r = await sim('squint', { slices: [sl('1')], size: 'M', screens: true }, c => {
    if (c.agentType === 'builder') return { status: 'done', summary: 'b' }
    if (c.label === 'gate 1') return { verdict: 'PASS', summary: 'g' }
    if (c.label === 'squint capture') return { items: [{ path: '.forge/squint/final-01.png', route: '/', loud: 'the balance' }] }
    if (c.label === 'squint critic') return 'DOMINANT REGION: a wide band top third. VERDICT: HIERARCHY'
    if (c.label === 'verify final') { finals++; return finals === 1 ? { verdict: 'FAIL', failing: ['C1'], judgeFailing: ['C1'], summary: 'x' } : PASSV }
    if (c.label === 're-judge C1') return PASSV
    return PASSV
  })
  const critic = r.calls.find(c => c.label === 'squint critic')
  check(critic && critic.agentType === 'design-critic' && !critic.prompt.includes('LOUD') && !critic.prompt.includes('balance'), 'the critic sees blurred paths only, never the declared LOUD')
  check(r.calls.find(c => c.label === 'verify final').prompt.includes('declared LOUD the balance'), 'the verifier gets the critic beside each declared LOUD')
  check(r.calls.filter(c => c.label === 'squint capture').length === 1, 'the squint runs once even when the final verify repeats')
  const plain = await sim('nosquint', { slices: [sl('1')], size: 'S' }, c => c.agentType === 'builder' ? { status: 'done', summary: 'b' } : c.label === 'gate 1' ? { verdict: 'PASS', summary: 'g' } : PASSV)
  check(!plain.calls.some(c => c.label && c.label.startsWith('squint')), 'a run without screens skips the squint')
}
// 11. Every agent call is pinned: no inherited model or effort anywhere.
{
  const r = await sim('pins', { slices: [sl('1'), sl('2', { tier: 'light' })], milestone: '1', size: 'M', screens: true }, c => c.agentType === 'builder' ? { status: 'done', summary: 'b' } : c.label && c.label.startsWith('gate') ? { verdict: 'PASS', summary: 'g' } : c.label === 'squint capture' ? { items: [{ path: 'p', route: '/', loud: 'x' }] } : c.label === 'squint critic' ? 'VERDICT: HIERARCHY' : PASSV)
  check(r.calls.every(c => c.model && c.effort), 'every agent() call pins model and effort')
  check(r.calls.every(c => ['claude-opus-5-5', 'claude-sonnet-5-5'].includes(c.model)), 'no Fable, no Opus 5, no Haiku inside the workflow')
}
console.log(`\nbuild-sim: ${pass} ok, ${fail} failed`)
process.exit(fail ? 1 : 0)
