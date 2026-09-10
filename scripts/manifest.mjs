#!/usr/bin/env node
// Vendored drift: record it, report it, close it.
//
//   manifest.mjs record              write MANIFEST.json for this harness
//   manifest.mjs check <target>      report drift in a target project
//   manifest.mjs sync <target>       overwrite hash-clean files, preserve edits
//   manifest.mjs sync <target> --adopt   first install: take the harness version
//   manifest.mjs sync <target> --force   overwrite everything, edits included
//
// WHAT THE EVIDENCE SAID. spec-kit's recipe assumes files start identical and
// you detect divergence. Measured across two real target projects, nothing was
// ever identical:
//
//   script          harness   vitrine   tomb-raider
//   checks.sh          3636     23371           611
//   dod-gate.sh        3947      2574           601
//   commit.sh          3487      1894       absent
//   defect.sh           972    absent       absent
//
// Four of five differ between the two PRODUCTS, not just from the harness. And
// tomb-raider's dod-gate.sh was a 601-byte stub against the harness's 3,947:
// the Stop gate that enforces the entire rubric was not there. That run is the
// one recorded as folding under pressure. It did not fold; it had no gate.
//
// So a manifest that only detects divergence records the mess as the baseline.
// This one syncs first and detects after, and `check` is honest about the
// difference between a file that drifted and a file that never arrived.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, relative } from 'node:path'

const HARNESS = join(new URL('.', import.meta.url).pathname, '..')
const MANIFEST = 'MANIFEST.json'

// What travels into a target project. The harness's own README, START_HERE,
// PROMPT and BUILD_REPORT deliberately do NOT: one build shipped this repo's
// README verbatim inside a product.
const TRACKED = [
  { dir: 'scripts', match: f => /\.(sh|mjs)$/.test(f) && f !== 'selftest.sh' && f !== 'manifest.mjs' && f !== 'guard-test.sh' },
  { dir: '.claude/agents', match: f => f.endsWith('.md') },
  { dir: '.claude/skills', match: f => f.endsWith('.md'), recurse: true },
  { dir: '.claude/workflows', match: f => f.endsWith('.js') },
  { dir: '.claude/commands', match: f => f.endsWith('.md') },
]

const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex')

function walk (root, spec) {
  const base = join(root, spec.dir)
  if (!existsSync(base)) return []
  const out = []
  const rec = d => {
    for (const e of readdirSync(d)) {
      const full = join(d, e)
      if (statSync(full).isDirectory()) { if (spec.recurse) rec(full) }
      else if (spec.match(e)) out.push(relative(root, full))
    }
  }
  rec(base)
  return out
}

const files = () => TRACKED.flatMap(s => walk(HARNESS, s)).sort()

function buildManifest () {
  const m = { version: 1, generated: 'by scripts/manifest.mjs', files: {} }
  for (const f of files()) m.files[f] = sha(join(HARNESS, f))
  return m
}

const [cmd, target, ...rest] = process.argv.slice(2)
const force = rest.includes('--force')
const adopt = rest.includes('--adopt')

if (cmd === 'record') {
  const m = buildManifest()
  writeFileSync(join(HARNESS, MANIFEST), JSON.stringify(m, null, 2) + '\n')
  console.log(`recorded ${Object.keys(m.files).length} files to ${MANIFEST}`)
  process.exit(0)
}

if (!target) {
  console.error('usage: manifest.mjs record | check <target> | sync <target> [--force]')
  process.exit(2)
}
if (!existsSync(target)) { console.error(`no such target: ${target}`); process.exit(2) }

const current = buildManifest()
const recordedPath = join(target, '.forge', MANIFEST)
const recorded = existsSync(recordedPath) ? JSON.parse(readFileSync(recordedPath, 'utf8')) : null

const rows = []
for (const [f, want] of Object.entries(current.files)) {
  const tf = join(target, f)
  if (!existsSync(tf)) { rows.push({ f, state: 'absent' }); continue }
  const have = sha(tf)
  if (have === want) { rows.push({ f, state: 'current' }); continue }
  // A file matching what the manifest last recorded drifted because the HARNESS
  // moved, so it is safe to overwrite. A file matching neither was edited in
  // the target, and overwriting it would discard someone's work.
  // With no recorded manifest there IS no baseline, so "edited in the target"
  // is a guess, and guessing conservatively here is the exact failure spec-kit
  // shipped and withdrew: keep everything, and the project sits permanently
  // half-upgraded with no reinstall able to repair it. Say unknown instead, and
  // make the operator choose.
  if (!recorded) { rows.push({ f, state: 'unknown' }); continue }
  const wasRecorded = recorded.files?.[f]
  rows.push({ f, state: wasRecorded && have === wasRecorded ? 'stale' : 'edited' })
}

const by = s => rows.filter(r => r.state === s)
const counts = ['current', 'stale', 'edited', 'unknown', 'absent'].map(s => [s, by(s).length])

if (cmd === 'check') {
  console.log(`\n${target}`)
  for (const [s, n] of counts) console.log(`  ${s.padEnd(8)} ${n}`)
  for (const s of ['absent', 'unknown', 'edited', 'stale']) {
    for (const r of by(s)) console.log(`  ${s.padEnd(8)} ${r.f}`)
  }
  if (!recorded) {
    console.log('\n  No manifest recorded here, so nothing can be told apart from a local edit.')
    console.log('  This is a first install. Adopt the harness wholesale with --adopt, or')
    console.log('  diff the files you care about first.')
  }
  // Any file differing from the harness counts, edits included. An edit may be
  // deliberate, but this cannot tell a customisation from a 601-byte stub where
  // the Stop gate should be, and reporting clean over that is how a run loses
  // its gate without anyone noticing. Say what differs; the operator decides.
  const bad = rows.filter(r => r.state !== 'current').length
  if (bad) {
    console.log(`\n  ${bad} file(s) differ from this harness.`)
    console.log('  A trial run here exercises that version, not this one, and a difference')
    console.log('  reads as the new harness failing. One target once ran a 601-byte')
    console.log('  dod-gate.sh against a 3,947-byte original: the rubric had no gate at all.')
    console.log(`  Close it:  node scripts/manifest.mjs sync ${target} --adopt`)
  } else {
    console.log('\n  every tracked file matches this harness.')
  }
  process.exit(bad ? 1 : 0)
}

if (cmd === 'sync') {
  let wrote = 0, kept = 0
  for (const r of rows) {
    if (r.state === 'current') continue
    if (r.state === 'edited' && !force) { kept++; console.log(`  kept    ${r.f}  (edited in the target)`); continue }
    if (r.state === 'unknown' && !(force || adopt)) { kept++; console.log(`  kept    ${r.f}  (no baseline, cannot tell an edit from drift)`); continue }
    const dest = join(target, r.f)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(join(HARNESS, r.f), dest)
    wrote++
    console.log(`  wrote   ${r.f}${r.state === 'absent' ? '  (never arrived)' : ''}`)
  }
  // Stamp what is ACTUALLY on disk. Stamping the harness's hashes for a file we
  // deliberately KEPT writes a lie into the baseline: the next check reads clean
  // while the file is still wrong. That is how a half-upgrade goes silent, and
  // it is the whole failure this script exists to prevent.
  const stamped = { ...current, files: {} }
  for (const f of Object.keys(current.files)) {
    const tf = join(target, f)
    if (existsSync(tf)) stamped.files[f] = sha(tf)
  }
  mkdirSync(join(target, '.forge'), { recursive: true })
  writeFileSync(recordedPath, JSON.stringify(stamped, null, 2) + '\n')
  console.log(`\n  ${wrote} written, ${kept} kept, manifest stamped at .forge/${MANIFEST}`)
  if (kept) {
    console.log(recorded
      ? '  Re-run with --force to overwrite the kept files too.'
      : '  Re-run with --adopt to take the harness version of every unknown file.')
  }
  process.exit(0)
}

console.error(`unknown command: ${cmd}`)
process.exit(2)
