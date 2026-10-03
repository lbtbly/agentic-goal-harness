#!/usr/bin/env node
// The rubric, executed. Every `check:` line runs from the armed commit, so the
// command that rules is the command that was approved.
//
//   dod-check.mjs --show <ID...>                 print the armed text of lines
//   dod-check.mjs --ids F1,F2 [--tick]           run those check: lines
//   dod-check.mjs --slice <N> [--tick]           run the slice's Closes lines
//   dod-check.mjs --all [--tick]                 run every check: line
//   dod-check.mjs --judge <ID> pass|fail "<evidence or defect>" [--tick]
//   dod-check.mjs --operator <ID> "<proof>"      the human records an operator line
//   dod-check.mjs --rule                         tick V0, verifier only
//   dod-check.mjs --lint [--size S|M|L]          rubric and plan format
//
// Without --tick a run is read-only: it prints and writes nothing, so a
// builder checking its own work in a worktree leaves no trace to merge.
// --tick records evidence and defects and writes the working DOD.md: a pass
// ticks, a fail un-ticks, and a could-not-run leaves the box alone and
// blocks PASS. Last line of output is JSON. Exit 0 PASS, 1 FAIL, 2 UNKNOWN,
// 3 refused (integrity).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { enterProject, pinned, checksDirIntact, parseDod, parsePlan, unparsedBoxes, runTwice, evidence, defect, saveLog, setBoxes, git } from './forge-lib.mjs'

if (!enterProject()) process.exit(0)

const argv = process.argv.slice(2)
const has = f => argv.includes(f)
const val = f => { const i = argv.indexOf(f); return i < 0 ? null : argv[i + 1] }
const RULE = has('--rule')
const record = has('--tick') || RULE

function out (o, code) {
  console.log(JSON.stringify(o))
  process.exit(code)
}
function refuse (why) {
  console.log(`dod-check: refused: ${why}`)
  out({ verdict: 'UNKNOWN', refused: why }, 3)
}

const dod = pinned('.forge/DOD.md')
if (dod.error) refuse(dod.error)
const lines = parseDod(dod.text)
const byId = new Map(lines.map(l => [l.id, l]))
const working = existsSync('.forge/DOD.md') ? parseDod(readFileSync('.forge/DOD.md', 'utf8')) : []
const isTicked = id => (working.find(l => l.id === id) || {}).checked

if (has('--lint')) {
  const problems = []
  for (const b of unparsedBoxes(dod.text)) problems.push(`unparsed  ${b.slice(0, 100)}`)
  for (const l of lines) {
    if (`${l.prop} ${l.body}`.length > 240) problems.push(`too long  ${l.id} (${`${l.prop} ${l.body}`.length} chars, budget 240)`)
    if (l.kind === 'check' && /\|\s*head\b/.test(l.body)) problems.push(`check     ${l.id} pipes into head, which hides the exit of the command it reads`)
    if (l.kind === 'check' && /^`/.test(l.body)) problems.push(`check     ${l.id} is wrapped in backticks, which bash runs as a substitution`)
  }
  const ids = lines.map(l => l.id)
  for (const d of ids.filter((x, i) => ids.indexOf(x) !== i)) problems.push(`duplicate ${d}`)
  if (!byId.has('V0')) problems.push('missing   V0 | final verifier PASS | rule')

  // The plan must partition the rubric, or a slice gates nothing.
  const size = String(val('--size') || '').toUpperCase()
  const plan = pinned('.forge/PLAN.md')
  if (!plan.error) {
    const { slices, checks } = parsePlan(plan.text)
    if (!slices.length) problems.push('plan      no "## Slice N" headings were read')
    if (!checks.test && !checks.typecheck) problems.push('plan      ## Checks pins neither test nor typecheck')
    const seen = new Map()
    for (const s of slices) {
      if (!s.closes.length) problems.push(`plan      slice ${s.id} closes nothing that could be read`)
      for (const id of s.closes) {
        const l = byId.get(id)
        if (!l) problems.push(`plan      slice ${s.id} closes ${id}, which is not in DOD.md`)
        else if (l.kind === 'operator' || l.kind === 'rule') problems.push(`plan      slice ${s.id} closes ${id}, a ${l.kind} line no slice can close`)
        if (seen.has(id)) problems.push(`plan      ${id} is closed by slices ${seen.get(id)} and ${s.id}`)
        seen.set(id, s.id)
      }
    }
    for (const l of lines) {
      if (l.kind !== 'operator' && l.kind !== 'rule' && !seen.has(l.id)) problems.push(`plan      ${l.id} is closed by no slice`)
    }
    const ms = slices.filter(s => s.milestone).length
    if ((size === 'M' || size === 'L') && ms !== 1) problems.push(`plan      ${ms} milestone slices; M and L need exactly one`)
  }
  for (const p of problems) console.log(p)

  // Compliance (RC) and denied-cell (FD) lines are exempt from the budget.
  const judges = lines.filter(l => l.kind === 'judge' && !/^(RC|FD)\d/.test(l.id))
  const cap = { S: 8, M: 25, L: 50 }[size]
  console.log(`${lines.length} line(s): ${lines.filter(l => l.kind === 'check').length} check, ${judges.length} judge (budgeted), ${lines.filter(l => l.kind === 'operator').length} operator`)
  // Over budget is allowed with one stated reason at the greenlight.
  if (cap && judges.length > cap) console.log(`over budget: ${judges.length} judge lines against ${cap}; GREENLIGHT.md must state why`)
  out({ verdict: problems.length ? 'FAIL' : 'PASS', problems: problems.length, lines: lines.length, judge: judges.length }, problems.length ? 1 : 0)
}

if (has('--show')) {
  const want = argv.slice(argv.indexOf('--show') + 1).join(',').split(/[,\s]+/).filter(Boolean)
  for (const id of want) {
    const l = byId.get(id)
    console.log(l ? `${id} | ${l.prop} | ${l.kind}${l.body ? `: ${l.body}` : ''}` : `${id} | not in the rubric`)
  }
  process.exit(0)
}

if (has('--judge')) {
  const id = val('--judge')
  const ruling = String(argv[argv.indexOf('--judge') + 2] || '').toLowerCase()
  const note = argv[argv.indexOf('--judge') + 3] || ''
  const l = byId.get(id)
  if (!l) refuse(`${id} is not in the rubric`)
  // A command decides a check: line, and only the human proves an operator
  // line. Judgment overrules neither.
  if (l.kind !== 'judge') refuse(`${id} is a ${l.kind} line; --judge rules judge lines only${l.kind === 'operator' ? ' (the human records it with --operator)' : ''}`)
  if (!['pass', 'fail'].includes(ruling) || !note) refuse('usage: --judge <ID> pass|fail "<evidence ref or defect>"')
  if (ruling === 'pass') { evidence(id, 'judge PASS', note); if (has('--tick')) setBoxes([id], true) }
  else { defect(id, 'judge', note); if (has('--tick')) setBoxes([id], false) }
  console.log(`${id} ${ruling.toUpperCase()}`)
  out({ verdict: ruling === 'pass' ? 'PASS' : 'FAIL', id }, ruling === 'pass' ? 0 : 1)
}

if (has('--operator')) {
  const id = val('--operator')
  const proof = argv[argv.indexOf('--operator') + 2] || ''
  const l = byId.get(id)
  if (!l) refuse(`${id} is not in the rubric`)
  if (l.kind !== 'operator') refuse(`${id} is a ${l.kind} line, not an operator line`)
  if (!proof) refuse('usage: --operator <ID> "<what proves it: a URL, a screenshot path, a receipt>"')
  evidence(id, 'operator PASS (human)', proof)
  setBoxes([id], true)
  console.log(`${id} recorded by the operator`)
  out({ verdict: 'PASS', id }, 0)
}

let ids
if (has('--all') || RULE) ids = lines.filter(l => l.kind === 'check').map(l => l.id)
else if (val('--ids')) ids = val('--ids').split(/[,\s]+/).filter(Boolean)
else if (val('--slice')) {
  const plan = pinned('.forge/PLAN.md')
  if (plan.error) refuse(plan.error)
  const s = parsePlan(plan.text).slices.find(x => x.id === val('--slice'))
  if (!s) refuse(`slice ${val('--slice')} is not in PLAN.md`)
  ids = s.closes.filter(id => (byId.get(id) || {}).kind === 'check')
} else {
  console.log('usage: dod-check.mjs --ids <IDS> | --slice <N> | --all | --judge | --operator | --rule | --show | --lint [--tick]')
  process.exit(2)
}

const intact = checksDirIntact()
if (!intact.ok) refuse(intact.why)

// The product's state, .forge excluded: a green --all on exactly this tree
// lets --rule skip re-running every check a second time.
function treeKey () {
  const h = git(['rev-parse', 'HEAD']); const s = git(['status', '--porcelain', '--', '.', ':(exclude).forge']); const d = git(['diff', 'HEAD', '--', '.', ':(exclude).forge'])
  if (h.state !== 'ok' || s.state !== 'ok' || d.state !== 'ok') return null
  return createHash('sha256').update(`${h.out}${dod.sha || ''}${s.out}${d.out}`).digest('hex')
}
const CACHE = '.forge/evidence/checks/last-all.json'
const key = (has('--all') || RULE) ? treeKey() : null

let res = { pass: [], fail: [], unknown: [], flaky: [] }
let reused = false
if (RULE && key && existsSync(CACHE)) {
  try {
    const c = JSON.parse(readFileSync(CACHE, 'utf8'))
    if (c.key === key && c.verdict === 'PASS') { res = c.res; reused = true; console.log(`reusing a green --all on this exact tree (${c.at})`) }
  } catch {}
}
if (!reused) {
  for (const id of ids) {
    const l = byId.get(id)
    if (!l) { res.unknown.push(id); console.log(`${id}  UNKNOWN  not in the armed rubric`); continue }
    if (l.kind !== 'check') continue
    const r = runTwice(l.body)
    if (r.flaky) res.flaky.push(id)
    res[r.state].push(id)
    const line1 = (r.tail.split('\n').pop() || '').slice(0, 120)
    console.log(`${id}  ${r.state.toUpperCase()}${r.flaky ? ' (flaky: passed on re-run)' : ''}  exit ${r.code}  ${line1}`)
    if (!record) continue
    const log = saveLog(id, `$ ${l.body}\n${r.out}`)
    if (r.state === 'pass') evidence(id, `check PASS${r.flaky ? ' flaky' : ''}`, `${l.body} | exit 0 | ${log}`)
    else if (r.state === 'fail') { evidence(id, 'check FAIL', `${l.body} | exit ${r.code} | ${log}`); defect(id, 'check', `exit ${r.code}: ${line1}`) }
    else evidence(id, 'check UNKNOWN', `${l.body} | could not run, exit ${r.code} | ${log}`)
  }
}
// --rule records like --tick: a V0 over unticked boxes would hold the Stop gate.
if (record) { setBoxes(res.pass, true); setBoxes(res.fail, false) }

let verdict = res.fail.length ? 'FAIL' : res.unknown.length ? 'UNKNOWN' : 'PASS'
if (has('--all') && has('--tick') && key) {
  mkdirSync('.forge/evidence/checks', { recursive: true })
  writeFileSync(CACHE, JSON.stringify({ key, verdict, res, at: new Date().toISOString() }))
}

if (RULE) {
  // V0 is the verifier's PASS. It lands only when every check is green on
  // this tree, the pinned holdout suite passes, and every judge line is
  // ticked. Operator lines are the human's: they never hold V0 back, and the
  // report lists them with the command that records them.
  const plan = pinned('.forge/PLAN.md')
  const holdout = plan.error ? null : parsePlan(plan.text).checks.holdout
  let holdoutState = 'none pinned'
  if (holdout && verdict === 'PASS') {
    const h = runTwice(holdout, { timeoutMs: +(process.env.FORGE_HOLDOUT_TIMEOUT || 1800) * 1000 })
    holdoutState = h.state
    console.log(`holdout  ${h.state.toUpperCase()}  exit ${h.code}`)
    if (h.state === 'fail') { verdict = 'FAIL'; defect('V0', 'holdout', (h.tail.split('\n').pop() || 'holdout failed').slice(0, 200)) }
    else if (h.state === 'unknown') verdict = 'UNKNOWN'
  }
  const open = lines.filter(l => l.id !== 'V0' && l.kind !== 'operator' && !(res.pass.includes(l.id) || (l.kind !== 'check' && isTicked(l.id))))
  const operator = lines.filter(l => l.kind === 'operator' && !isTicked(l.id)).map(l => l.id)
  if (verdict !== 'PASS' || open.length) {
    setBoxes(['V0'], false)
    for (const l of open) console.log(`open  ${l.id} | ${l.kind}`)
    console.log(`V0 not ticked: ${verdict === 'PASS' ? `${open.length} line(s) open` : `checks or holdout ${verdict}`}`)
    out({ verdict: verdict === 'PASS' ? 'FAIL' : verdict, open: open.map(l => l.id), operator, holdout: holdoutState, ...res }, verdict === 'UNKNOWN' ? 2 : 1)
  }
  if (!byId.has('V0')) refuse('the rubric has no V0 line')
  setBoxes(['V0'], true)
  evidence('V0', 'rule PASS', `${lines.length} lines, checks green, holdout ${holdoutState}, every judge line ticked${operator.length ? `, operator lines open: ${operator.join(', ')}` : ''}`)
  console.log(`V0 ticked: final verifier PASS${operator.length ? `. Operator lines for the human: ${operator.join(', ')}` : ''}`)
  out({ verdict: 'PASS', open: [], operator, holdout: holdoutState, ...res }, 0)
}

console.log(`${res.pass.length} pass, ${res.fail.length} fail, ${res.unknown.length} could not run${dod.pinned ? ` (pinned ${dod.sha.slice(0, 8)})` : ' (unpinned: not armed)'}`)
out({ verdict, ...res, pinned: !!dod.pinned }, verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2)
