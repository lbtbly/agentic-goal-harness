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
// - typecheck: <command>        (also lint, test, build, install, holdout)
// ## Slice 3: <name>            (## to ####; ": name" or " - name")
// Tier: standard | light        Confidence: high | low      Group: 3
// Milestone: yes                Scope: <routes, modules>; shared: none
// Closes: F1, F2-F4, C3         (bullets, bold, backticks, ranges and a
//                                wrapped second line are all read)
//
// Lenient on purpose: a field this cannot read is a slice that closes
// nothing, which the gate would wave through. dod-check --lint then names
// every slice that closes nothing rather than trusting the parse.
const ID = /^[A-Z]+\d+[a-z]?$/
export function expandIds (text) {
  const out = []
  for (const tok of String(text).replace(/[`*_]/g, '').split(/[,;\s]+/).filter(Boolean)) {
    const r = /^([A-Z]+)(\d+)(?:-|–|—|\.\.)([A-Z]+)?(\d+)$/.exec(tok)
    if (r && (!r[3] || r[3] === r[1]) && +r[4] >= +r[2] && +r[4] - +r[2] < 200) {
      for (let n = +r[2]; n <= +r[4]; n++) out.push(`${r[1]}${n}`)
    } else if (ID.test(tok)) out.push(tok)
  }
  return out
}
const RANGE = /^[A-Z]+\d+[a-z]?(?:(?:-|–|—|\.\.)[A-Z]*\d+)?$/
const isIdList = t => { const toks = t.split(/[,;\s]+/).filter(Boolean); return toks.length > 0 && toks.every(x => RANGE.test(x)) }
const unmark = l => l.replace(/\*\*|__/g, '').replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '').trim()
export function parsePlan (text) {
  const checks = {}
  const slices = []
  let section = null
  let cur = null
  let last = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const h = /^#{2,4}\s+(.*)$/.exec(line)
    if (h) {
      last = null
      const title = h[1].replace(/\*\*|__|`/g, '').trim()
      const s = /^Slice\s+([0-9]+[a-z]?)\b\s*[:.)\-–—]?\s*(.*)$/i.exec(title)
      if (s) { cur = { id: s[1], name: s[2] || `slice ${s[1]}`, tier: 'standard', confidence: 'high', group: s[1], milestone: false, closes: [], scope: '' }; slices.push(cur); section = 'slice' }
      else { cur = null; section = /^checks\b/i.test(title) ? 'checks' : 'other' }
      continue
    }
    if (!line) { last = null; continue }
    if (section === 'checks') {
      // Only the label is unmarked: a command keeps its globs and underscores.
      const c = /^(?:[-*+]\s+|\d+[.)]\s+)?(?:\*\*|__)?(typecheck|lint|test|build|install|holdout)(?:\*\*|__)?\s*:(?:\*\*|__)?\s*(.+)$/i.exec(line)
      if (c) checks[c[1].toLowerCase()] = c[2].trim().replace(/^`([^`]+)`$/, '$1')
      continue
    }
    if (section === 'slice' && cur) {
      const norm = unmark(line).replace(/`/g, '')
      const f = /^(Tier|Confidence|Group|Milestone|Scope|Closes)\s*:\s*(.*)$/i.exec(norm)
      if (!f) {
        // A Closes list wrapped onto the next line carries on there.
        if (last === 'closes' && isIdList(norm)) cur.closes.push(...expandIds(norm))
        else last = null
        continue
      }
      const k = f[1].toLowerCase(); const v = f[2].trim()
      last = k
      if (k === 'closes') cur.closes = expandIds(v)
      else if (k === 'milestone') cur.milestone = /^(yes|true)\b/i.test(v)
      else if (k === 'tier') cur.tier = /light/i.test(v) ? 'light' : 'standard'
      else if (k === 'confidence') cur.confidence = /low/i.test(v) ? 'low' : 'high'
      else cur[k] = v
    }
  }
  return { checks, slices }
}

// Run one command under pipefail, so `cmd | tail` fails when cmd fails.
// Exit 0 is pass. Could-not-run is the machine, never the build: 126 not
// executable, 127 not found, 69 a blocked toolchain, a timeout or a kill.
// Every other non-zero exit is a FAIL: tsc exits 2 on a type error, cargo
// 101, xcodebuild 65, curl -f 22, and none of those mean "could not run".
const CANNOT_RUN = new Set([126, 127, 69])
const CURL_UNREACHABLE = new Set([6, 7, 28, 35, 52, 56])
// A stage that stops reading early (grep -q, head) makes the writer die of
// SIGPIPE, and pipefail would report that as the pipeline's failure, which
// inverts `! cmd | grep -q`. Such pipelines keep plain bash semantics.
const EARLY_EXIT = /\|\s*(?:head\b|grep\b[^|]*(?:\s-[a-zA-Z]*[qm]|--quiet|--silent|--max-count))/
export function run (cmd, { cwd = '.', timeoutMs = +(process.env.FORGE_CHECK_TIMEOUT || 300) * 1000 } = {}) {
  const shell = EARLY_EXIT.test(cmd) ? ['-c', cmd] : ['-o', 'pipefail', '-c', cmd]
  const r = spawnSync('bash', shell, { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, FORGE: '1', CI: '1' } })
  const out = `${r.stdout || ''}${r.stderr || ''}`
  const tail = out.trim().split('\n').slice(-12).join('\n').slice(-1500)
  if (r.error || r.signal) return { state: 'unknown', code: r.signal || 'error', out, tail: `${r.signal ? 'timed out or killed' : String(r.error)}\n${tail}` }
  if (r.status === 0) return { state: 'pass', code: 0, out, tail }
  if (CANNOT_RUN.has(r.status) || (/\bcurl\b/.test(cmd) && CURL_UNREACHABLE.has(r.status))) return { state: 'unknown', code: r.status, out, tail }
  return { state: 'fail', code: r.status, out, tail }
}

// A failing or could-not-run check is re-run once before it counts. Flaky
// end-to-end tests and live URLs go red, or dark, for reasons that are not
// the build.
export function runTwice (cmd, opts) {
  const a = run(cmd, opts)
  if (a.state === 'pass') return a
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
