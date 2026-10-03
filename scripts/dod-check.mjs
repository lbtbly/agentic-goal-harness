#!/usr/bin/env node
// The rubric, executed. Every `check:` line runs from the armed commit, so the
// command that rules is the command that was approved.
//
//   dod-check.mjs --show <ID...>                 print the armed text of lines
//   dod-check.mjs --ids F1,F2 [--tick]           run those check: lines
//   dod-check.mjs --slice <N> [--tick]           run the slice's Closes lines
//   dod-check.mjs --all [--tick]                 run every check: line
//   dod-check.mjs --judge <ID> pass|fail "<evidence or defect>"
//   dod-check.mjs --rule                         tick V0, verifier only
//   dod-check.mjs --lint                         rubric format and budget
//
// --tick writes the working DOD.md: a pass ticks, a fail un-ticks, and a
// could-not-run leaves the box alone and blocks PASS. Last line of output is
// JSON. Exit 0 PASS, 1 FAIL, 2 UNKNOWN, 3 refused (integrity).
import { readFileSync, existsSync } from 'node:fs'
import { enterProject, pinned, checksDirIntact, parseDod, parsePlan, unparsedBoxes, runTwice, evidence, defect, saveLog, setBoxes } from './forge-lib.mjs'

if (!enterProject()) process.exit(0)

const argv = process.argv.slice(2)
const has = f => argv.includes(f)
const val = f => { const i = argv.indexOf(f); return i < 0 ? null : argv[i + 1] }
const tick = has('--tick')

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
  const bad = unparsedBoxes(dod.text)
  // Compliance (RC) and denied-cell (FD) lines are exempt from the budget.
  const judges = lines.filter(l => l.kind === 'judge' && !/^(RC|FD)\d/.test(l.id))
  const cap = { S: 8, M: 25, L: 50 }[String(val('--size') || '').toUpperCase()]
  const long = lines.filter(l => `${l.prop} ${l.body}`.length > 240)
  const ids = lines.map(l => l.id)
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i)
  for (const b of bad) console.log(`unparsed  ${b.slice(0, 100)}`)
  for (const l of long) console.log(`too long  ${l.id} (${`${l.prop} ${l.body}`.length} chars, budget 240)`)
  for (const d of dup) console.log(`duplicate ${d}`)
  if (!byId.has('V0')) console.log('missing   V0 | final verifier PASS | rule')
  console.log(`${lines.length} line(s): ${lines.filter(l => l.kind === 'check').length} check, ${judges.length} judge (budgeted), ${lines.filter(l => l.kind === 'operator').length} operator`)
  // Over budget is allowed with one stated reason at the greenlight, so it
  // reports rather than fails.
  if (cap && judges.length > cap) console.log(`over budget: ${judges.length} judge lines against ${cap}; GREENLIGHT.md must state why`)
  const ok = !bad.length && !long.length && !dup.length && byId.has('V0')
  out({ verdict: ok ? 'PASS' : 'FAIL', lines: lines.length, judge: judges.length }, ok ? 0 : 1)
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
  // A command decides a check: line. Judgment cannot overrule it.
  if (l.kind !== 'judge' && l.kind !== 'operator') refuse(`${id} is a ${l.kind} line; only judge and operator lines take a ruling`)
  if (!['pass', 'fail'].includes(ruling) || !note) refuse('usage: --judge <ID> pass|fail "<evidence ref or defect>"')
  if (ruling === 'pass') { evidence(id, `${l.kind} PASS`, note); if (tick) setBoxes([id], true) }
  else { defect(id, 'judge', note); if (tick) setBoxes([id], false) }
  console.log(`${id} ${ruling.toUpperCase()}`)
  out({ verdict: ruling === 'pass' ? 'PASS' : 'FAIL', id }, ruling === 'pass' ? 0 : 1)
}

let ids
if (has('--all') || has('--rule')) ids = lines.filter(l => l.kind === 'check').map(l => l.id)
else if (val('--ids')) ids = val('--ids').split(/[,\s]+/).filter(Boolean)
else if (val('--slice')) {
  const plan = pinned('.forge/PLAN.md')
  if (plan.error) refuse(plan.error)
  const s = parsePlan(plan.text).slices.find(x => x.id === val('--slice'))
  if (!s) refuse(`slice ${val('--slice')} is not in PLAN.md`)
  ids = s.closes.filter(id => (byId.get(id) || {}).kind === 'check')
} else {
  console.log('usage: dod-check.mjs --ids <IDS> | --slice <N> | --all | --judge | --rule | --show | --lint [--tick]')
  process.exit(2)
}

const intact = checksDirIntact()
if (!intact.ok) refuse(intact.why)

const res = { pass: [], fail: [], unknown: [], flaky: [] }
for (const id of ids) {
  const l = byId.get(id)
  if (!l) { res.unknown.push(id); console.log(`${id}  UNKNOWN  not in the armed rubric`); continue }
  if (l.kind !== 'check') continue
  const r = runTwice(l.body)
  const log = saveLog(id, `$ ${l.body}\n${r.out}`)
  if (r.flaky) res.flaky.push(id)
  res[r.state].push(id)
  const line1 = (r.tail.split('\n').pop() || '').slice(0, 120)
  console.log(`${id}  ${r.state.toUpperCase()}${r.flaky ? ' (flaky: failed once, passed on re-run)' : ''}  exit ${r.code}  ${line1}`)
  if (r.state === 'pass') evidence(id, `check PASS${r.flaky ? ' flaky' : ''}`, `${l.body} | exit 0 | ${log}`)
  else if (r.state === 'fail') { evidence(id, 'check FAIL', `${l.body} | exit 1 | ${log}`); defect(id, 'check', `exit 1: ${line1}`) }
  else evidence(id, 'check UNKNOWN', `${l.body} | could not run, exit ${r.code} | ${log}`)
}
if (tick) { setBoxes(res.pass, true); setBoxes(res.fail, false) }

const verdict = res.fail.length ? 'FAIL' : res.unknown.length ? 'UNKNOWN' : 'PASS'

if (has('--rule')) {
  // V0 is the verifier's PASS. It lands only when every check ran green just
  // now and every other line, judge and operator included, is ticked.
  const open = lines.filter(l => l.id !== 'V0' && !(res.pass.includes(l.id) || (l.kind !== 'check' && isTicked(l.id))))
  if (verdict !== 'PASS' || open.length) {
    for (const l of open) console.log(`open  ${l.id} | ${l.kind}`)
    console.log(`V0 not ticked: ${verdict === 'PASS' ? `${open.length} line(s) open` : `checks ${verdict}`}`)
    out({ verdict: verdict === 'PASS' ? 'FAIL' : verdict, open: open.map(l => l.id), ...res }, verdict === 'UNKNOWN' ? 2 : 1)
  }
  if (!byId.has('V0')) refuse('the rubric has no V0 line')
  setBoxes(['V0'], true)
  evidence('V0', 'rule PASS', `${lines.length} lines, all checks re-run green, every judge and operator line ticked`)
  console.log('V0 ticked: final verifier PASS')
}

console.log(`${res.pass.length} pass, ${res.fail.length} fail, ${res.unknown.length} could not run${dod.pinned ? ` (pinned ${dod.sha.slice(0, 8)})` : ' (unpinned: not armed)'}`)
out({ verdict, ...res, pinned: !!dod.pinned }, verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2)
