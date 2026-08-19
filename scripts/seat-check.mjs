#!/usr/bin/env node
// Checks that every agent seat's CONFIGURATION grants what its own PROSE
// orders. Run standalone or from selftest.sh. Exits 1 on any mismatch.
//
// Run two shipped four seats that could not do their stated job. The verifier,
// the only seat permitted to clear the Stop gate, had no Edit and flipped seven
// checkboxes through `sed -i`. The finisher was told to write REPORT.md with
// `tools: Read, Bash` and would have failed at the run's last step. Nothing
// caught any of it, because the only test asked whether the frontmatter parsed,
// not whether it agreed with the body above it.
//
// A seat is a contract between two halves of one file. This reads both.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.argv[2] || '.claude/agents'

// Each rule: a signal in the prose, and the tools any one of which satisfies it.
// Patterns are deliberately high-precision. A rule that fires on prose the seat
// did not mean would train people to ignore this file, which is how the
// frontmatter test became decorative.
const RULES = [
  { need: ['Write', 'Edit'], why: 'writes a file',
    re: /\b(?:writes?|Write)\s+`?\.forge\/[A-Za-z-]+\.(?:md|json)/ },
  { need: ['Edit', 'Write'], why: 'edits DOD.md checkboxes',
    re: /flip (?:it|each|them|the line)[^.]{0,40}\[x\]|checkboxes are (?:yours|the verifier)/i },
  { need: ['WebFetch'], why: 'opens a Claude Design link',
    re: /claude\.ai\/design|Claude Design (?:handoff|link|share|bundle)/i },
  // The verb matters. The architect's prose says PREFLIGHT.md is "read by
  // scripts/preflight.sh", which names the reader and orders nothing; matching
  // a bare mention flagged a seat that correctly has no Bash. Require a verb
  // that puts the script in the seat's own hands.
  { need: ['Bash'], why: 'runs a harness script',
    re: /\b(?:Run|run|Call|call|invoke|execute|with|via|using)\s+`?scripts\/[a-z-]+\.(?:sh|mjs)\b/ },
  { need: ['Bash'], why: 'runs a shell command',
    re: /^\s*(?:\d+\.\s*)?(?:Run|run) `(?:npm|pnpm|npx|git|vercel|eas|node)\b/m },
  { need: ['WebSearch', 'WebFetch'], why: 'researches the open web',
    re: /\b(?:search the web|web search|WebSearch)\b/i },
]

let bad = 0
let seats = 0
for (const f of readdirSync(DIR).filter(f => f.endsWith('.md')).sort()) {
  const raw = readFileSync(join(DIR, f), 'utf8')
  const parts = raw.split('---')
  if (parts.length < 3) { console.log(`FAIL ${f}: no frontmatter`); bad++; continue }
  const fm = parts[1]
  const body = parts.slice(2).join('---')
  seats++

  const tl = /^tools:\s*(.+)$/m.exec(fm)
  // No tools line means every tool, which no seat should have but is not this
  // check's business.
  if (!tl) continue
  const have = new Set(tl[1].split(',').map(s => s.trim()).filter(Boolean))

  for (const r of RULES) {
    const m = r.re.exec(body)
    if (!m) continue
    if (r.need.some(t => have.has(t))) continue
    bad++
    console.log(`FAIL ${f}: prose ${r.why}, tools grant none of ${r.need.join('/')}`)
    console.log(`     prose: ${m[0].replace(/\s+/g, ' ').trim().slice(0, 72)}`)
    console.log(`     tools: ${[...have].join(', ')}`)
  }

  // A turn ceiling that truncates produces a silently incomplete result, which
  // is worse than the runaway it guards. Run two capped the builder at 80 while
  // it used 170. Nothing here can know the real figure, so this only catches
  // ceilings low enough to be obviously wrong for the seat's described job.
  const mt = /^maxTurns:\s*(\d+)/m.exec(fm)
  if (mt && have.has('Bash') && +mt[1] < 50) {
    bad++
    console.log(`FAIL ${f}: maxTurns ${mt[1]} for a seat that runs commands; run two truncated at 80`)
  }
}

console.log(bad === 0
  ? `seat-check: ${seats} seat(s), prose and configuration agree`
  : `seat-check: ${bad} mismatch(es)`)
process.exit(bad === 0 ? 0 : 1)
