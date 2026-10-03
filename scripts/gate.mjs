#!/usr/bin/env node
// The per-slice gate. Deterministic, minutes not hours, and absolute: a slice
// is green only when every pinned check ran and passed.
//
//   gate.mjs <slice> [--tree <path>]
//   gate.mjs fix --ids <ID,ID>      after a verifier FAIL: the same checks, those lines
//
// Runs, from the armed PLAN.md: typecheck, lint, test, build when declared.
// Then the slice's check: lines through dod-check, a scan of the slice diff
// for suppressions, and records the verdict in the ledger. It never runs the
// holdout suite and never prints it: that suite belongs to the verifier.
//
// --tree runs in a worktree (parallel L builders). There it ticks nothing and
// records nothing: the gate re-runs on the main tree after the merge.
//
// Three states, never two: PASS, FAIL, UNKNOWN (something could not run).
// UNKNOWN is never green and is not a FAIL: it means the environment, not the
// build, and it routes to a prerequisite rather than up the ladder.
// Last line of output is JSON. Exit 0 PASS, 1 FAIL, 2 UNKNOWN.
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { enterProject, pinned, parsePlan, run, runTwice, defect, git } from './forge-lib.mjs'

if (!enterProject()) process.exit(0)
const project = process.cwd()
const HERE = new URL('.', import.meta.url).pathname

const argv = process.argv.slice(2)
const slice = argv.find(a => !a.startsWith('--'))
const ti = argv.indexOf('--tree')
const tree = ti < 0 ? null : argv[ti + 1]
const ii = argv.indexOf('--ids')
const fixIds = ii < 0 ? null : argv[ii + 1]
const FIX = slice === 'fix'
if (!slice || (FIX && !fixIds)) { console.log('usage: gate.mjs <slice> [--tree <path>] | gate.mjs fix --ids <IDS>'); process.exit(2) }
const cwd = tree || project

const failures = []
const unknown = []
const note = (list, what, tail) => list.push({ what, tail: String(tail || '').slice(-600) })
const finish = () => {
  const verdict = failures.length ? 'FAIL' : unknown.length ? 'UNKNOWN' : 'PASS'
  if (!tree && !FIX) {
    if (verdict !== 'UNKNOWN') spawnSync('node', [join(HERE, 'attempt.mjs'), 'record', slice, verdict], { stdio: 'inherit' })
    for (const f of failures) if (!/^[A-Z]+\d/.test(f.what)) defect(`S${slice}-${f.what}`, 'gate', f.tail.split('\n').pop() || f.what)
  }
  const summary = [
    ...failures.map(f => `FAIL ${f.what}: ${f.tail.split('\n').slice(-4).join(' / ')}`),
    ...unknown.map(u => `COULD NOT RUN ${u.what}: ${u.tail.split('\n').slice(-2).join(' / ')}`),
  ].join('\n').slice(0, 1800)
  // The board renders once per gate, the natural heartbeat of a build: often
  // enough to watch, a thousand times rarer than v1's render per evidence line.
  if (!tree) spawnSync('node', [join(HERE, 'progress.mjs')], { cwd: project, stdio: 'ignore', timeout: 60000 })
  console.log(`gate slice ${slice}: ${verdict}`)
  console.log(JSON.stringify({ slice, verdict, failures, unknown, summary }))
  process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2)
}

const plan = pinned('.forge/PLAN.md')
if (plan.error) { note(unknown, 'plan', plan.error); finish() }
const { checks, slices } = parsePlan(plan.text)
if (!FIX && !slices.find(s => s.id === slice)) { note(unknown, 'plan', `slice ${slice} is not in the armed PLAN.md`); finish() }
if (!checks.test && !checks.typecheck) { note(unknown, 'plan', 'PLAN.md ## Checks pins neither test nor typecheck; the gate has nothing to stand on') }

// 1. The project's own checks, exactly as pinned at the greenlight.
for (const k of ['typecheck', 'lint', 'build', 'test']) {
  if (!checks[k]) continue
  const r = k === 'test' ? runTwice(checks[k], { cwd }) : run(checks[k], { cwd })
  console.log(`${k.padEnd(9)} ${r.state.toUpperCase()}${r.flaky ? ' (flaky)' : ''}  exit ${r.code}`)
  if (r.state === 'fail') note(failures, k, r.tail)
  else if (r.state === 'unknown') note(unknown, k, r.tail)
}

// 2. Suppressions added since the slice's base, committed or not, new files
// included. A green suite that got green by switching itself off is not
// green. Allowed patterns come from the ARMED commit only, one regex per line
// in .forge/overrides/suppress-allow: a builder cannot widen them mid-run.
// A commit refusal means the history the scan reads has stopped moving, so
// the gate cannot vouch for anything until it is cleared.
if (existsSync(join(project, '.forge/COMMIT-BLOCKED'))) {
  note(unknown, 'commits', readFileSync(join(project, '.forge/COMMIT-BLOCKED'), 'utf8').split('\n').slice(0, 3).join(' / '))
}
let base = null
try { base = (JSON.parse(readFileSync(join(project, '.forge/ATTEMPTS.json'), 'utf8'))[FIX ? 'fix' : slice] || {}).base } catch {}
if (base) {
  const d = git(['diff', '-U0', base, '--', '.', ':(exclude).forge'], { cwd })
  const u = git(['ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude).forge'], { cwd })
  if (d.state === 'unusable') note(unknown, 'suppression-scan', d.err)
  else if (d.state === 'ok') {
    // `|| true` counts only where it swallows a check, not in a setup script.
    const SUPPRESS = /eslint-disable|@ts-nocheck|@ts-ignore|@ts-expect-error|\b(?:it|test|describe)\.(?:skip|only)\(|\bx(?:it|describe)\(|(?:test|lint|tsc|typecheck|vitest|jest|eslint|pytest|playwright)[^\n]*\|\|\s*true\b/
    const ap = pinned('.forge/overrides/suppress-allow')
    const allow = ap.text ? ap.text.split('\n').filter(l => l && !l.startsWith('#')).map(l => new RegExp(l)) : []
    const added = d.out.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
    for (const f of (u.state === 'ok' ? u.out.split('\n').filter(Boolean) : [])) {
      try { added.push(...readFileSync(join(cwd, f), 'utf8').split('\n').map(l => `+${l}`)) } catch {}
    }
    const hits = added.filter(l => SUPPRESS.test(l) && !allow.some(a => a.test(l)))
    console.log(`suppress  ${hits.length ? 'FAIL' : 'PASS'}  ${hits.length} added`)
    if (hits.length) note(failures, 'suppression', hits.slice(0, 8).join('\n'))
  }
} else {
  console.log(`suppress  SKIPPED  no base commit recorded for ${FIX ? 'this fix round' : 'this slice'}`)
}

// 3. The slice's own rubric lines, from the armed commit. In a worktree this
// reads the tree's own checks and ticks nothing.
const scope = FIX ? ['--ids', fixIds] : ['--slice', slice]
const dc = spawnSync('node', [join(HERE, 'dod-check.mjs'), ...scope, ...(tree ? [] : ['--tick'])], {
  cwd, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: cwd }, maxBuffer: 32 * 1024 * 1024,
})
const last = (dc.stdout || '').trim().split('\n').pop() || '{}'
let res = {}
try { res = JSON.parse(last) } catch { res = { verdict: 'UNKNOWN', refused: 'dod-check printed no verdict' } }
for (const id of res.fail || []) {
  const log = existsSync(join(cwd, `.forge/evidence/checks/${id}.log`)) ? readFileSync(join(cwd, `.forge/evidence/checks/${id}.log`), 'utf8') : ''
  note(failures, id, log.trim().split('\n').slice(-8).join('\n'))
}
for (const id of res.unknown || []) note(unknown, id, 'check could not run')
if (res.refused) note(unknown, 'dod-check', res.refused)
console.log(`rubric    ${res.verdict || 'UNKNOWN'}  ${(res.pass || []).length} pass, ${(res.fail || []).length} fail, ${(res.unknown || []).length} could not run`)

finish()
