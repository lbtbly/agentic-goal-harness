#!/usr/bin/env node
// Shared by dod-check.mjs, gate.mjs and slices.mjs, so the three can never
// disagree about the rubric format, the plan format or what "pinned" means.
// Running this file directly does nothing.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

export const ts = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z')

// Every forge script no-ops outside a forge project: exit 0, nothing written.
export function enterProject () {
  try { process.chdir(process.env.CLAUDE_PROJECT_DIR || '.') } catch { return false }
  return existsSync('.forge')
}

export function git (args, opts = {}) {
  const r = spawnSync('git', args, { encoding: 'utf8', ...opts })
  // Three states, kept apart: git answered yes, git answered no, git could not
  // be asked. A blocked Xcode license makes git exit 69 with a message on
  // stderr, which must never read as "file absent".
  if (r.error || r.status === 69 || /xcodebuild -license/.test(r.stderr || '')) return { state: 'unusable', out: '', err: String(r.error || r.stderr) }
  return { state: r.status === 0 ? 'ok' : 'no', out: r.stdout || '', err: r.stderr || '' }
}

// .forge/ARMED holds the commit that froze the approved rubric: "sha <hex>".
export function armedSha () {
  if (!existsSync('.forge/ARMED')) return null
  const m = /^sha\s+([0-9a-f]{7,40})\s*$/m.exec(readFileSync('.forge/ARMED', 'utf8'))
  return m ? m[1] : 'missing'
}

// The text the run is held to. Armed: the committed version, never the working
// copy, so a check rewritten after approval is ignored. Not armed: the working
// copy, labelled unpinned.
export function pinned (path) {
  const sha = armedSha()
  if (!sha) return existsSync(path) ? { text: readFileSync(path, 'utf8'), pinned: false } : { error: `${path} not found` }
  if (sha === 'missing') return { error: '.forge/ARMED carries no "sha <commit>" line' }
  const r = git(['show', `${sha}:${path}`])
  if (r.state === 'unusable') return { error: `git unusable: ${r.err.split('\n')[0]}`, unusable: true }
  if (r.state === 'no') return { error: `${path} is not in the armed commit ${sha}` }
  return { text: r.out, pinned: true, sha }
}

// .forge/checks/ holds check scripts too long for one rubric line. They are
// pinned the same way: any difference from the armed commit refuses the run.
export function checksDirIntact () {
  const sha = armedSha()
  if (!sha || !existsSync('.forge/checks')) return { ok: true }
  const r = git(['diff', '--quiet', sha, '--', '.forge/checks'])
  if (r.state === 'unusable') return { ok: false, why: 'git unusable, cannot prove .forge/checks is unchanged' }
  if (r.state === 'no') {
    // diff --quiet exits 1 on a difference, 128 on a bad ref; both refuse.
    return { ok: false, why: `.forge/checks differs from the armed commit ${sha}; amend and re-arm instead` }
  }
  return { ok: true }
}

// - [ ] F3 | property, one sentence | check: <command>
// - [x] C2 | property | judge: <what, threshold>
// - [ ] R4 | property | operator: <what the human proves>
// - [ ] V0 | final verifier PASS | rule
const LINE = /^- \[([ xX])\] ([A-Z]+\d+[a-z]?) \| (.+?) \| (check|judge|operator|rule)(?::\s*(.*))?$/
export function parseDod (text) {
  const lines = []
  text.split('\n').forEach((raw, i) => {
    const m = LINE.exec(raw.trimEnd())
    if (m) lines.push({ id: m[2], checked: m[1] !== ' ', prop: m[3], kind: m[4], body: (m[5] || '').trim(), lineNo: i })
  })
  return lines
}
// Any checkbox line that does not parse is a defect in the rubric, not a line
// to skip: an unparsed line is a line nobody will ever rule on.
export function unparsedBoxes (text) {
  return text.split('\n').filter(l => /^- \[[ xX]\]/.test(l) && !LINE.test(l.trimEnd()))
}

// ## Checks
// - typecheck: <command>
// ## Slice 3: <name>
// Tier: standard | light      Confidence: high | low      Group: 3
// Milestone: yes              Scope: <routes, modules>; shared: none
// Closes: F1, F2, C3
export function parsePlan (text) {
  const checks = {}
  const slices = []
  let section = null
  let cur = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const h = /^##\s+(.*)$/.exec(line)
    if (h) {
      const s = /^Slice\s+([0-9]+[a-z]?)\s*[:.-]?\s*(.*)$/i.exec(h[1])
      if (s) { cur = { id: s[1], name: s[2] || `slice ${s[1]}`, tier: 'standard', confidence: 'high', group: s[1], milestone: false, closes: [], scope: '' }; slices.push(cur); section = 'slice' }
      else { cur = null; section = /^checks\b/i.test(h[1]) ? 'checks' : 'other' }
      continue
    }
    if (section === 'checks') {
      const c = /^[-*]?\s*(typecheck|lint|test|build|holdout)\s*:\s*`?(.+?)`?\s*$/i.exec(line)
      if (c) checks[c[1].toLowerCase()] = c[2]
    }
    if (section === 'slice' && cur) {
      const f = /^(Tier|Confidence|Group|Milestone|Scope|Closes)\s*:\s*(.+)$/i.exec(line)
      if (!f) continue
      const k = f[1].toLowerCase(); const v = f[2].trim()
      if (k === 'closes') cur.closes = v.split(/[,\s]+/).map(x => x.trim()).filter(x => /^[A-Z]+\d+[a-z]?$/.test(x))
      else if (k === 'milestone') cur.milestone = /^(yes|true)$/i.test(v)
      else if (k === 'tier') cur.tier = /light/i.test(v) ? 'light' : 'standard'
      else if (k === 'confidence') cur.confidence = /low/i.test(v) ? 'low' : 'high'
      else cur[k] = v
    }
  }
  return { checks, slices }
}

// Run one command. Exit 0 is pass, exit 1 is fail, anything else is
// could-not-run: 127 not found, 124 or a kill on timeout, 2 misuse, 69 a
// blocked toolchain. Could-not-run is UNKNOWN and is never read as green.
export function run (cmd, { cwd = '.', timeoutMs = +(process.env.FORGE_CHECK_TIMEOUT || 300) * 1000 } = {}) {
  const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, FORGE: '1', CI: '1' } })
  const out = `${r.stdout || ''}${r.stderr || ''}`
  const tail = out.trim().split('\n').slice(-12).join('\n').slice(-1500)
  if (r.error || r.signal) return { state: 'unknown', code: r.signal || 'error', out, tail: `${r.signal ? 'timed out or killed' : String(r.error)}\n${tail}` }
  if (r.status === 0) return { state: 'pass', code: 0, out, tail }
  if (r.status === 1) return { state: 'fail', code: 1, out, tail }
  return { state: 'unknown', code: r.status, out, tail }
}

// A failing check is re-run once before it counts. Flaky end-to-end tests and
// live URLs fail red for reasons that are not the build.
export function runTwice (cmd, opts) {
  const a = run(cmd, opts)
  if (a.state !== 'fail') return a
  const b = run(cmd, opts)
  return b.state === 'pass' ? { ...b, flaky: true } : b
}

export function evidence (id, verdict, detail) {
  const one = String(detail).replace(/\s+/g, ' ').trim().slice(0, 240)
  appendFileSync('.forge/EVIDENCE.md', `${ts()} | ${id} | ${verdict} | ${one}\n`)
}
export function defect (id, severity, what) {
  const one = String(what).replace(/\s+/g, ' ').trim().slice(0, 240)
  appendFileSync('.forge/DEFECTS.md', `${ts()} | ${id} | ${severity} | ${one}\n`)
}
export function saveLog (id, out) {
  mkdirSync('.forge/evidence/checks', { recursive: true })
  writeFileSync(`.forge/evidence/checks/${id}.log`, out)
  return `.forge/evidence/checks/${id}.log`
}

// Tick or un-tick lines in the WORKING DOD.md by id. The armed copy is never
// written; it is the contract, the working copy is the scoreboard.
export function setBoxes (ids, on) {
  if (!ids.length || !existsSync('.forge/DOD.md')) return 0
  const want = new Set(ids)
  let n = 0
  const text = readFileSync('.forge/DOD.md', 'utf8').split('\n').map(raw => {
    const m = /^- \[([ xX])\] ([A-Z]+\d+[a-z]?) \|/.exec(raw)
    if (!m || !want.has(m[2])) return raw
    const isOn = m[1] !== ' '
    if (isOn === on) return raw
    n++
    return raw.replace(/^- \[[ xX]\]/, on ? '- [x]' : '- [ ]')
  }).join('\n')
  writeFileSync('.forge/DOD.md', text)
  return n
}
