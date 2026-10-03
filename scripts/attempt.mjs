#!/usr/bin/env node
// The escalation ladder's ledger. The ladder itself runs in build.js; this is
// the part that survives a compaction, a crash and a relaunch.
//
//   attempt.mjs record <slice> <PASS|FAIL>   log a gate verdict, print the state
//   attempt.mjs base   <slice> <sha> [--force]  pre-slice commit, set once
//   attempt.mjs state  <slice>               print fails, passes, base, rung
//   attempt.mjs reset  <slice>               clear after a rewind and re-slice
//
// Parallel gates on L write here at once, so every write takes a lock.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmdirSync, statSync } from 'node:fs'

const root = process.env.CLAUDE_PROJECT_DIR || '.'
try { process.chdir(root) } catch { process.exit(0) }
if (!existsSync('.forge')) process.exit(0)

const LEDGER = '.forge/ATTEMPTS.json'
const LOCK = '.forge/.attempts.lock'
const [cmd = 'state', slice, arg, flag] = process.argv.slice(2)
if (!slice) { console.error('attempt.mjs: no slice named'); process.exit(1) }

function withLock (fn) {
  for (let i = 0; i < 200; i++) {
    try { mkdirSync(LOCK); break } catch {
      // A lock older than a minute belongs to a dead writer.
      try { if (Date.now() - statSync(LOCK).mtimeMs > 60000) rmdirSync(LOCK) } catch {}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
    }
  }
  try { return fn() } finally { try { rmdirSync(LOCK) } catch {} }
}

const load = () => {
  try { const d = JSON.parse(readFileSync(LEDGER, 'utf8')); return d && typeof d === 'object' ? d : {} } catch { return {} }
}
const save = d => writeFileSync(LEDGER, JSON.stringify(d, null, 2) + '\n')
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z')
const blank = () => ({ fails: 0, passes: 0, base: null, history: [] })

const row = withLock(() => {
  const d = load()
  const r = { ...blank(), ...(d[slice] || {}) }
  if (cmd === 'record') {
    const v = String(arg || '').toUpperCase()
    if (v !== 'PASS' && v !== 'FAIL') { console.error('attempt.mjs: verdict must be PASS or FAIL'); process.exit(1) }
    v === 'FAIL' ? r.fails++ : r.passes++
    r.history.push({ ts: now(), verdict: v })
  } else if (cmd === 'base') {
    if (!/^[0-9a-f]{7,40}$/.test(arg || '')) { console.error('attempt.mjs: base needs a commit sha'); process.exit(1) }
    // Set once. A retry continues from the tree it left; only a rewind moves it.
    if (!r.base || flag === '--force') r.base = arg
  } else if (cmd === 'reset') {
    Object.assign(r, { fails: 0, passes: 0, history: [...r.history, { ts: now(), verdict: 'RESET' }] })
  } else if (cmd !== 'state') {
    console.error('attempt.mjs: unknown command'); process.exit(1)
  }
  if (cmd !== 'state') { d[slice] = r; save(d) }
  return r
})

// The last verdict decides green, not the count: a slice that failed twice and
// then passed is green.
// A rewind clears the slate: after RESET there is no last verdict.
const tail = row.history[row.history.length - 1]
const last = tail && tail.verdict !== 'RESET' ? tail : null
const rung = last && last.verdict === 'PASS' ? 'green'
  : row.fails === 0 ? 'clear'
  : row.fails === 1 ? 'retry with the gate output'
  : row.fails === 2 ? 'raise to opus, high effort'
  : 'stuck: oracle if triggered, else rewind to base and re-slice'
console.log(`slice ${slice}: ${row.fails} fail(s), ${row.passes} pass(es), last ${last ? last.verdict : 'none'}, base ${row.base || 'unset'} | rung: ${rung}`)
