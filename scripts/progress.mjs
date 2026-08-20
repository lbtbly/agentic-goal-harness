#!/usr/bin/env node
// Renders .forge/PROGRESS.html from the state files. Called by runlog.sh,
// checkpoint.sh, and evidence.sh; safe to run by hand. No-ops without .forge/.
// Wallboard layout in the Dark Bench style (styles-library): matte graphite,
// dotted canvas, one rationed green. Fills one screen, no scroll.
// The state files stay the source of truth; this file only draws them.
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, openSync, readSync, closeSync, mkdirSync, copyFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'

if (!existsSync('.forge')) process.exit(0)

const read = f => { try { return readFileSync(f, 'utf8') } catch { return '' } }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const trunc = (s, n) => s.length > n ? s.slice(0, n - 3) + '...' : s
// Recursive, because captures get filed per slice. Slice 1 wrote eleven of them
// into .forge/shots/slice1/ and a flat readdir returned the single string
// "slice1", so the screenmap counted zero captures for the whole run and said
// so confidently. A counter that reads a directory name as a file is the same
// defect class as a sweep that reports clean over an empty set.
const safeDir = (d, depth = 4) => {
  let out = []
  let entries
  try { entries = readdirSync(d, { withFileTypes: true }) } catch { return [] }
  for (const e of entries) {
    if (e.isDirectory()) { if (depth > 0) out = out.concat(safeDir(`${d}/${e.name}`, depth - 1)) }
    else out.push(e.name)
  }
  return out
}

const brief = read('.forge/BRIEF.md')
const design = read('.forge/DESIGN.md')
const dod = read('.forge/DOD.md')
const plan = read('.forge/PLAN.md')
const resume = read('.forge/RESUME.md')
const runlog = read('.forge/RUNLOG.md')
const evidence = read('.forge/EVIDENCE.md')
const greenlight = read('.forge/GREENLIGHT.md')
const armed = existsSync('.forge/ARMED')
const shipped = existsSync('.forge/REPORT.md')

const goal = (brief.match(/^Goal:\s*(.+)$/m) || [, ''])[1]
// The board's title is the product's name when the run has minted one,
// else the goal clipped at its first natural seam. The full goal stays
// readable as the heading's hover title.
const reportHead = read('.forge/REPORT.md').slice(0, 400)
const prodName = ((plan.match(/^##\s*The name\b[\s\S]{0,160}?\*\*([^*\n]{2,40}?)\.?\*\*/im) || [])[1]
  || (reportHead.match(/^#\s*REPORT:\s*([^\n]{2,48})/m) || [])[1] || '').trim()
const boardTitle = prodName || (goal ? trunc(goal.split(/,| to | so that | including /)[0], 48) : 'Forge run')

// Evidence: ids that carry at least one recorded line. The id field may
// hold several ids and a qualifier ("F23/F24 (supporting, local)"); every
// id in it counts as evidence recorded, and the verifier still rules.
const evidenced = new Set()
for (const line of evidence.split('\n')) {
  const m = line.match(/^\S+ \| ([^|]+) \|/)
  if (m) for (const id of m[1].match(/[A-Za-z]+\d+/g) || []) evidenced.add(id)
}
const evidenceLines = evidence.trim() ? evidence.trim().split('\n') : []

// ------------------------------------------------------------------ defects
// A rubric line that FAILED verification four times used to be byte-identical
// on this board to a line nobody had attempted: DOD.md carries a checkbox and
// nothing else, and RUNLOG.md records no failures at all. So the board drew a
// red run and a green run the same way, which is the one thing a board must
// never do.
//
// Three sources, in order of authority. All three are read-only; none of them
// asks the run to write anything new, so a run already in flight lights up on
// the next render.
//
//   1 .forge/VERDICT-*.md   the rulings of record, written per verify round
//   2 .forge/DEFECTS.md     the ledger scripts/defect.sh appends to, when the
//                           harness that wrote this state had one
//   3 EVIDENCE.md prose     "R31 FAIL | ..." in the id field, or a body that
//                           opens on FAIL / DEFECT / BLOCKED
//
// Conservative on purpose. A false red is worse than a missing one, so a
// mention of the word "failed" halfway through a paragraph is not a ruling.
const failures = {}
const noteFail = (id, at, why, src) => {
  if (!id) return
  const prev = failures[id]
  if (prev && prev.at >= at) return
  failures[id] = { at, why: (why || '').replace(/\s+/g, ' ').trim(), src }
}
const RULING_RX = /\b([A-Z]{1,3}\d{1,3})\b[ \t]*(?:[-:–]|is|ruled|=)?[ \t]*\**(PASS|FAIL)\b/g
// 1. Verdict files. Newest first by mtime, so a re-rule supersedes the round
// it re-ran without either file having to know about the other.
const verdictFiles = []
try {
  for (const f of readdirSync('.forge')) {
    if (!/^VERDICT[-_.].*\.md$/i.test(f)) continue
    let mt = 0; try { mt = statSync(`.forge/${f}`).mtimeMs } catch {}
    verdictFiles.push({ f, mt })
  }
} catch {}
verdictFiles.sort((a, b) => a.mt - b.mt)
for (const { f, mt } of verdictFiles) {
  const body = read(`.forge/${f}`)
  // The date the ruling states beats the date the filesystem remembers. An
  // mtime is not a fact about the run: copy the state directory anywhere and
  // every verdict becomes simultaneous, and the ordering that decides whether
  // a later PASS closes an earlier FAIL collapses with it.
  const stamps = [...body.matchAll(/\b(\d{4}-\d{2}-\d{2})(?:T[\d:]+Z?)?/g)]
    .map(x => Date.parse(x[0].length > 10 ? x[0] : `${x[1]}T23:59:59Z`)).filter(n => !isNaN(n))
  const at = stamps.length ? Math.max(...stamps) : mt
  for (const m of body.matchAll(RULING_RX)) {
    if (m[2].toUpperCase() === 'PASS') {
      if ((failures[m[1]] || {}).at <= at) delete failures[m[1]]
      continue
    }
    // The sentence the ruling sits in, as the reason.
    const from = body.lastIndexOf('\n', m.index) + 1
    const to = body.indexOf('\n', m.index)
    noteFail(m[1], at, body.slice(from, to < 0 ? body.length : to), f)
  }
}
// 2. The ledger, when one exists. Absent on every run older than it, which is
// why it is never the only source.
for (const line of read('.forge/DEFECTS.md').split('\n')) {
  const m = line.match(/^(\S+) \| ([^|]+) \| ([^|]*) \| (.*)$/)
  if (!m) continue
  const at = Date.parse(m[1]) || 0
  for (const id of m[2].match(/[A-Za-z]+\d+/g) || [])
    noteFail(id.toUpperCase(), at, `${m[3].trim()}: ${m[4]}`, 'DEFECTS.md')
}
// 3. Evidence prose, for the two days of history written before either of the
// above existed. Only the id field and the head of the body are read.
for (const line of evidenceLines) {
  const m = line.match(/^(\S+) \| ([^|]+) \| (.*)$/)
  if (!m) continue
  const at = Date.parse(m[1]) || 0
  const ids = m[2].match(/[A-Za-z]+\d+/g) || []
  if (!ids.length) continue
  const failedField = /\bFAIL(?:ED|S)?\b/i.test(m[2])
  const failedHead = /^\**(?:FAIL|DEFECT|BLOCKED)\b/i.test(m[3].trim())
    || /\bFAIL\b/.test(m[3].slice(0, 120))
  const passedField = /\bPASS(?:ED|ES)?\b/i.test(m[2])
  const passedHead = /^\**PASS\b/i.test(m[3].trim())
  for (const raw of ids) {
    const id = raw.toUpperCase()
    if (failedField || failedHead) noteFail(id, at, m[3], 'EVIDENCE.md')
    else if (passedField || passedHead) { if ((failures[id] || {}).at <= at) delete failures[id] }
  }
}
const sections = []
const byId = {}
let cur = null
for (const line of dod.split('\n')) {
  const h = line.match(/^##\s+(.+)/)
  if (h) { cur = { name: h[1].trim(), lines: [] }; sections.push(cur); continue }
  const c = line.match(/^- \[([ x])\]\s+(?:[*_`]*([A-Za-z]+\d+)[*_`]*[.):]?\s+)?(.*)/)
  if (c && cur) {
    const id = c[2] || ''
    // A failing line outranks an evidenced one: evidence was recorded and the
    // verifier ruled against it. A CHECKED line is verified whatever the
    // history says, because the checkbox is the run's own latest word.
    const fail = id && c[1] !== 'x' ? failures[id] : null
    const l = {
      id, text: c[3].replace(/[*_`]/g, ''), fail: fail || null,
      state: c[1] === 'x' ? 'verified'
        : fail ? 'failing'
        : (id && evidenced.has(id) ? 'evidence' : 'open'),
    }
    cur.lines.push(l)
    if (id) byId[id] = l
  }
}
const allLines = sections.flatMap(s => s.lines)
const nVerified = allLines.filter(l => l.state === 'verified').length
const nEvidence = allLines.filter(l => l.state === 'evidence').length

// Slices from PLAN.md, cursor from RESUME.md, per-slice rubric ids from the
// "Closes" clause the architect writes in each slice. Two heading dialects
// ship: "## Slice 3: Title" anywhere in the plan, and "### 3. Title" under a
// "## Slices" section. Titles and bodies come out of the same pass, so the
// chips and the per-slice rubric ids can never disagree about which slice is
// which.
const sliceScope = (plan.split(/^##[ \t]*Slices\b[^\n]*$/im)[1] || '').split(/^##\s+/m)[0]
const SLICE_DIALECTS = [
  [plan, /^#{0,4}[ \t]*Slice[ \t]+(\d+)[ \t]*[:.)][ \t]*([^\n]*)$/gim],
  [sliceScope, /^#{2,4}[ \t]*(\d+)[ \t]*[.)][ \t]*([^\n]+)$/gm],
]
let sliceTitles = []
const sliceBodies = {}
for (const [text, re] of SLICE_DIALECTS) {
  const hits = [...text.matchAll(re)]
  if (!hits.length) continue
  sliceTitles = hits.map(m => ({ n: +m[1], title: m[2].trim() }))
  hits.forEach((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length
    sliceBodies[+m[1]] = text.slice(m.index + m[0].length, end)
  })
  break
}

// The cursor. "Current slice: 3" is the written form; "Slice 3 of 10" is the
// prose the lead writes in RESUME's header. A bare "slice 3" is never read as
// the cursor: RESUME names other slices in prose on nearly every line.
let curSlice = +((resume.match(/Current slice:[^\n]*?(\d+)/i)
  || resume.match(/\bslice[ \t]+(\d+)[ \t]+of[ \t]+\d+/i)
  || resume.match(/Next action:[^\n]*?slice (\d+)/i) || [, 0])[1])

// Per-slice rubric ids, read from the Closes clause alone and kept only when
// the id exists in the rubric. Scanning a whole slice body would promote
// prose like "avatar copy into R2" into a rubric line. Ranges written out,
// "A1 through A4" or "A1-A4", expand.
const sliceIds = {}
for (const [n, body] of Object.entries(sliceBodies)) {
  const clause = (body.match(/^Closes\b[^\n]*(?:\n(?![ \t]*$)[^\n]*)*/im) || [''])[0]
  const ids = []
  const push = id => { if (byId[id] && !ids.includes(id)) ids.push(id) }
  for (const r of clause.matchAll(/\b([A-Z]+)(\d+)[ \t]*(?:through|to|-|\u2013)[ \t]*\1?(\d+)\b/g)) {
    for (let i = +r[2]; i <= +r[3] && i - +r[2] < 40; i++) push(r[1] + i)
  }
  for (const id of clause.match(/\b[A-Z]+\d+\b/g) || []) push(id)
  if (ids.length) sliceIds[n] = ids
}

// RESUME's header strip: the explicit "Key: value" lines when the lead writes
// them, else the same three facts recovered from the prose header and the
// first step under "## Next action".
// THE CURSOR COMES FROM THE RUBRIC, not from a sentence. Prose said
// "Current slice: verifying against the live URL. Slice 1 closed. Slice 2 at 8
// of 9", and the parser took the first number on the line, which belonged to
// the word "closed". The board then showed slice 1 in flight while slices 1, 2
// and 3 were fully verified and slice 4 stood at 8 of 12.
//
// A slice is done when every line it Closes is checked. The cursor is the
// lowest slice that is not. That reads the same checkboxes the Stop gate reads,
// so it cannot disagree with the gate and cannot go stale while a handoff
// sentence ages. Prose stays as the fallback for a run whose plan has no Closes
// lists, and for the moment before anything is verified at all.
const sliceProgress = {}
for (const [n, ids] of Object.entries(sliceIds)) {
  const known = ids.filter(id => byId[id])
  if (!known.length) continue
  sliceProgress[n] = { done: known.filter(id => byId[id].state === 'verified').length, all: known.length }
}
const ordered = Object.keys(sliceProgress).map(Number).sort((a, b) => a - b)
const firstOpen = ordered.find(n => sliceProgress[n].done < sliceProgress[n].all)
// Only override when the rubric has something to say: at least one slice fully
// verified, or the named cursor already behind a finished slice.
if (ordered.length && ordered.some(n => sliceProgress[n].done === sliceProgress[n].all)) {
  curSlice = firstOpen || ordered[ordered.length - 1]
}

// The rubric grouped by the slice that closes it, for the popin. The sections
// answer "how is craft doing"; the slices answer "what is left in the thing
// being built right now", which is the question during a build. Both are kept.
const linesBySlice = sliceTitles
  .map(st => ({
    n: st.n,
    title: st.title,
    lines: (sliceIds[st.n] || []).map(id => byId[id]).filter(Boolean),
  }))
  .filter(g => g.lines.length)
const claimedIds = new Set(linesBySlice.flatMap(g => g.lines.map(l => l.id)))
// A line no Closes list names is not an error, but it is worth seeing: the
// lists are supposed to partition the rubric exactly.
const unclaimedLines = allLines.filter(l => !l.id || !claimedIds.has(l.id))

// Two states between open and evidence. The rubric could say nothing about a
// line the builder was working on right now, so a board sat at 0 verified, 0
// evidence, 122 open through hours of real work and looked identical to a run
// that had not started.
//
//   building   the current slice's own lines, in flight
//   unrecorded lines from slices ALREADY PAST the cursor that still carry no
//              evidence: built, and never written down
//
// The second is the one worth having. It reads 0 while a run records as it
// goes and climbs the moment it stops, which is exactly the failure that hid
// in run two: nine lines built and an EVIDENCE.md that never existed.
const sliceOf = {}
for (const [n, ids] of Object.entries(sliceIds)) {
  for (const id of ids) if (sliceOf[id] == null) sliceOf[id] = +n
}
for (const l of allLines) {
  if (l.state !== 'open' || !l.id) continue
  const n = sliceOf[l.id]
  if (n == null || !curSlice) continue
  if (n === curSlice) l.state = 'building'
  else if (n < curSlice) l.state = 'unrecorded'
}
const nBuilding = allLines.filter(l => l.state === 'building').length
const unrecorded = allLines.filter(l => l.state === 'unrecorded')
const nOpen = allLines.filter(l => l.state === 'open').length
const failingLines = allLines.filter(l => l.state === 'failing')
const nFailing = failingLines.length
// Grouped the same way the debt is: the actionable form of "what is red" is
// which slice owes the fix.
const failBySlice = {}
for (const l of failingLines) (failBySlice[sliceOf[l.id]] ||= []).push(l)
// Grouped by the slice that owed them, newest debt first: "which slice walked
// away without writing anything down" is the actionable form of the number.
const debtBySlice = {}
for (const l of unrecorded) (debtBySlice[sliceOf[l.id]] ||= []).push(l)

let resumeTop = resume.split('\n').filter(l => /^(Last phase|Current slice|Next action)/i.test(l))
  .map(l => { const m = l.match(/^([^:]+):\s*(.*)$/); return m ? [m[1], m[2]] : ['', l] })
if (!resumeTop.length) {
  const flat = t => t.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim()
  // The first prose paragraph under the title, not the whole header: what
  // follows it is the goal condition, which the rubric panel already draws.
  const head = flat((resume.split(/^##\s+/m)[0].split('\n').filter(l => !/^#/.test(l))
    .join('\n').trim().split(/\n[ \t]*\n/)[0] || ''))
  const next = flat((resume.split(/^##[ \t]*Next action[^\n]*$/im)[1] || '').split(/^##\s+/m)[0]
    .trim().split(/\n[ \t]*\n/)[0] || '').replace(/^(?:[-*+]|\d+[.)])[ \t]*/, '')
  if (head) resumeTop.push(['Last phase', head])
  if (curSlice) resumeTop.push(['Current slice', `${curSlice} of ${sliceTitles.length || '?'}`])
  if (next) resumeTop.push(['Next action', next])
}

// RESUME goes stale, and a stale handoff read beside a live rubric is how a
// board lies without saying anything false. It claimed "37 of 124 checked" for
// twelve hours while DOD.md held 71 and the Stop gate agreed with DOD.md. Where
// RESUME states a count this file can recompute, the recomputed one wins and
// the disagreement is named with its age.
let resumeStale = ''
{
  // The count survives markdown emphasis, which RESUME writes it in:
  // "Rubric: **37 of 124 checked.**"
  const claimed = resume.match(/\bRubric[^\n:]*:[\s*_`]*(\d{1,4})\s+of\s+(\d{1,4})/i)
    || resume.match(/[\s*_`](\d{1,4})\s+of\s+(\d{1,4})\s+(?:rubric\s+)?lines?\b/i)
  const said = claimed ? +claimed[1] : null
  const outOf = claimed ? +claimed[2] : null
  if (said != null && outOf === allLines.length && said !== nVerified) {
    let age = 0
    try { age = Date.now() - statSync('.forge/RESUME.md').mtimeMs } catch {}
    const h = Math.floor(age / 3600000)
    resumeStale = `RESUME says ${said} of ${outOf}; the rubric holds ${nVerified}`
      + (h ? `, and has not been rewritten for ${h}h` : '')
  }
}

// ---------------------------------------------------------------- screenmap
// The product's screens, and how far each one has actually got. Four sources,
// each doing only what it is entitled to do: DESIGN.md names the screens,
// PLAN.md says which slice brings each, the capture files say which ones have
// been seen, and the source tree says which routes exist. The tree is read for
// inventory and for drift, never to guess which screen a route serves: a route
// name is a label somebody typed, not a statement about what it renders.
const screenScope = (design.split(/^##[ \t]*Screens?\b[^\n]*$/im)[1] || '').split(/^##\s+/m)[0]
let screens = [...screenScope.matchAll(/^\|[ \t]*(\d{1,2})[ \t]*\|[ \t]*([^|\n]+?)[ \t]*\|/gm)]
  .map(m => ({ n: +m[1], name: m[2].trim() }))
if (!screens.length) {
  screens = [...design.matchAll(/^#{2,4}[ \t]*(?:Screen[ \t]+)?(\d{1,2})[ \t]*[.:)]?[ \t]+([^\n|]+?)[ \t]*$/gim)]
    .map(m => ({ n: +m[1], name: m[2].trim() }))
}
screens = screens.filter((s, i, a) => a.findIndex(x => x.n === s.n) === i).sort((a, b) => a.n - b.n)

// Screen to slice, from the numbers alone: "screens 02 and 03" is unambiguous
// and nothing else here is. The name fallback that used to sit under this
// ("the landing page", "screen Landing") produced ONE attribution in seven on
// a thirteen-slice run and that one was wrong: it matched slice 13's
// launch-kit sentence about capturing the landing page and filed the Landing
// screen under the slice that photographs it rather than the slice that builds
// it. A wrong slice is worse than no slice, so the fallback is gone. The
// Closes clause stays excluded; it describes proof, not what gets built.
const screenSlice = {}
for (const [n, body] of Object.entries(sliceBodies)) {
  const built = body.split(/^Closes\b/im)[0]
  for (const m of built.matchAll(/\bscreens?[ \t]+(\d{1,2}(?:[ \t]*(?:,|and|&|to|through)[ \t]*\d{1,2})*)/gi)) {
    for (const d of m[1].match(/\d{1,2}/g) || []) if (screenSlice[+d] == null) screenSlice[+d] = +n
  }
}

// --------------------------------------------------------- the capture index
// Every capture the run has filed, read once, and used for three things: which
// screen it proves, which viewport and theme it proves it at, and the gallery.
//
// THE BOARD DOES NOT COUNT ITS OWN COPIES. It writes display copies into the
// flat level of .forge/shots as `<hash>-<basename>`, so unioning them with the
// sources counted every capture twice from the second render onward, and the
// copies written before the prune ledger existed can never be pruned and were
// counted forever: 155 files sat flat in vitrine's shots directory against a
// 60-entry ledger. A counter must read what the run produced, never what the
// counter produced. So: the SUBDIRECTORIES of .forge/shots count, because that
// is where builders and verifiers file their batches, and the flat level does
// not, because that is this file's own pile.
const CAPTURE_RX = /\.(png|jpe?g|webp)$/i
const capWalk = (d, depth, acc = []) => {
  let ents = []
  try { ents = readdirSync(d, { withFileTypes: true }) } catch { return acc }
  for (const e of ents) {
    const p = `${d}/${e.name}`
    if (e.isDirectory()) { if (depth > 0) capWalk(p, depth - 1, acc) }
    else if (CAPTURE_RX.test(e.name)) acc.push(p)
  }
  return acc
}
const captureSources = []
capWalk('.forge/evidence', 4, captureSources)
capWalk('tests/screenshots', 1, captureSources)
capWalk('launch/screenshots', 1, captureSources)
capWalk('test-results', 3, captureSources)
for (const p of capWalk('.forge/shots', 4)) if (p.split('/').length > 3) captureSources.push(p)
// EVIDENCE.md names captures by path. Vitrine names 250 and 169 of them no
// longer exist, because test runners wipe their output directories. A run
// whose proof has evaporated should say so rather than quietly shrink.
let evidenceNamed = 0, evidenceGone = 0
for (const p of new Set([...evidence.matchAll(/[\w./-]+\.(?:png|jpe?g|webp)/gi)].map(m => m[0]))) {
  evidenceNamed++
  if (existsSync(p)) captureSources.push(p); else evidenceGone++
}
// Tokens are the basename plus its parent directory. The directory is named by
// the agent that filed the batch (`.forge/shots/r25-landing/`), so it is a
// statement about what was under test, not a substring of a screen's name.
const captures = [...new Set(captureSources)].map(p => {
  const parts = p.split('/')
  const base = parts.pop().replace(/\.[a-z0-9]+$/i, '')
  const t = `${base}-${parts.pop() || ''}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  return { p, t }
})

// Viewport and theme, which the run has been writing all along. The old
// comment called 390 and 1440 "inert" and dropped them; they are the whole
// answer to "is this proved on a phone as well as a laptop".
const viewportOf = t => {
  if (/^(mobile|phone|handset)$/.test(t)) return 'm'
  if (/^(tablet|ipad)$/.test(t)) return 't'
  if (/^(desktop|laptop|wide)$/.test(t)) return 'd'
  if (!/^\d{3,4}$/.test(t)) return ''
  const n = +t
  if (n < 320 || n > 3840) return ''
  return n < 500 ? 'm' : n < 1024 ? 't' : 'd'
}
for (const c of captures) {
  c.vp = ''
  for (const t of c.t) { const v = viewportOf(t); if (v) { c.vp = v; break } }
  c.theme = c.t.includes('dark') ? 'dark' : c.t.includes('light') ? 'light' : ''
}

// Attribution. A NUMBER IS NEVER ENOUGH ON ITS OWN. DESIGN.md numbers seven
// screens and DOD.md numbers fourteen surfaces, and the two disagree from
// position two onward, so `look-01-landing-390-dark.png` is DOD surface 1 and
// the old matcher filed it under DESIGN screen 01, "Aisle check". Five of
// seven rows counted another screen's captures and the panel read "7 of 7"
// with total confidence. That is the defect this board exists to catch in the
// product, sitting in the board.
//
// So attribution is corroborated or it does not happen, and a capture two
// screens could claim is claimed by neither. Two ways in:
//   name    a word from the screen's own name among the tokens
//   rubric  an id in the name, mapped to a slice by its Closes clause, mapped
//           to a screen by that slice, and only when the slice brings one
const NAME_STOP = new Set(['the', 'and', 'for', 'with', 'page', 'screen', 'view', 'from', 'this'])
const screenWords = {}
for (const sc of screens) {
  screenWords[sc.n] = sc.name.toLowerCase().split(/[^a-z0-9]+/)
    .filter(w => w.length > 2 && !NAME_STOP.has(w))
}
const screensOfSlice = {}
for (const sc of screens) {
  const n = screenSlice[sc.n]
  if (n != null) (screensOfSlice[n] ||= []).push(sc.n)
}
const attribute = c => {
  const tk = new Set(c.t)
  const byName = screens.filter(sc => (screenWords[sc.n] || []).some(w => tk.has(w)))
  if (byName.length) return byName.length === 1 ? byName[0].n : 0
  for (const t of c.t) {
    if (!/^[a-z]+\d+$/.test(t)) continue
    const sl = sliceOf[t.toUpperCase()]
    if (sl == null) continue
    const cand = screensOfSlice[sl] || []
    return cand.length === 1 ? cand[0] : 0
  }
  return 0
}
for (const c of captures) c.screen = attribute(c)
const capsByScreen = {}
for (const c of captures) if (c.screen) (capsByScreen[c.screen] ||= []).push(c)

// Coverage: mobile and desktop, light and dark. Four cells, filled or hollow,
// so a screen proved on a laptop only reads as half done at a glance.
const COVER = [['m', 'light'], ['m', 'dark'], ['d', 'light'], ['d', 'dark']]
const COVER_LABEL = ['mobile light', 'mobile dark', 'desktop light', 'desktop dark']
const coverOf = cs => COVER.map(([v, th]) => cs.some(c => c.vp === v && c.theme === th))

// Routes the run declares, from RESUME's screen table. Scoped to a table whose
// header says "Screen" so other numbered tables cannot be read as this one.
const declRoute = {}
const rtTable = resume.split('\n')
let inScreenTable = false
for (const l of rtTable) {
  if (/^\|/.test(l) && /screen/i.test(l) && /route/i.test(l)) { inScreenTable = true; continue }
  if (inScreenTable && !/^\|/.test(l)) { inScreenTable = false; continue }
  if (!inScreenTable) continue
  const c = l.split('|').map(x => x.trim())
  const n = +(c[1] || '').match(/^\d{1,2}$/)
  if (!n) continue
  const r = (c[3] || '').match(/`?(\/[^\s`]*)`?/)
  if (r) declRoute[n] = r[1]
}

// Routes on disk. One detector per router convention; unknown stacks simply
// yield nothing and the panel drops its route column rather than inventing it.
// `worktrees` is listed even though the leading-dot test below already skips
// `.claude/worktrees`: a project that nests its worktrees undotted would
// otherwise count all of its routes once per worktree.
const ROUTE_SKIP = new Set(['node_modules', '.git', '.next', '.forge', 'dist', 'build', 'out',
  '.expo', '.svelte-kit', '.nuxt', 'coverage', '.turbo', 'ios', 'android', 'vendor', 'target',
  'worktrees'])
const walkRoutes = (d, depth, acc) => {
  if (depth > 8 || acc.length > 6000) return acc
  let ents = []
  try { ents = readdirSync(d, { withFileTypes: true }) } catch { return acc }
  for (const e of ents) {
    if (e.name.startsWith('.') || ROUTE_SKIP.has(e.name)) continue
    const q = d === '.' ? e.name : `${d}/${e.name}`
    if (e.isDirectory()) walkRoutes(q, depth + 1, acc); else acc.push(q)
  }
  return acc
}
const routesInTree = [...new Set(walkRoutes('.', 0, []).map(f => {
  let m
  if ((m = f.match(/(?:^|\/)app\/(.*?)\/?page\.[jt]sx?$/))) return '/' + m[1]
  if ((m = f.match(/(?:^|\/)pages\/(.+)\.[jt]sx?$/))) return /^(_app|_document|api\/)/.test(m[1]) ? '' : '/' + m[1].replace(/\/?index$/, '')
  if ((m = f.match(/(?:^|\/)routes\/(.*?)\/?\+page\.svelte$/))) return '/' + m[1]
  if ((m = f.match(/(?:^|\/)src\/pages\/(.+)\.astro$/))) return '/' + m[1].replace(/\/?index$/, '')
  return ''
}).filter(Boolean).map(r => (r.replace(/\/\([^)]*\)/g, '').replace(/\[\.\.\.(\w+)\]/g, '*')
  .replace(/\[(\w+)\]/g, ':$1').replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1') || '/')))].sort()

// Where each designed screen lives. RESUME's declared table is first
// authority. Slug equality on the route's last segment is second, and only
// equality: "Catalogue" ties to /catalogue, "Contributor" does not tie to
// /contribute, and it is right not to.
const routeSlug = r => (r.split('/').filter(Boolean).pop() || 'index').toLowerCase().replace(/[^a-z0-9]/g, '')
// A screen offers a few spellings of itself, all of them still equality and
// none of them a substring: the whole name, the name without a leading
// article or possessive ("My collection" reaches /collection), and its last
// word ("Aisle check" reaches /check). The root gets the words the web has
// always used for it. "Contributor" still does not reach /contribute, and that
// is the point: near-misses stay misses.
const ROOT_WORDS = new Set(['landing', 'home', 'index', 'root', 'start'])
const LEAD_DROP = new Set(['my', 'the', 'a', 'an', 'your', 'public', 'new'])
const screenSlugs = sc => {
  const words = sc.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const out = new Set([words.join('')])
  if (words.length > 1 && LEAD_DROP.has(words[0])) out.add(words.slice(1).join(''))
  if (words.length > 1) out.add(words[words.length - 1])
  return out
}
const screenRoute = {}
{
  const claims = {}
  for (const sc of screens) {
    let route = declRoute[sc.n] || ''
    if (!route) {
      const want = screenSlugs(sc)
      const hit = routesInTree.filter(r =>
        want.has(routeSlug(r)) || (r === '/' && [...want].some(w => ROOT_WORDS.has(w))))
      if (hit.length === 1) route = hit[0]
    }
    if (route) (claims[route] ||= []).push({ n: sc.n, declared: !!declRoute[sc.n] })
  }
  // One route, one screen. A declaration in RESUME beats an inference from a
  // name; two inferences cancel, and the losers fall through to the "designed,
  // not routed" list rather than vanishing off the board, which is what
  // happened when the map was keyed by route and the second claimant was
  // silently overwritten.
  for (const [route, cs] of Object.entries(claims)) {
    const declared = cs.filter(c => c.declared)
    const win = cs.length === 1 ? cs[0] : declared.length === 1 ? declared[0] : null
    if (win) screenRoute[win.n] = route
  }
}
// Where the designer drew it. DESIGN.md's screen table carries the Claude
// Design file per row and an index link above the table; both are worth a
// click from the board, and claude.ai refuses to be framed, so both open in a
// new tab rather than a popin.
const designLink = {}
for (const m of screenScope.matchAll(/^\|[ \t]*(\d{1,2})[ \t]*\|[^|\n]*\|[^|\n]*?\((https:\/\/[^)\s]+)\)/gm)) {
  designLink[+m[1]] = m[2]
}
const designIndex = (design.match(/\[[^\]]*\]\((https:\/\/claude\.ai\/design\/p\/[^)\s]+)\)/) || [, ''])[1]

const screenMap = screens.map(sc => {
  const caps = capsByScreen[sc.n] || []
  const slice = screenSlice[sc.n]
  const route = screenRoute[sc.n] || ''
  return {
    ...sc, shots: caps.length, slice, route, cover: coverOf(caps),
    href: designLink[sc.n] || '',
    gone: !!route && routesInTree.length > 0 && !routesInTree.includes(route),
    state: caps.length ? 'cap' : (slice && slice === curSlice ? 'bld' : 'pln'),
  }
})
const shotMax = Math.max(1, ...screenMap.map(s => s.shots))
const screensSeen = screenMap.filter(s => s.state === 'cap').length
// Captures the run filed that no screen can claim. Honest residue, not an
// accusation: a capture proving a rubric line about rate limiting belongs to
// no screen, and saying so beats inventing a home for it.
const unclassified = captures.filter(c => !c.screen).length
const screenOfRoute = {}
for (const s of screenMap) if (s.route && screenOfRoute[s.route] == null) screenOfRoute[s.route] = s

// --------------------------------------------------------------- the sitemap
// The site as a tree, which is what a sitemap is. The old panel drew the
// designer's flat list of seven and called it Screens while twenty-one routes
// sat on disk unmentioned, nested three deep. Routes are the reality; the
// designed screens attach to them where they tie, and are listed underneath
// where they do not.
const routeCaps = r => {
  const want = routeSlug(r)
  if (!want || want === 'index') return []
  return captures.filter(c => c.t.includes(want))
}
const sitemap = []
{
  const nodes = new Map()
  for (const r of routesInTree) {
    const segs = r === '/' ? [] : r.split('/').filter(Boolean)
    for (let i = 0; i <= segs.length; i++) {
      const path = i === 0 ? '/' : '/' + segs.slice(0, i).join('/')
      if (nodes.has(path)) continue
      nodes.set(path, {
        path, depth: i, seg: i === 0 ? '/' : segs[i - 1],
        real: routesInTree.includes(path),
      })
    }
  }
  for (const n of [...nodes.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    const sc = screenOfRoute[n.path]
    const caps = sc ? (capsByScreen[sc.n] || []) : routeCaps(n.path)
    sitemap.push({ ...n, screen: sc || null, shots: caps.length, cover: coverOf(caps) })
  }
}
const routeShotMax = Math.max(1, ...sitemap.map(s => s.shots))
// Every designed screen the tree does not already draw. Keyed off what was
// actually rendered, not off whether a route was computed, so a screen can
// never fall between the two lists.
const drawnScreens = new Set(sitemap.map(n => n.screen && n.screen.n).filter(Boolean))
const unrouted = screenMap.filter(s => !drawnScreens.has(s.n))
const tied = new Set(screenMap.map(s => s.route).filter(Boolean))
const untied = routesInTree.filter(r => !tied.has(r))

// ------------------------------------------------------------- environments
// Where to go and look at the thing. The board said what had been built and
// never where to see it, so finding the running app meant hunting for a port.
// Every URL here is one the run already wrote down; nothing is invented.
const envText = [brief, plan, resume, evidence, greenlight, runlog, read('.forge/REPORT.md')].join('\n')
const localPorts = new Set()
const remotes = new Set()
const remoteUrls = {}
for (const m of envText.matchAll(/https?:\/\/[a-zA-Z0-9._:/-]+/g)) {
  const u = m[0].replace(/[.,)*\]]+$/, '')
  // Design boards, docs and dashboards are not environments to test in.
  if (/claude\.ai|anthropic\.com|github\.com|nodejs\.org|neon\.tech|supabase\.com|vercel\.com/.test(u)) continue
  const l = u.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::(\d+))?/)
  if (l) { localPorts.add(l[1] || '3000'); continue }
  const o = u.match(/^https?:\/\/[^/\s]+/)
  // The origin is where a person goes to look at the thing, so it is what the
  // chip links to. The FULL url is kept beside it, because that is what gets
  // probed: asking bare origins cannot tell a deploy from an image host, since
  // upload.wikimedia.org answers its own root with a perfectly good HTML page
  // while the only thing the run ever wrote for it was a .png.
  if (o) { remotes.add(o[0]); (remoteUrls[o[0]] ||= new Set()).add(u) }
}
// A port named in package.json is a local environment even if nothing recorded
// a URL for it yet.
for (const m of read('package.json').matchAll(/-p\s+(\d{2,5})/g)) localPorts.add(m[1])

// Liveness. One lsof for every local port at once, and no network call at all
// for them. This renders on every subagent stop, so nothing here may be slow.
let listening = new Set()
if (localPorts.size) {
  try {
    const out = execSync("lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null", { encoding: 'utf8', timeout: 2500 })
    for (const m of out.matchAll(/:(\d+)\s+\(LISTEN\)/g)) listening.add(m[1])
  } catch {}
}
// The deployed URL costs a request, so it is probed at most once a minute and
// the verdict is cached. A board that hammers production to draw a dot is a
// worse board.
//
// AN ENVIRONMENT IS A URL THAT ANSWERS WITH HTML. The old rule was a denylist
// of dashboard hostnames, and a denylist only ever knows what somebody
// remembered to add: it filtered supabase.com and drew the project's own
// database at aaxlmxludhrjlsyfgeqj.supabase.co as `production`, drew the
// object store beside it, and drew upload.wikimedia.org green because a CDN
// answers 301. None of the three is a place to go and look at the product.
// The content type settles all of them at once and needs no maintenance.
const PROBE_TTL = 60_000
let probes = {}
try { probes = JSON.parse(readFileSync('.forge/.env-probe.json', 'utf8')) } catch {}
if (remotes.size) {
  let touched = false
  for (const o of remotes) {
    if (probes[o] && Date.now() - probes[o].t < PROBE_TTL) continue
    // The urls the run actually wrote for this origin, shortest path first, at
    // most three. Shortest first because the root is the likeliest page and
    // the likeliest to settle it in one request.
    const targets = [...(remoteUrls[o] || new Set([o]))].sort((a, b) => a.length - b.length).slice(0, 3)
    let code = '000', ctype = '', html = false, known = false
    for (const t of targets) {
      let c = '000', ct = ''
      try {
        // Redirects are followed: without -L a CDN answers 301 with no content
        // type at all and is indistinguishable from a deploy that redirects to
        // its canonical domain.
        const out = execSync(`curl -sL -o /dev/null -m 6 -w '%{http_code} %{content_type}' ${JSON.stringify(t)}`,
          { encoding: 'utf8', timeout: 9000 }).trim().split(/\s+/)
        c = out[0] || '000'; ct = (out[1] || '').toLowerCase()
      } catch {}
      if (!known || t === o) { code = c; ctype = ct }
      // Answered at all, whatever it said. A 404 is an answer; only a
      // transport failure leaves the question open.
      if (c !== '000') known = true
      // HTML is not enough on its own: upload.wikimedia.org serves its 404
      // page as text/html, so a content-type test alone re-admits the image
      // host it was written to exclude. The answer has to be a page the server
      // meant to give. 401 and 403 count, because a deploy behind access
      // protection is still the place to go and look at the thing.
      if (ct.includes('text/html') && /^(2|3)|^40[13]$/.test(c)) {
        html = true; code = c; ctype = ct; break
      }
    }
    // `html` and `known` are remembered and never unset by a later blip: a
    // deploy that served the product yesterday and 502s now is a regression the
    // board must show, not an entry it should quietly drop, and a probe that
    // could not run at all leaves the entry undecided rather than deleted.
    const was = probes[o] || {}
    probes[o] = { t: Date.now(), code, ctype, html: was.html || html, known: was.known || known }
    touched = true
  }
  if (touched) { try { writeFileSync('.forge/.env-probe.json', JSON.stringify(probes)) } catch {} }
}
// Kept: anything that has ever served HTML, anything nobody has managed to
// reach yet, and anything answering 5xx. Dropped: everything that answered
// cleanly with something that is not a page.
//
// Undecided is not the same as refused, so a board with no network must not
// quietly delete the deploy it drew a minute ago. And a 5xx is the one failure
// worth a chip on its own: the thing exists and is broken, which is exactly
// what somebody needs to see. A 4xx on every url the run recorded means this
// origin was never a place to go and look at the product.
const isEnv = o => {
  const p = probes[o] || {}
  return p.html || !p.known || /^5/.test(p.code || '')
}

const liveLocal = [...localPorts].filter(p => listening.has(p)).sort((a, b) => a - b)
const deadLocal = [...localPorts].filter(p => !listening.has(p)).sort((a, b) => a - b)
const envs = [
  ...[...remotes].filter(isEnv).sort().map(o => {
    const c = (probes[o] || {}).code || '000'
    return { label: 'production', href: o, shown: o.replace(/^https?:\/\//, ''),
             up: /^[23]/.test(c), note: c === '000' ? 'no answer' : c }
  }),
  ...liveLocal.map(port => ({
    label: `local :${port}`, href: `http://localhost:${port}`, shown: `localhost:${port}`,
    up: true, note: 'listening',
  })),
].sort((a, b) => (b.up ? 1 : 0) - (a.up ? 1 : 0))
// Dead local ports are not environments, they are litter: a verifier boots a
// dev server on a free port, writes the URL into its evidence, and the port is
// gone a minute later. Twelve of them had accumulated on a two-day run, one of
// them the discard port :9 used as a deliberate negative control. They collapse
// into one count that names them on hover.
const deadTitle = deadLocal.length
  ? `Ports a run wrote down that nothing is listening on now: ${deadLocal.map(p => `:${p}`).join(' ')}`
  : ''

// ---------------------------------------------------------------- worktrees
// Parallel builders work in git worktrees, and nothing has ever cleaned up
// after them: seventeen had accumulated on a two-day run, one still locked,
// each holding a full checkout with its own .forge and about twelve hundred
// captures the main board cannot see. The board does not prune them, because
// deleting a builder's checkout is not a rendering decision. It says they are
// there, and it says how much evidence is stranded inside them.
let worktrees = []
try {
  const wtCache = probes['#worktrees']
  if (wtCache && Date.now() - wtCache.t < PROBE_TTL) worktrees = wtCache.v
  else {
    const out = execSync('git worktree list --porcelain 2>/dev/null',
      { encoding: 'utf8', timeout: 4000 })
    let cur = null
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) { cur = { path: line.slice(9), branch: '', locked: false }; worktrees.push(cur) }
      else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '')
      else if (cur && line.startsWith('locked')) cur.locked = true
    }
    // The first entry is the main checkout, which is not a worktree to report.
    worktrees = worktrees.slice(1)
    for (const w of worktrees) {
      w.shots = capWalk(`${w.path}/.forge/shots`, 4).length
      try { w.at = statSync(w.path).mtimeMs } catch { w.at = 0 }
    }
    probes['#worktrees'] = { t: Date.now(), v: worktrees }
    try { writeFileSync('.forge/.env-probe.json', JSON.stringify(probes)) } catch {}
  }
} catch {}
const wtLocked = worktrees.filter(w => w.locked).length
const wtShots = worktrees.reduce((a, w) => a + (w.shots || 0), 0)
const wtOldest = worktrees.reduce((a, w) => Math.min(a, w.at || Date.now()), Date.now())
const wtTitle = worktrees.length
  ? `Agent worktrees still on disk, none merged away:\n`
    + worktrees.slice(0, 20).map(w => `${w.path.split('/').pop()} · ${w.branch || 'detached'}`
      + `${w.locked ? ' · locked' : ''}${w.shots ? ` · ${w.shots} capture(s)` : ''}`).join('\n')
    + (wtShots ? `\n\n${wtShots} capture(s) sit inside them, outside this board's reach.` : '')
  : ''

// In play: the current slice's not-yet-verified lines, else newest evidenced.
let inPlay = (sliceIds[curSlice] || []).map(id => byId[id]).filter(l => l && l.state !== 'verified')
let inPlayLabel = inPlay.length ? `In play · slice ${curSlice}` : 'Recently proven'
if (!inPlay.length) {
  inPlay = [...evidenced].reverse().map(id => byId[id]).filter(Boolean).slice(0, 8)
}
// Failing first: a line the verifier ruled against is the most actionable
// thing on the board, and burying it under the open ones hides the one item
// that will not clear itself.
const playRank = l => l.state === 'failing' ? 0 : l.state === 'open' ? 1 : 2
inPlay = inPlay.sort((a, b) => playRank(a) - playRank(b)).slice(0, 8)

// Pipeline cursor: the phase number in RESUME's next action first, else the
// earliest keyword, with .md filenames stripped so PLAN.md is not read as PLAN.
const PHASES = [
  ['Intake', /intake/i, 'three questions'],
  ['Size', /\bsize\b|router/i, 'S, M, or L'],
  ['Scout', /scout/i, 'market + rules'],
  ['Design', /design\b(?!\.md)/i, 'panel + screens'],
  ['Plan', /\bplan\b|architect/i, 'slices + rubric'],
  ['Gate + arm', /greenlight|arm\b/i, 'the one stop'],
  ['Build', /build|slice|builder/i, 'slice by slice'],
  ['Verify', /verif/i, 'evidence rules'],
  ['Ship', /ship|deploy|finisher/i, 'deploy + report'],
]
const nextAction = (resume.match(/Next action:\s*([^\n]*)/i) || [, ''])[1]
const numMap = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 5, 8: 6, 9: 7, 10: 8 }
let active = -1
const num = nextAction.match(/^\s*(\d+)\b/)
if (num && numMap[+num[1]] !== undefined) active = numMap[+num[1]]
if (active < 0) {
  const clean = nextAction.replace(/\S+\.md\b/gi, ' ')
  let best = Infinity
  PHASES.forEach(([, re], i) => {
    const at = clean.search(re)
    if (at >= 0 && at < best) { best = at; active = i }
  })
}
if (active < 0) active = shipped ? 9 : armed ? 6 : dod ? 5 : brief ? 1 : 0
// A concluded run has no active phase: the whole pipeline reads done.
const concluded = /\bconcluded\b/i.test(resume)
const verdict = (resume.match(/Verdict:\s*\**([A-Z]+[^*\n]*?)\**\s*$/im) || [, ''])[1]
if (concluded) active = 9
const scoutSkipped = active > 2 && !/##\s*Research/i.test(brief)
const designSkipped = active > 3 && !existsSync('.forge/DESIGN.md')
const phaseState = i =>
  i < active ? ((i === 2 && scoutSkipped) || (i === 3 && designSkipped) ? 'skipped' : 'done')
  : i === active ? 'active' : 'pending'

// Completion estimate. The gate work is worth 20 points; the rubric carries
// the other 80, an evidence-recorded line counting half a verified one.
// 100 exists only when every line is verified AND the report is written;
// a report over unverified lines is not done, so it stays capped at 99.
const verifiedAll = allLines.length > 0 && nVerified === allLines.length
const pct = allLines.length
  ? (verifiedAll && shipped ? 100
    : Math.min(99, Math.round(20 + 80 * (nVerified + 0.5 * nEvidence) / allLines.length)))
  : Math.min(20, Math.round(((Math.min(active, 5) + (armed ? 1 : 0)) / 6) * 20))

// Per-phase facts for the pipeline nodes: the real datum where one exists,
// the phase's generic detail otherwise.
const doneLevel = (brief.match(/##\s*Done level\s*\n+\s*([^\n#]+)/i) || [, ''])[1]
const sizeLetter = ((resume + '\n' + plan + '\n' + greenlight)
  .match(/\b(?:SIZE|[Ss]ize[d]?|[Rr]outer returned)\s*:?\s*\**\s*([SML])\b/) || [, ''])[1]
  || (design ? 'M or L' : '')
let researchN = 0
try { researchN = readdirSync('.forge/research').filter(f => /\.(md|txt)$/i.test(f)).length } catch {}
const directionName = (design.match(/##\s*Direction\s*\n+\**([^*\n.]+)/i) || [, ''])[1]
const screenN = (design.match(/^\|\s*0?\d+\s*\|/gm) || []).length
const armedAt = armed ? (() => { try { return statSync('.forge/ARMED').mtimeMs } catch { return 0 } })() : 0
const phaseFact = i => {
  const st = phaseState(i)
  if (st === 'skipped') return 'skipped'
  if (st === 'pending') return PHASES[i][2]
  switch (i) {
    case 0: return doneLevel ? trunc(doneLevel.trim().toLowerCase(), 26) : PHASES[i][2]
    case 1: return sizeLetter ? `sized ${sizeLetter}` : PHASES[i][2]
    case 2: return researchN ? `${researchN} brief(s) in` : PHASES[i][2]
    case 3: return directionName ? trunc(directionName.trim(), 20) + (screenN ? ` · ${screenN} screens` : '') : PHASES[i][2]
    case 4: return allLines.length ? `${sliceTitles.length || '?'} slices · ${allLines.length} lines` : PHASES[i][2]
    case 5: return armed ? `armed ${hhmmSafe(armedAt)}` : (allLines.length ? 'awaiting approval' : PHASES[i][2])
    case 6: return curSlice ? `slice ${curSlice} of ${sliceTitles.length || '?'}` : PHASES[i][2]
    case 7: return allLines.length ? `${nVerified} of ${allLines.length} verified` : PHASES[i][2]
    case 8: return shipped ? 'report written' : PHASES[i][2]
  }
  return PHASES[i][2]
}
const hhmmSafe = t => t ? new Date(t).toTimeString().slice(0, 5) : ''

// Latest captures. The index was built once, up with the screenmap; the
// gallery is the newest sixty of it and carries the same viewport and theme
// facts, so a figure can say what it proves and at what width.
const latest = captures
  .map(c => { try { return { ...c, t: statSync(c.p).mtimeMs } } catch { return null } })
  .filter(Boolean).sort((a, b) => b.t - a.t).slice(0, 60)

// Test runners wipe and rewrite their output directories mid-run, which
// leaves the board pointing at deleted files between renders. Copy the
// captures into .forge/shots/ and reference the copies: stable names per
// source path, source mtimes preserved so newest-first stays truthful,
// stale copies pruned. Child-relative paths only: Safari refuses to load
// subresources from a local page's parent directories.
const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(16) }
try {
  mkdirSync('.forge/shots', { recursive: true })
  const keep = new Set()
  for (const s of latest) {
    // Already filed under .forge/shots by the agent that made it. The page
    // sits in .forge/, so it can reference the file where it lies, still
    // child-relative, and the copy pile stops growing a second copy of every
    // capture the run files there. Nothing is copied, so nothing is added to
    // the ledger, so nothing new becomes prunable.
    if (s.p.startsWith('.forge/shots/')) { s.copy = s.p.slice('.forge/'.length); continue }
    const name = `${hash(s.p)}-${s.p.split('/').pop()}`
    const dst = join('.forge/shots', name)
    keep.add(name)
    try {
      const src = statSync(s.p)
      const cur = existsSync(dst) ? statSync(dst) : null
      if (!cur || cur.size !== src.size || Math.abs(cur.mtimeMs - src.mtimeMs) > 1000) {
        copyFileSync(s.p, dst)
        utimesSync(dst, src.atime, src.mtime)
      }
      s.copy = `shots/${name}`
    } catch { s.copy = null }
  }
  // THE BOARD DELETES NOTHING. Not a capture it found, and no longer a copy it
  // wrote either.
  //
  // `.forge/shots` is where builders and verifiers write evidence captures,
  // and the sweep used to delete every entry it did not recognise, so a
  // capture filed flat there was destroyed on the next `scripts/evidence.sh`
  // call by the board that exists to display it. This run's captures survived
  // only because they happened to sit in per-slice subdirectories, where
  // the delete call throws EISDIR into an empty catch. Luck, not design. A manifest
  // fixed that half: prune only what this file recorded writing, never what a
  // filename suggests, because copies are `<hash>-<basename>` and the hash is
  // 1 to 8 hex characters, which `d5-01-aisle-dark-390.png` matches exactly.
  //
  // The manifest is still not enough, and the second half is why the unlink is
  // gone. Test runners wipe their output directories mid-run: 169 of the 250
  // capture paths named in one run's EVIDENCE.md no longer existed on disk. For
  // those, THIS FILE'S COPY IS THE LAST SURVIVING IMAGE, and pruning it because
  // it aged out of the newest sixty destroys the only proof of a ruling. A
  // renderer that runs a thousand times a run must not hold a delete at all.
  // The pile it leaves is bounded by what the run actually produced, and disk
  // is cheaper than evidence.
  //
  // The manifest stays, so a maintainer can still tell a copy from an original.
  const LEDGER = '.forge/shots/.progress-cache.json'
  let wrote = []
  try { wrote = JSON.parse(readFileSync(LEDGER, 'utf8')) } catch {}
  for (const f of Array.isArray(wrote) ? wrote : []) keep.add(f)
  try { writeFileSync(LEDGER, JSON.stringify([...keep])) } catch {}
} catch {}
const gallery = latest.filter(s => s.copy)
const showable = gallery.slice(0, 6)
const VP_NAME = { m: 'mobile', t: 'tablet', d: 'desktop' }
const vpBadge = c => [VP_NAME[c.vp] || '', c.theme].filter(Boolean).join(' ')
const galleryJson = JSON.stringify(gallery.map(s => ({ s: s.copy, c: s.p, v: s.vp || '', b: vpBadge(s) })))
  .replace(/</g, '\\u003c')

const stackLine = (plan.match(/^\*{0,2}Stack[:*]*\s*(.+)$/mi) || greenlight.match(/^Stack:\s*(.+)$/mi) || [, ''])[1]

// Run duration: first RUNLOG timestamp to now, frozen at REPORT.md when shipped.
const firstTs = (runlog.match(/^(\d{4}-\d{2}-\d{2}T[\d:]+Z)/m) || evidence.match(/^(\d{4}-\d{2}-\d{2}T[\d:]+Z)/m) || [])[1]
let durationTxt = ''
if (firstTs) {
  const start = Date.parse(firstTs)
  const frozen = concluded || (shipped && allLines.length > 0 && !dod.includes('- [ ]'))
  const end = frozen ? (() => { try { return statSync('.forge/REPORT.md').mtimeMs } catch { return Date.now() } })() : Date.now()
  const mins = Math.max(0, Math.round((end - start) / 60000))
  durationTxt = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

// Tokens: summed from this project's session transcripts under
// ~/.claude/projects/<cwd-slug>/, cache reads included. Incremental: a byte
// offset per transcript is kept in .forge/.progress-tokens.json so each hook
// call reads only what was appended since the last one.
const slug = process.cwd().replace(/[/.]/g, '-')
const projDir = join(homedir(), '.claude', 'projects', slug)
let tokensTxt = ''
let tokCache = {}
try {
  const files = []
  for (const f of readdirSync(projDir)) {
    if (f.endsWith('.jsonl')) files.push({ p: join(projDir, f), k: f })
    else {
      const sub = join(projDir, f, 'subagents')
      try { for (const g of readdirSync(sub)) if (g.endsWith('.jsonl')) files.push({ p: join(sub, g), k: `${f}/${g}` }) } catch {}
      const wsub = join(sub, 'workflows')
      try {
        for (const wd of readdirSync(wsub)) {
          try {
            for (const g of readdirSync(join(wsub, wd)))
              if (g.startsWith('agent-') && g.endsWith('.jsonl'))
                files.push({ p: join(wsub, wd, g), k: `${f}/wf/${wd}/${g}` })
          } catch {}
        }
      } catch {}
    }
  }
  const cachePath = '.forge/.progress-tokens.json'
  let cache = {}
  try { cache = JSON.parse(readFileSync(cachePath, 'utf8')) } catch {}
  for (const { p, k: f } of files) {
    const size = statSync(p).size
    const c = cache[f] || { off: 0, tok: 0 }
    if (size > c.off) {
      const fd = openSync(p, 'r')
      const buf = Buffer.alloc(size - c.off)
      readSync(fd, buf, 0, buf.length, c.off)
      closeSync(fd)
      const chunk = buf.toString('utf8')
      const lastNl = chunk.lastIndexOf('\n')
      if (lastNl >= 0) {
        for (const line of chunk.slice(0, lastNl).split('\n')) {
          if (!line.includes('"usage"')) continue
          try {
            const d = JSON.parse(line)
            const u = d?.message?.usage
            if (u) {
              c.tok += (u.input_tokens || 0) + (u.output_tokens || 0) +
                (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)
              if (d.message.model) c.model = d.message.model
            }
          } catch {}
        }
        // c.off is a BYTE offset fed to readSync; lastNl is an index into the
        // decoded string, in UTF-16 units. Any multi-byte character in the
        // chunk makes the string shorter than the bytes it came from, so the
        // stored offset lands short of the true line end and the next render
        // re-reads that tail. Whole records fall inside it, parse fine, and
        // their usage is added again. c.tok is persisted and monotonic, so the
        // inflation compounds on every render and never washes out.
        c.off += Buffer.byteLength(chunk.slice(0, lastNl + 1), 'utf8')
      }
      cache[f] = c
    }
  }
  writeFileSync(cachePath, JSON.stringify(cache))
  tokCache = cache
  const total = Object.values(cache).reduce((a, c) => a + (c.tok || 0), 0)
  if (total > 0) tokensTxt = total >= 1e6 ? `${(total / 1e6).toFixed(1)}M` : `${Math.round(total / 1e3)}k`
} catch {}

const dotCls = { verified: 'ok', evidence: 'wait', building: 'bld', unrecorded: 'bad', failing: 'fail', open: 'idle' }
// A failing line carries its ruling into every place it is drawn, so the row
// answers "why" without anybody opening a verdict file.
const lineTitle = l => l.fail
  ? `FAILED · ${l.fail.src}${l.fail.at ? ` · ${new Date(l.fail.at).toISOString().slice(0, 16).replace('T', ' ')}` : ''}\n${trunc(l.fail.why, 400)}`
  : ''
const evTail = evidenceLines.slice(-7).reverse().map(l => {
  const m = l.match(/^(\S+) \| ([^|]+) \| (.*)$/)
  return m ? { t: m[1].slice(11, 16), id: trunc(m[2].trim(), 16), txt: m[3] } : { t: '', id: '', txt: l }
})
// The real agent tree, from the session transcripts: every subagent leaves
// agent-<id>.meta.json (type, description, spawnDepth, toolUseId) plus a
// transcript whose timestamps give start, end, and liveness. Agents deeper
// than 1 are attributed to the agent whose transcript contains their
// spawning tool_use id.
const treeAgents = []
try {
  for (const sd of readdirSync(projDir)) {
    const sub = join(projDir, sd, 'subagents')
    if (!existsSync(sub)) continue
    for (const f of readdirSync(sub)) {
      if (!f.endsWith('.meta.json')) continue
      let m; try { m = JSON.parse(readFileSync(join(sub, f), 'utf8')) } catch { continue }
      const id = f.slice(6, -10)
      let st = null, en = null, live = false
      try {
        const s = statSync(join(sub, `agent-${id}.jsonl`))
        en = s.mtimeMs; st = s.birthtimeMs || null
        live = Date.now() - s.mtimeMs < 120000
      } catch {}
      const ck = `${sd}/agent-${id}.jsonl`
      let tok = tokCache[ck] && tokCache[ck].tok || 0
      let model = tokCache[ck] && tokCache[ck].model || ''
      if (!model) {
        // Files scanned before model capture existed: read the head once.
        try {
          const fd = openSync(join(sub, `agent-${id}.jsonl`), 'r')
          const buf = Buffer.alloc(8192)
          const n = readSync(fd, buf, 0, 8192, 0)
          closeSync(fd)
          model = (buf.toString('utf8', 0, n).match(/"model":"([^"]+)"/) || [, ''])[1]
        } catch {}
      }
      treeAgents.push({ id, dir: sub, type: m.agentType || 'agent', desc: m.description || '', depth: m.spawnDepth || 1, tu: m.toolUseId, st, en, live, parent: null, tok, model })
    }
  }
  for (const a of treeAgents) {
    if (a.depth > 1 && a.tu) {
      for (const p of treeAgents) {
        if (p === a || p.depth !== a.depth - 1) continue
        try { if (readFileSync(join(p.dir, `agent-${p.id}.jsonl`), 'utf8').includes(a.tu)) { a.parent = p.id; break } } catch {}
      }
    }
  }
} catch {}
treeAgents.sort((a, b) => (a.st || 0) - (b.st || 0))
// Workflow runs live beside the subagents: <session>/workflows/wf_*.json
// holds the run metadata and script (whose meta block names it), and
// <session>/subagents/workflows/<runId>/ holds that run's agent transcripts.
const wfMap = {}
try {
  for (const sd of readdirSync(projDir)) {
    const wdir = join(projDir, sd, 'workflows')
    if (!existsSync(wdir)) continue
    for (const f of readdirSync(wdir)) {
      if (!f.startsWith('wf_') || !f.endsWith('.json')) continue
      let w; try { w = JSON.parse(readFileSync(join(wdir, f), 'utf8')) } catch { continue }
      const id = w.runId || f.replace(/\.json$/, '')
      const name = ((w.script || '').match(/name:\s*'([^']+)'/) || [, 'workflow'])[1]
      const adir = join(projDir, sd, 'subagents', 'workflows', id)
      let total = 0, liveN = 0, en = Date.parse(w.timestamp) || 0
      try {
        for (const g of readdirSync(adir)) {
          if (g.endsWith('.meta.json')) total++
          else if (g.startsWith('agent-') && g.endsWith('.jsonl')) {
            const mt = statSync(join(adir, g)).mtimeMs
            if (mt > en) en = mt
            if (Date.now() - mt < 120000) liveN++
          }
        }
      } catch {}
      const cur = wfMap[id]
      if (!cur || total > cur.total) wfMap[id] = { id, name, st: Date.parse(w.timestamp) || null, en, live: liveN > 0, liveN, total }
    }
  }
} catch {}
const workflows = Object.values(wfMap)
for (const w of workflows) {
  w.tok = Object.entries(tokCache).filter(([k]) => k.includes(`/wf/${w.id}/`))
    .reduce((a, [, c]) => a + (c.tok || 0), 0)
}

const fmtDur = ms => { if (!ms || ms < 0) return ''; const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` }
const fmtTok = t => t >= 1e6 ? `${(t / 1e6).toFixed(1)}M` : t >= 1000 ? `${Math.round(t / 1e3)}k` : `${t}`
const shortModel = m => m.replace(/^claude-/, '').replace(/-\d{6,}$/, '')
const hhmm = t => new Date(t).toTimeString().slice(0, 5)
const kids = id => treeAgents.filter(a => a.parent === id)
const renderNode = a =>
  `<div class="tnode${a.live ? ' on' : ''}" title="${a.live ? 'running' : `ran ${fmtDur((a.en || 0) - (a.st || a.en || 0))}`}"><span class="tdot${a.live ? ' on' : ''}"></span><span class="tag">${esc(a.type)}</span><span class="tds">${esc(trunc(a.desc, 48))}</span>${a.model ? `<span class="tmk">${esc(shortModel(a.model))}</span>` : ''}${a.tok ? `<span class="tmk">${fmtTok(a.tok)}</span>` : ''}<span class="tdu">${a.live ? 'running' : a.en ? hhmm(a.en) : ''}</span></div>`
  + kids(a.id).map(k => `<div class="tkid">${renderNode(k)}</div>`).join('')
const wfRow = w =>
  `<div class="tnode${w.live ? ' on' : ''}"><span class="tdot${w.live ? ' on' : ''}"></span><span class="tag">workflow</span><span class="tds">${esc(w.name)} · ${w.total} agent(s)${w.liveN ? ` · ${w.liveN} running` : ''}</span>${w.tok ? `<span class="tmk">${fmtTok(w.tok)}</span>` : ''}<span class="tdu">${w.live ? 'running' : w.en ? hhmm(w.en) : ''}</span></div>`
const roots = treeAgents.filter(a => !a.parent)
const cutoff = Date.now() - 30 * 60000
const entries = [
  ...workflows.map(w => ({ kind: 'wf', ...w })),
  ...roots.map(a => ({ kind: 'ag', ...a })),
].sort((a, b) => (a.st || 0) - (b.st || 0))
const recent = entries.filter(x => x.live || (x.en && x.en >= cutoff))
const TREE_MAX = 12
const shownRoots = [...recent.filter(x => x.live), ...recent.filter(x => !x.live)].slice(0, TREE_MAX)
const treeOmitted = entries.length - shownRoots.length
const treeHtml = shownRoots.map(x => x.kind === 'wf' ? wfRow(x) : renderNode(x)).join('\n    ')

// Dispatch pulse: liveness, rhythm, and who did the work. RUNLOG records
// stops, so "last activity" is the time since any agent last finished.
// The fourth field is the elapsed seconds since the previous stop, which
// runlog.sh started recording so the time split stops being a reconstruction.
// Logs written before it carry three fields and fall back to the estimate.
const runEntries = runlog.trim() ? runlog.trim().split('\n').map(l => {
  const m = l.match(/^(\S+) \| (\S+) \| [^|\n]*(?:\| *(\d+)s)?\s*$/)
  return m ? { t: Date.parse(m[1]), a: m[2], el: m[3] ? +m[3] * 1000 : null } : null
}).filter(e => e && !isNaN(e.t)) : []
const SEATS = ['router', 'scout', 'designer', 'architect', 'builder', 'verifier', 'finisher']
const typeCounts = {}
for (const a of treeAgents) typeCounts[a.type] = (typeCounts[a.type] || 0) + 1
const anonStops = runEntries.filter(e => !SEATS.includes(e.a)).length

// ------------------------------------------------------- where the time goes
// "The harness spends longer verifying than building" is the question a run
// asks after a day, and the board could not answer it: RUNLOG records stops
// and nothing else, so there are no starts, no durations and no phases in it
// at all. What it does carry is the seat name on the stops the harness
// bothered to name, and those segment the timeline: the stretch that ENDS in a
// builder stop was build, the stretch that ends in a verifier stop was verify.
// Gaps with no stop at all for a quarter of an hour are nobody's, and are
// dropped rather than charged to whoever happened to finish next.
//
// This is a reconstruction, not a measurement, and the panel says so with the
// coverage beside it. A run whose runlog carries real durations will not need
// it, and this becomes the fallback for the logs written before it did.
const IDLE_MS = 15 * 60000
const PHASE_OF = { builder: 'build', verifier: 'verify', architect: 'other', designer: 'other',
  scout: 'other', router: 'other', finisher: 'other' }
const spanTotals = { build: 0, verify: 0, other: 0 }
const spanToday = { build: 0, verify: 0, other: 0 }
const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
{
  // Every stop marks the clock, named or not, because the anonymous helper
  // stops are what prove the machine was busy. The stretch between two NAMED
  // stops is charged to the seat that ended it, and the anonymous stops inside
  // it decide which parts of that stretch were work and which were nobody
  // there: a gap of more than a quarter of an hour with no stop of any kind is
  // idle and is charged to no one.
  //
  // Charging only named-stop-to-named-stop gaps under the idle cap is the
  // wrong shape: with 61 seat-named stops among 3,639 the named ones sit hours
  // apart, every gap trips the cap, and a 41-hour run reports two hours of
  // work. The pending accumulator is what makes the two scales agree.
  const all = [...runEntries].sort((a, b) => a.t - b.t)
  let prev = all.length ? all[0].t : 0
  let pending = 0
  for (const e of all) {
    // A recorded elapsed beats a computed gap: it is what the hook measured,
    // not what this file inferred from two adjacent timestamps.
    const gap = e.el != null ? e.el : e.t - prev
    prev = e.t
    if (gap > 0 && gap <= IDLE_MS) pending += gap
    const k = PHASE_OF[e.a]
    if (!k) continue
    spanTotals[k] += pending
    if (e.t >= dayStart.getTime()) spanToday[k] += pending
    pending = 0
  }
}
const measured = runEntries.filter(e => e.el != null).length
const spanAll = spanTotals.build + spanTotals.verify + spanTotals.other
const namedStops = runEntries.filter(e => PHASE_OF[e.a]).length
const fmtH = ms => ms >= 3600000 ? `${(ms / 3600000).toFixed(1)}h` : `${Math.round(ms / 60000)}m`
const verifyShare = spanAll ? Math.round(spanTotals.verify / spanAll * 100) : 0
const todayAll = spanToday.build + spanToday.verify + spanToday.other
const timeTitle = spanAll
  ? `${measured === runEntries.length ? 'Measured' : measured ? `Measured for ${measured} stop(s), reconstructed for the rest` : 'Reconstructed'}`
    + ` from ${namedStops} seat-named stop(s) of ${runEntries.length}: each stretch is charged to the seat that ended it, gaps over 15 minutes dropped.\n`
    + `whole run · build ${fmtH(spanTotals.build)} · verify ${fmtH(spanTotals.verify)} · other ${fmtH(spanTotals.other)}\n`
    + (todayAll ? `today · build ${fmtH(spanToday.build)} · verify ${fmtH(spanToday.verify)} · other ${fmtH(spanToday.other)}` : 'today · nothing yet')
  : ''
const lastT = runEntries.length ? Math.max(...runEntries.map(e => e.t)) : 0
const agoMin = lastT ? Math.max(0, Math.round((Date.now() - lastT) / 60000)) : null
const agoTxt = agoMin === null ? '' : agoMin < 1 ? 'just now'
  : agoMin < 60 ? `${agoMin}m ago` : `${Math.floor(agoMin / 60)}h ${String(agoMin % 60).padStart(2, '0')}m ago`
const liveCls = agoMin === null ? '' : agoMin <= 5 ? 'ok' : agoMin <= 30 ? 'warn' : ''
const NB = 28
let sparkBars = ''
if (runEntries.length) {
  const t0 = Math.min(...runEntries.map(e => e.t))
  const span = Math.max(1, Date.now() - t0)
  const buckets = Array(NB).fill(0)
  for (const e of runEntries) buckets[Math.min(NB - 1, Math.floor((e.t - t0) / span * NB))]++
  const max = Math.max(...buckets, 1)
  const lastIdx = buckets.reduce((a, c, i) => c ? i : a, -1)
  const bucketMin = span / NB / 60000
  sparkBars = buckets.map((c, i) =>
    `<div class="bar${i === lastIdx && agoMin !== null && agoMin <= bucketMin * 1.5 ? ' hot' : ''}" style="height:${c ? Math.max(14, Math.round(c / max * 100)) : 4}%"></div>`
  ).join('')
}
const wfAgentTotal = workflows.reduce((a, w) => a + w.total, 0)
const seatChips = Object.entries(typeCounts).sort((x, y) => y[1] - x[1])
  .map(([k, n]) => `<span class="chip">${esc(k)} <b>&times;${n}</b></span>`).join('\n    ')
  + (wfAgentTotal ? `\n    <span class="chip">workflow agents <b>&times;${wfAgentTotal}</b></span>` : '')
  + (anonStops ? `\n    <span class="chip">helper stops <b>&times;${anonStops}</b></span>` : '')

const footerA = `<span class="mi"><span class="d"></span>Drawn from .forge/ by scripts/progress.mjs after every dispatch, checkpoint, and evidence line. The state files win over this page.</span>`
const footerB = `<span class="mi">estimate: gate 20 + rubric 80, evidence at half weight, 100 only when every line is verified and the report exists · tokens sum every session and subagent transcript for this folder, cache reads included · rendered ${new Date().toISOString().replace(/\.\d+Z/, 'Z')} · refresh 15s</span>`

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<noscript><meta http-equiv="refresh" content="15"></noscript>
<title>${esc(boardTitle)} · forge</title>
<style>
:root{--bg:#0B0B0B;--surface:#1C1C1C;--raised:#262626;--ink:#FAFAFA;
--muted:#8C8C8C;--line:#333333;--accent:#3FBF52;--accent-ink:#052A0C;
--dot:rgba(255,255,255,0.10);--warn:#E0A32E;--negative:#E0503F;
--sans:"Inter","General Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box;margin:0}
html{font-size:clamp(12px,0.85vw,17px)}
body{height:100dvh;overflow:hidden;display:grid;
grid-template-rows:auto auto 1fr auto;grid-template-columns:minmax(0,1fr);
gap:.8rem;padding:1rem 1.25rem .6rem;
background-color:var(--bg);
background-image:radial-gradient(var(--dot) 1px,transparent 1px);
background-size:24px 24px;background-position:-1px -1px;
color:var(--ink);font:400 .75rem/1.35 var(--sans)}
.lbl{font:500 .625rem/1.3 var(--mono);letter-spacing:.04em;color:var(--muted)}
header{display:flex;gap:1.25rem;align-items:center}
header .id{flex:1;min-width:0}
h1{font:500 1.25rem/1.3 var(--sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chips{margin-top:.35rem;display:flex;gap:.4rem;white-space:nowrap;overflow:hidden}
.envs{margin-top:.4rem;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}
.env{display:inline-flex;align-items:center;gap:.4rem;padding:3px 9px;border-radius:6px;
border:1px solid var(--line);background:var(--surface);text-decoration:none;
font:400 .68rem/1.4 var(--mono);color:var(--muted)}
.env:hover{border-color:var(--muted)}
.env .d{width:6px;height:6px;border-radius:50%;flex:none;background:var(--line)}
.env--up{color:var(--ink)}
.env--up .d{background:var(--accent)}
.env--down .d{background:transparent;border:1px solid var(--negative)}
.env--dead{opacity:.5;cursor:help}
.env--dead .d{background:transparent;border:1px dashed var(--muted)}
.env .el{font-weight:500}
.env .eu{opacity:.65}
@media (prefers-reduced-motion:no-preference){.env--up .d{animation:pulse 2.4s ease-in-out infinite}}
.chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;
font:500 .625rem/1.2 var(--sans);letter-spacing:.04em;
background:var(--raised);color:var(--muted);border:1px solid var(--line)}
.chip--ok{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 40%,var(--line))}
.chip--bad{color:var(--negative);border-color:color-mix(in srgb,var(--negative) 40%,var(--line))}
.chip .d{width:6px;height:6px;border-radius:50%;background:currentColor}
.pct{text-align:right;flex:none}
.pct .n{font:500 2.4rem/1 var(--sans);font-variant-numeric:tabular-nums}
.pct .cap{font:400 .625rem/1.4 var(--mono);color:var(--muted)}
.meter{height:.35rem;background:var(--raised);border:1px solid var(--line);
border-radius:99px;overflow:hidden;display:flex}
.pct .meter{margin-top:.4rem;width:10.5rem}
.m-v{background:var(--accent)}.m-e{background:var(--warn)}
/* In build reads as scope, not progress: an outline rather than a fill, so it
   can never be mistaken for a line that is part-way to PASS. Unrecorded is the
   only thing on this board allowed to look like a problem. */
.m-b{background:repeating-linear-gradient(90deg,var(--line) 0 3px,transparent 3px 6px)}
.m-u{background:var(--negative)}
/* Ruled against is a solid negative, unrecorded a hatched one: both are red,
   and the difference between "the verifier said no" and "nobody wrote it
   down" is worth a texture. */
.m-f{background:var(--negative)}
.m-u{background:repeating-linear-gradient(90deg,var(--negative) 0 3px,transparent 3px 6px)}
/* Where the hours went. Not a measurement and never drawn as one: the tooltip
   carries the reconstruction and its coverage. */
.tsplit{height:.25rem;width:10.5rem;margin-top:.35rem;display:flex;gap:1px;
border-radius:99px;overflow:hidden;cursor:help}
.t-b{background:color-mix(in srgb,var(--accent) 70%,transparent)}
.t-v{background:var(--warn)}
.t-o{background:var(--line)}
.chip--warn{color:var(--negative);border-color:color-mix(in srgb,var(--negative) 45%,var(--line))}
.debt{margin-top:.6rem;padding:.45rem .55rem;border-radius:6px;
border:1px solid color-mix(in srgb,var(--negative) 40%,var(--line));
font:500 .68rem/1.5 var(--mono);color:var(--negative)}
.debt--bad{background:color-mix(in srgb,var(--negative) 12%,transparent);
border-color:var(--negative);cursor:help}
.debtwhy{font:400 .64rem/1.45 var(--sans);color:var(--muted);margin-top:.2rem}
.stale{margin-bottom:.5rem;padding:.3rem .5rem;border-radius:5px;cursor:help;
border:1px solid color-mix(in srgb,var(--warn) 40%,var(--line));
font:400 .64rem/1.45 var(--mono);color:var(--warn)}
.graph{display:flex;align-items:stretch;padding:.5rem 0 .2rem}
.pnode{flex:3;min-width:0;background:var(--surface);border:1px solid var(--line);
border-radius:10px;padding:.75rem .85rem .65rem;box-shadow:0 2px 8px rgb(0 0 0 / .5)}
.pnode .ph{display:flex;align-items:center;gap:.55rem;min-width:0}
.pmark{width:1.05rem;height:1.05rem;border-radius:50%;background:var(--raised);
border:1px solid var(--line);flex:none;display:flex;align-items:center;
justify-content:center;font:700 .62rem/1 var(--sans);color:var(--bg)}
.pt{font-size:1.18rem;font-weight:500;letter-spacing:-.01em;color:var(--muted);
white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pf{font:500 .66rem/1.4 var(--mono);color:var(--muted);margin:.3rem 0 0 1.6rem;
white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* Completion is a FILLED state; in progress is an OUTLINED one. Done used to
   be painted in --muted while the active node held the only green, so a
   finished step read as dimmed and the step still running looked more complete
   than the ones behind it. The wash stays low so the board keeps its one
   rationed green: intensity is still reserved for what is live. */
.pnode.done{background:color-mix(in srgb,var(--accent) 10%,var(--surface));
border-color:color-mix(in srgb,var(--accent) 30%,var(--line))}
.pnode.done .pt{color:var(--ink)}
.pnode.done .pf{color:var(--ink);opacity:.8}
.pnode.done .pmark{background:var(--accent);border-color:var(--accent);
color:var(--accent-ink)}
.pnode.active{border-color:var(--accent);
box-shadow:0 0 0 1px var(--accent),0 2px 8px rgb(0 0 0 / .5)}
.pnode.active .pt{color:var(--ink)}
.pnode.active .pf{color:var(--ink)}
.pnode.active .pmark{background:var(--accent);border-color:var(--accent)}
.pnode.pending{opacity:.55}
.pnode.skipped{opacity:.5;background-image:repeating-linear-gradient(45deg,
transparent 0 7px,rgb(255 255 255 / .05) 7px 8px)}
.pnode.skipped .pt{text-decoration:line-through}
.pnode.skipped .pmark{color:var(--muted)}
.wire{flex:1;min-width:.7rem;align-self:center;height:2px;background:var(--line);
position:relative;margin:0 -1px;z-index:0}
.wire::after{content:"";position:absolute;right:0;top:-3px;
border-left:6px solid var(--line);border-top:4px solid transparent;
border-bottom:4px solid transparent}
.wire.w-done{background:color-mix(in srgb,var(--accent) 50%,var(--line))}
.wire.w-done::after{border-left-color:color-mix(in srgb,var(--accent) 50%,var(--line))}
.wire.w-live{background:var(--accent)}.wire.w-live::after{border-left-color:var(--accent)}
@media (prefers-reduced-motion:no-preference){
.pnode.active{animation:ring 1.6s ease-in-out infinite}
.pnode.active .pmark{animation:pulse 1.6s ease-in-out infinite}
.wire.w-live{background:repeating-linear-gradient(90deg,var(--accent) 0 7px,
transparent 7px 12px);animation:flow .7s linear infinite}
@keyframes ring{50%{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 35%,transparent),
0 2px 8px rgb(0 0 0 / .5)}}
@keyframes flow{to{background-position:-12px 0}}
@keyframes pulse{50%{opacity:.35}}}
/* The dot is gone: it cost a fixed 11px of every chip plus its gap, on a strip
   that has to carry thirteen titles. The slice NUMBER carries the state
   instead, so the indicator costs nothing the label was not already paying. */
.slices{display:flex;flex-wrap:wrap;gap:.35rem;justify-content:center;
margin-top:.5rem;overflow:hidden}
.slices .chip{font-size:.72rem;padding:3px 8px;gap:.45rem;max-width:15rem;
min-width:0;color:var(--muted)}
.slices .chip b{font:500 .66rem/1.4 var(--mono);color:var(--muted);flex:none}
.slices .chip i{font:400 .62rem/1.4 var(--mono);font-style:normal;
color:var(--muted);opacity:.7;flex:none}
.slices .chip>:not(b):not(i){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* The fill used to sit on the ACTIVE chip and nothing on the done ones, which
   inverted the reading: the slice still being worked looked settled and the
   three finished behind it looked pending. */
.slices .sl-done{color:var(--ink);
background:color-mix(in srgb,var(--accent) 13%,var(--surface));
border-color:color-mix(in srgb,var(--accent) 32%,var(--line))}
.slices .sl-done b{color:var(--accent)}
.slices .sl-done i{color:var(--accent);opacity:.9}
.slices .sl-active{color:var(--ink);background:var(--surface);
border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.slices .sl-active b{color:var(--accent)}
.slices .sl-active i{color:var(--ink);opacity:1}
/* A slice carrying a line the verifier ruled against wears the count in red,
   whatever else it is. Done and failing are not exclusive: a slice can be
   fully built, mostly verified, and still owe one refused line. */
.slices .sl-fail{border-color:var(--negative)}
.slices .chip u{font:500 .6rem/1.4 var(--mono);text-decoration:none;flex:none;
color:var(--negative);padding:0 .25rem;border-radius:3px;
background:color-mix(in srgb,var(--negative) 18%,transparent)}
main{display:grid;grid-template-columns:1.05fr 1.45fr .72fr;
grid-template-rows:1.3fr .8fr;gap:.8rem;min-height:0}
.panel.rub{grid-column:1;grid-row:1/3}
.panel.act{grid-column:2;grid-row:1}
.panel.cap{grid-column:3;grid-row:1}
.panel.disp{grid-column:2/4;grid-row:2}
/* The screenmap claims a fourth column, full height, only when the run has
   screens to draw. Without it the board keeps its three-column shape. */
main.smx{grid-template-columns:1fr 1.4fr .7fr .78fr}
main.smx .panel.scr{grid-column:4;grid-row:1/3}
.smap{display:flex;flex-direction:column;gap:.1rem;overflow-y:auto;min-height:0;flex:1}
/* A sitemap is a tree, so the rows are indented by depth. --d is the segment
   depth, set per row: /account/reset/confirm sits two steps in from /account
   and reads as belonging to it without a single box-drawing character.
   ONE LINE PER NODE. Two lines fitted seven designer screens and hid two
   thirds of twenty-six routes, and half a sitemap answers none of the
   questions a whole one does. */
.srow{display:flex;align-items:center;gap:.35rem;min-width:0;
padding:.09rem .1rem .09rem calc(var(--d,0) * .55rem + .1rem);position:relative}
.srow[style*="--d:1"],.srow[style*="--d:2"],.srow[style*="--d:3"],.srow[style*="--d:4"]{
border-left:1px solid var(--line);margin-left:.25rem}
.sh{display:flex;align-items:center;gap:.4rem;min-width:0}
.sdot{width:.5rem;height:.5rem;border-radius:50%;flex:none;
border:1px solid var(--line);background:transparent}
.s-cap .sdot{background:var(--accent);border-color:var(--accent)}
.srow.s-cap{background:color-mix(in srgb,var(--accent) 9%,transparent);
border-radius:5px;padding-top:.1rem;padding-bottom:.1rem}
.s-bld .sdot{border-color:var(--warn)}
/* A path segment with no page of its own is scaffolding, not a screen. */
.s-stub{opacity:.55}
.s-stub .sdot{border-style:dashed}
.sn{font:500 .62rem/1.4 var(--mono);color:var(--muted);flex:none}
.snm{font:400 .7rem/1.4 var(--mono);color:var(--ink);white-space:nowrap;
overflow:hidden;text-overflow:ellipsis;flex:none;max-width:8rem}
.sal{font-size:.66rem;color:var(--muted);white-space:nowrap;overflow:hidden;
text-overflow:ellipsis;flex:1;min-width:0}
.srow>.cov{margin-left:auto}
.srow>.snb{margin-left:.15rem}
.dlink{font-size:.62rem;color:var(--muted);text-decoration:none;flex:none;
padding:0 .15rem;border-radius:3px}
.dlink:hover{color:var(--accent);background:var(--raised)}
.phead .dlink{margin-left:auto;margin-right:.5rem;font-family:var(--mono)}
.s-pln .snm{opacity:.5}
.sgrp{margin-top:.45rem;padding-top:.35rem;border-top:1px solid var(--line);
font:500 .6rem/1.3 var(--mono);letter-spacing:.04em;color:var(--muted)}
.sm{display:flex;align-items:center;gap:.4rem;padding-left:.9rem;min-width:0}
/* Four cells, mobile light and dark then desktop light and dark. A screen
   proved on a laptop only is half filled, and says so without a legend. */
.cov{display:flex;gap:2px;flex:none}
.cov i{width:.32rem;height:.32rem;border-radius:1px;display:block;
border:1px solid var(--line);background:transparent}
.cov i.on{background:var(--accent);border-color:var(--accent)}
.srt{font:400 .61rem/1.4 var(--mono);color:var(--muted);white-space:nowrap;
overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.srt.gone{color:var(--warn)}
.ssl{font:400 .6rem/1.4 var(--mono);color:var(--muted);opacity:.75;flex:1;
min-width:0;overflow:hidden}
.sbar{width:2.4rem;height:3px;border-radius:2px;background:var(--line);flex:none;overflow:hidden}
.sbar i{display:block;height:100%;background:var(--accent)}
.snb{font:400 .61rem/1.4 var(--mono);color:var(--muted);width:2.5ch;text-align:right;flex:none}
.swarn{color:var(--negative)}
.sfoot{margin-top:.5rem;padding-top:.45rem;border-top:1px solid var(--line);
font-size:.61rem;line-height:1.45;color:var(--muted)}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:10px;
padding:.8rem .9rem;overflow:hidden;min-height:0;display:flex;flex-direction:column;
box-shadow:0 2px 8px rgb(0 0 0 / .5)}
.panel .lbl{margin-bottom:.55rem}
.rgrid{display:grid;grid-template-columns:max-content 1fr 2.6ch 2.6ch 2.6ch 2.6ch 2.9ch;
gap:.3rem .55rem;align-items:center;font-size:.72rem}
.rgrid .h{font:500 .6rem/1.2 var(--mono);color:var(--muted);text-align:right}
.rgrid .nm{color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:9em}
.rgrid .n{font:400 .68rem/1.2 var(--mono);font-variant-numeric:tabular-nums;
text-align:right;color:var(--muted)}
.rgrid .n.on{color:var(--ink)}
.rgrid .nm.full{color:var(--accent)}
.dotln{width:.5rem;height:.5rem;border-radius:50%;flex:none;margin-top:.28rem}
.dotln.ok{background:var(--accent)}
.dotln.wait{background:transparent;border:1px solid var(--warn)}
.dotln.idle{background:transparent;border:1px solid var(--line)}
.dotln.bld{background:transparent;border:1px dashed var(--muted)}
.dotln.bad{background:var(--negative)}
.dotln.fail{background:var(--negative);box-shadow:0 0 0 2px color-mix(in srgb,var(--negative) 30%,transparent)}
.rgrid .n.bad{color:var(--negative)}
.play{margin-top:.7rem;padding-top:.55rem;border-top:1px solid var(--line);
overflow:hidden;min-height:0;flex:1}
.play .row{display:flex;gap:.5rem;padding:.22rem 0;align-items:flex-start}
.play .id{font:500 .62rem/1.5 var(--mono);color:var(--muted);flex:none;width:2.6ch}
.play .tx{font-size:.7rem;color:var(--ink);opacity:.85;overflow:hidden;
display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.kv{display:grid;grid-template-columns:max-content 1fr;gap:.15rem .7rem;margin-bottom:.6rem}
.kv .k{font:500 .62rem/1.6 var(--mono);color:var(--muted);white-space:nowrap}
.kv .v{font-size:.72rem;color:var(--ink);overflow:hidden;display:-webkit-box;
-webkit-line-clamp:2;-webkit-box-orient:vertical}
.feed{overflow:hidden;min-height:0}
.feed .row{display:flex;gap:.55rem;padding:.3rem 0;border-bottom:1px solid var(--line);align-items:flex-start}
.feed .row:last-child{border-bottom:none}
.feed .t{font:400 .62rem/1.6 var(--mono);color:var(--muted);flex:none}
.feed .tag{font:500 .6rem/1.2 var(--mono);color:var(--muted);background:var(--raised);
border:1px solid var(--line);border-radius:6px;padding:2px 6px;flex:none;margin-top:.1rem}
.feed .tx{font-size:.7rem;color:var(--ink);opacity:.85;overflow:hidden;
display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.gap{margin-top:.7rem}
.live{display:inline-block;width:.5rem;height:.5rem;border-radius:50%;
background:var(--line);margin-right:.4rem;vertical-align:baseline}
.live.ok{background:var(--accent)}.live.warn{background:var(--warn)}
.spark{display:flex;align-items:flex-end;gap:2px;height:1.5rem;width:15rem;flex:none}
.spark .bar{flex:1;min-width:2px;background:var(--raised);border-radius:1px}
.spark .bar.hot{background:var(--accent)}
.seats{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.5rem}
.seats .chip{font-size:.62rem}
.seats .chip b{color:var(--ink);font-weight:500}
.troot{font:500 .66rem/1.4 var(--mono);color:var(--muted);margin:.45rem 0 .1rem}
.tree{flex:1;min-height:0;overflow:hidden;column-count:2;column-gap:1.8rem}
.tnode{break-inside:avoid;display:flex;gap:.5rem;align-items:baseline;
padding:.16rem 0 .16rem .8rem;position:relative;border-left:1px solid var(--line);min-width:0}
.tnode::before{content:"";position:absolute;left:0;top:.72rem;width:.5rem;
height:1px;background:var(--line)}
.tdot{width:.5rem;height:.5rem;border-radius:50%;flex:none;background:var(--muted);
position:relative;top:.05rem}
.tdot.on{background:var(--accent)}
@media (prefers-reduced-motion:no-preference){
.tdot.on{animation:pulse 1.6s ease-in-out infinite}}
.tnode .tds{font-size:.7rem;color:var(--muted);white-space:nowrap;
overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.tnode.on .tds{color:var(--ink)}
.tnode.on .tag{color:var(--ink)}
.tnode .tdu{font:400 .62rem/1.5 var(--mono);color:var(--muted);flex:none}
.tnode .tmk{font:400 .6rem/1.4 var(--mono);color:var(--muted);flex:none;
background:var(--raised);border:1px solid var(--line);border-radius:6px;padding:1px 5px}
.tkid{margin-left:1.3rem}
.shots{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:1fr;gap:.5rem;flex:1;min-height:0}
.shots figure{overflow:hidden;border-radius:6px;border:1px solid var(--line);
position:relative;min-height:0;cursor:pointer;background:var(--raised)}
.shots img{width:100%;height:100%;object-fit:cover;display:block}
.shots figcaption{position:absolute;left:0;right:0;bottom:0;
font:400 .58rem/1.4 var(--mono);padding:.15rem .35rem;
background:rgb(11 11 11 / .78);color:var(--muted);
white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* What width and theme this capture proves, taken from its own filename. */
.vpb{position:absolute;top:.25rem;right:.25rem;border-radius:4px;
font:500 .55rem/1.4 var(--mono);padding:.05rem .3rem;
background:rgb(11 11 11 / .8);color:var(--muted)}
.empty{color:var(--muted);font-size:.72rem;margin:auto;text-align:center;padding:1rem}
footer{border-top:1px solid var(--line);padding-top:.45rem;display:flex;gap:2rem;
font:400 .62rem/1.4 var(--mono);color:var(--muted);white-space:nowrap}
.mw{flex:1;min-width:0;overflow:hidden}
.marq{display:flex;width:max-content}
.marq .mi{padding-right:4rem}
@media (prefers-reduced-motion:no-preference){
.marq{animation:marq 45s linear infinite}
@keyframes marq{to{transform:translateX(-50%)}}}
.marq.still{animation:none}
.marq.still .mi+.mi{display:none}
footer .d{display:inline-block;width:6px;height:6px;border-radius:50%;
background:var(--accent);margin-right:.4rem;vertical-align:baseline}
.phead{display:flex;justify-content:space-between;align-items:center;margin-bottom:.55rem}
.phead .lbl{margin-bottom:0}
.btn-all{font:500 .66rem/1.2 var(--sans);padding:4px 10px;border-radius:8px;
background:var(--raised);color:var(--ink);border:1px solid var(--line);cursor:pointer}
.btn-all:hover{background:#2E2E2E}
.rb{position:fixed;inset:0;display:none;background:rgb(0 0 0 / .6);z-index:9;
align-items:center;justify-content:center;padding:2rem}
.rb.open{display:flex}
.rb .box{background:var(--surface);border:1px solid var(--line);border-radius:10px;
box-shadow:0 8px 32px rgb(0 0 0 / .7);max-width:62rem;width:100%;max-height:88vh;
display:flex;flex-direction:column;overflow:hidden}
.rb .bh{display:flex;justify-content:space-between;align-items:center;gap:1rem;
padding:.75rem 1rem;border-bottom:1px solid var(--line)}
.rb .bh .ti{font:500 .85rem/1.3 var(--sans);color:var(--ink)}
.rb .bh .lg{font:400 .64rem/1.4 var(--mono);color:var(--muted);
display:flex;align-items:center;gap:.4rem;flex:none}
.rb .bh .lg .dotln{margin-top:0}
.rb .bh .lg .dotln:not(:first-child){margin-left:.7rem}
.rb .bb{overflow-y:auto;padding:.4rem 1rem 1rem}
.rb .grp{display:flex;gap:.25rem;flex:none}
.rb .grp button{font:500 .62rem/1.2 var(--sans);padding:3px 9px;border-radius:7px;
border:1px solid var(--line);background:var(--raised);color:var(--muted);cursor:pointer}
.rb .grp button:hover{color:var(--ink)}
.rb .grp button.on{color:var(--ink);border-color:color-mix(in srgb,var(--accent) 45%,var(--line));
background:color-mix(in srgb,var(--accent) 12%,var(--raised))}
.rb .bb-sec{display:none}
.rb.by-sec .bb-slice{display:none}
.rb.by-sec .bb-sec{display:block}
.rb .sec b{font:400 .62rem/1.3 var(--mono);color:var(--muted);font-weight:400}
.rb .sec b.full{color:var(--accent)}
.rb .sec{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;
font:500 .64rem/1.3 var(--mono);letter-spacing:.04em;color:var(--muted);
margin:.9rem 0 .3rem}
.rb .row{display:flex;gap:.6rem;padding:.34rem 0;border-bottom:1px solid var(--line);
align-items:flex-start}
.rb .row:last-child{border-bottom:none}
.rb .id{font:500 .64rem/1.6 var(--mono);color:var(--muted);flex:none;min-width:2.8ch}
.rb .tx{font-size:.73rem;line-height:1.5;color:var(--ink);opacity:.9}
/* The ruling, beside the line it ruled on. A rubric that shows only what is
   left tells you nothing about what was refused and why. */
.rb .why{flex:none;max-width:22rem;font:400 .66rem/1.45 var(--mono);
color:var(--negative);opacity:.85}
.lb{position:fixed;inset:0;display:none;background:rgb(0 0 0 / .6);z-index:9;
align-items:center;justify-content:center;gap:1rem;padding:1.5rem;cursor:pointer}
.lb.open{display:flex}
.lb .nav{flex:none;width:2.6rem;height:2.6rem;border-radius:50%;cursor:pointer;
background:var(--raised);color:var(--ink);border:1px solid var(--line);
font:400 1.4rem/1 var(--sans);display:flex;align-items:center;justify-content:center}
.lb .nav:hover{background:#2E2E2E}
.lb figure{cursor:default}
.lb figure{max-width:92vw;max-height:92vh;background:var(--surface);
border:1px solid var(--line);border-radius:10px;overflow:hidden;
box-shadow:0 8px 32px rgb(0 0 0 / .7);display:flex;flex-direction:column;min-height:0}
.lb img{max-width:100%;min-height:0;object-fit:contain}
.lb figcaption{font:400 .68rem/1.5 var(--mono);color:var(--muted);padding:.4rem .7rem}
@media (max-width:900px),(orientation:portrait){
body{height:auto;overflow:auto;grid-template-rows:none}
main,main.smx{grid-template-columns:1fr;grid-template-rows:none}
main.smx .panel.scr{grid-column:auto;grid-row:auto}
.panel.rub{grid-row:auto;grid-column:auto}
.panel.act,.panel.cap{grid-column:auto;grid-row:auto}
.panel.disp{grid-column:auto;grid-row:auto}
.tree{column-count:1}
h1{white-space:normal}
.graph{flex-wrap:wrap;gap:.5rem}
.pnode{flex:1 1 30%}
.wire{display:none}
.slices{flex-wrap:wrap}}
</style>
</head>
<body>
<header>
  <div class="id">
    <h1 title="${esc(goal)}">${esc(boardTitle)}</h1>
    <div class="chips">
    ${concluded && verdict ? `<span class="chip ${/^PASS/i.test(verdict) ? 'chip--ok' : 'chip--bad'}"><span class="d"></span>concluded · ${esc(trunc(verdict, 30))}</span>`
      : shipped && verifiedAll ? '<span class="chip chip--ok"><span class="d"></span>shipped</span>'
      : armed ? '<span class="chip chip--ok"><span class="d"></span>gate active</span>'
      : '<span class="chip">pre-greenlight</span>'}
    ${!concluded && shipped && !verifiedAll ? '<span class="chip">report written · verify pending</span>' : ''}
    ${allLines.length ? `<span class="chip">${nVerified} verified · ${nEvidence} evidence${nBuilding ? ` · ${nBuilding} in build` : ''} · ${nOpen} open</span>${nFailing ? `<span class="chip chip--bad" title="${esc(failingLines.map(l => `${l.id} · ${trunc(l.fail.why, 120)}`).join('\n'))}"><span class="d"></span>${nFailing} failing</span>` : ''}${unrecorded.length ? `<span class="chip chip--warn" title="Built in an earlier slice and never recorded in EVIDENCE.md">${unrecorded.length} unrecorded</span>` : ''}` : ''}
    ${worktrees.length ? `<span class="chip ${Date.now() - wtOldest > 864e5 ? 'chip--warn' : ''}" title="${esc(wtTitle)}">${worktrees.length} worktree${worktrees.length > 1 ? 's' : ''}${wtLocked ? ` · ${wtLocked} locked` : ''}</span>` : ''}
    ${stackLine ? `<span class="chip">${esc(trunc(stackLine, 58))}</span>` : ''}
    </div>
    ${envs.length || deadLocal.length ? `<div class="envs">
    ${envs.map(e => `<a class="env ${e.up ? 'env--up' : 'env--down'}" href="${esc(e.href)}" target="_blank" rel="noreferrer" title="${esc(e.href)} · ${esc(e.note)}"><span class="d"></span><span class="el">${esc(e.label)}</span><span class="eu">${esc(e.shown)}</span></a>`).join('\n    ')}
    ${deadLocal.length ? `<span class="env env--dead" title="${esc(deadTitle)}"><span class="d"></span><span class="el">${deadLocal.length} dead port${deadLocal.length > 1 ? 's' : ''}</span></span>` : ''}
    </div>` : ''}
  </div>
  <div class="pct">
    <div class="n">${pct}%</div>
    <div class="cap">complete, estimated</div>
    ${durationTxt || tokensTxt ? `<div class="cap">${[durationTxt ? `running ${durationTxt}` : '', tokensTxt ? `${tokensTxt} tokens` : ''].filter(Boolean).join(' · ')}</div>` : ''}
    ${allLines.length ? `<div class="meter"><span class="m-v" style="width:${(nVerified / allLines.length * 100).toFixed(1)}%"></span><span class="m-e" style="width:${(nEvidence / allLines.length * 100).toFixed(1)}%"></span><span class="m-f" style="width:${(nFailing / allLines.length * 100).toFixed(1)}%"></span><span class="m-u" style="width:${(unrecorded.length / allLines.length * 100).toFixed(1)}%"></span><span class="m-b" style="width:${(nBuilding / allLines.length * 100).toFixed(1)}%"></span></div>` : ''}
    ${spanAll ? `<div class="tsplit" title="${esc(timeTitle)}"><span class="t-b" style="width:${(spanTotals.build / spanAll * 100).toFixed(1)}%"></span><span class="t-v" style="width:${(spanTotals.verify / spanAll * 100).toFixed(1)}%"></span><span class="t-o" style="width:${(spanTotals.other / spanAll * 100).toFixed(1)}%"></span></div>
    <div class="cap" title="${esc(timeTitle)}">${verifyShare}% verifying${todayAll ? ` · ${Math.round(spanToday.verify / todayAll * 100)}% today` : ''}</div>` : ''}
  </div>
</header>

<section>
  <div class="lbl">Pipeline</div>
  <div class="graph">
  ${PHASES.map(([name], i) => {
    const st = phaseState(i)
    const glyph = st === 'done' ? '&check;' : st === 'skipped' ? '&times;' : ''
    const node = `<div class="pnode ${st}"><div class="ph"><span class="pmark">${glyph}</span><span class="pt">${esc(name)}</span></div><div class="pf">${esc(phaseFact(i))}</div></div>`
    const wire = i < PHASES.length - 1
      ? `<div class="wire ${i + 1 < active ? 'w-done' : i + 1 === active ? 'w-live' : ''}"></div>` : ''
    return node + wire
  }).join('\n  ')}
  </div>
  ${sliceTitles.length ? `<div class="slices">
  ${sliceTitles.map(s => {
    const pr = sliceProgress[s.n]
    const done = pr ? pr.done === pr.all : (s.n < curSlice || (s.n === curSlice && shipped))
    const cls = done ? 'sl-done' : s.n === curSlice ? 'sl-active' : ''
    const bad = failBySlice[s.n] || []
    return `<span class="chip ${cls}${bad.length ? ' sl-fail' : ''}" title="slice ${s.n} · ${esc(s.title)}${pr ? ` · ${pr.done} of ${pr.all} verified` : ''}${bad.length ? `\n\nFAILING:\n${esc(bad.map(l => `${l.id} · ${trunc(l.fail.why, 110)}`).join('\n'))}` : ''}"><b>${s.n}</b>${esc(trunc(s.title, 44))}${bad.length ? `<u>${bad.length}</u>` : ''}${pr ? `<i>${pr.done}/${pr.all}</i>` : ''}</span>`
  }).join('\n  ')}
  </div>` : ''}
</section>

<main class="${screenMap.length || sitemap.length ? 'smx' : ''}">
  <div class="panel rub">
    <div class="phead"><span class="lbl">Rubric</span>${allLines.length ? `<button class="btn-all">all ${allLines.length} lines</button>` : ''}</div>
    ${allLines.length ? `<div class="rgrid">
    <span></span><span></span><span class="h" title="verified by the verifier">ok</span><span class="h" title="evidence recorded, awaiting the verifier">ev</span><span class="h" title="ruled against and still unchecked">no</span><span class="h" title="in the slice being built now">wip</span><span class="h">all</span>
    ${sections.filter(s => s.lines.length).map(s => {
      const v = s.lines.filter(l => l.state === 'verified').length
      const e = s.lines.filter(l => l.state === 'evidence').length
      const b = s.lines.filter(l => l.state === 'building').length
      const u = s.lines.filter(l => l.state === 'unrecorded').length
      const f = s.lines.filter(l => l.state === 'failing').length
      const pc = k => (k / s.lines.length * 100).toFixed(1)
      // A section whose every line is verified is finished, and should say so
      // in the same green the rest of the board now uses for completion.
      const full = v === s.lines.length
      return `<span class="nm${full ? ' full' : ''}">${esc(s.name)}</span><div class="meter"><span class="m-v" style="width:${pc(v)}%"></span><span class="m-e" style="width:${pc(e)}%"></span><span class="m-f" style="width:${pc(f)}%"></span><span class="m-u" style="width:${pc(u)}%"></span><span class="m-b" style="width:${pc(b)}%"></span></div><span class="n${v ? ' on' : ''}">${v}</span><span class="n${e ? ' on' : ''}">${e}</span><span class="n${f ? ' bad' : ''}">${f}</span><span class="n${b ? ' on' : ''}">${b}</span><span class="n">${s.lines.length}</span>`
    }).join('\n    ')}
    </div>
    ${nFailing ? `<div class="debt debt--bad">${Object.entries(failBySlice).sort((a, b) => b[0] - a[0])
      .map(([n, ls]) => `<div title="${esc(ls.map(l => `${l.id} · ${trunc(l.fail.why, 140)}`).join('\n'))}">${ls.length} line(s) ruled against in slice ${n === 'undefined' ? '?' : n}: ${esc(ls.map(l => l.id).join(' '))}</div>`).join('')}
    <div class="debtwhy">${esc(trunc((failingLines[0].fail.why || ''), 150))}</div>
    </div>` : ''}
    ${unrecorded.length ? `<div class="debt">${Object.entries(debtBySlice).sort((a, b) => b[0] - a[0])
      .map(([n, ls]) => `<div>${ls.length} line(s) built in slice ${n}, 0 recorded</div>`).join('')}
    <div class="debtwhy">Nothing reaches the verifier until it is in EVIDENCE.md.</div>
    </div>` : ''}
    ${inPlay.length ? `<div class="play">
    <div class="lbl">${esc(inPlayLabel)}</div>
    ${inPlay.map(l => `<div class="row" title="${esc(lineTitle(l))}"><span class="dotln ${dotCls[l.state]}"></span><span class="id">${esc(l.id)}</span><span class="tx">${esc(trunc(l.text, 150))}</span></div>`).join('\n    ')}
    </div>` : ''}`
    : '<p class="empty">The rubric arrives with the plan. Nothing is measured before it exists.</p>'}
  </div>

  <div class="panel act">
    <div class="lbl">Activity</div>
    ${resumeStale ? `<div class="stale" title="The rubric and the Stop gate read the same checkboxes; RESUME is prose somebody wrote once.">${esc(resumeStale)}</div>` : ''}
    ${resumeTop.length ? `<div class="kv">
    ${resumeTop.map(([k, v]) => `<span class="k">${esc(k.toLowerCase())}</span><span class="v">${esc(trunc(v, 170))}</span>`).join('\n    ')}
    </div>` : ''}
    ${evTail.length ? `<div class="lbl">Evidence, newest first</div>
    <div class="feed" style="flex:1">
    ${evTail.map(r => `<div class="row"><span class="t">${esc(r.t)}</span><span class="tag">${esc(r.id)}</span><span class="tx">${esc(r.txt)}</span></div>`).join('\n    ')}
    </div>` : '<p class="empty">No evidence recorded yet.</p>'}
  </div>

  <div class="panel cap">
    <div class="lbl">Latest captures${gallery.length > showable.length ? ` · ${showable.length} of ${gallery.length}, all in the popin` : ''}</div>
    ${showable.length ? `<div class="shots">
    ${showable.map((s, i) => `<figure data-i="${i}"><img src="${esc(s.copy)}" alt="${esc(s.p)}" loading="lazy">${s.vp ? `<span class="vpb">${esc(vpBadge(s))}</span>` : ''}<figcaption>${esc(s.p.split('/').pop())}</figcaption></figure>`).join('\n    ')}
    </div>` : '<p class="empty">Captures appear as the build starts producing screenshots.</p>'}
  </div>

  <div class="panel disp">
    <div class="phead"><span class="lbl"><span class="live ${liveCls}"></span>Dispatches · ${treeAgents.length} agent(s)${workflows.length ? ` · ${workflows.length} workflow(s)` : ''} · ${runEntries.length} stop(s) · last ${agoTxt}</span><div class="spark">${sparkBars}</div></div>
    ${treeAgents.length || workflows.length ? `<div class="troot">lead · the session${treeOmitted > 0 ? ` · ${treeOmitted} finished more than 30 min ago, hidden` : ''}</div>
    <div class="tree">
    ${treeHtml}
    </div>
    <div class="seats">
    ${seatChips}
    </div>` : '<p class="empty">Agent dispatches appear once the run starts delegating.</p>'}
  </div>
${screenMap.length || sitemap.length ? `
  <div class="panel scr">
    <div class="phead"><span class="lbl">Sitemap</span>${designIndex ? `<a class="dlink" href="${esc(designIndex)}" target="_blank" rel="noreferrer" title="Open the design in Claude Design">design &#8599;</a>` : ''}<span class="snb" style="width:auto">${screensSeen} of ${screenMap.length}</span></div>
    <div class="smap">
    ${sitemap.map(n => {
      const s = n.screen
      const st = s ? s.state : n.shots ? 'cap' : 'pln'
      const title = `${n.path}${s ? ` · ${s.name}` : n.real ? '' : ' · path segment, no page of its own'}`
        + `${s && s.slice ? ` · slice ${s.slice}` : ''} · ${n.shots} capture(s)\n`
        + COVER_LABEL.map((l, i) => `${n.cover[i] ? '▪' : '▫'} ${l}`).join('   ')
      return `<div class="srow s-${st}${n.real ? '' : ' s-stub'}" style="--d:${n.depth}" title="${esc(title)}">
      <span class="sdot"></span><span class="sn">${s ? String(s.n).padStart(2, '0') : ''}</span><span class="snm">${esc(n.depth ? n.seg : '/')}</span>${s ? `<span class="sal">${esc(trunc(s.name, 20))}</span>` : ''}${s && s.href ? `<a class="dlink" href="${esc(s.href)}" target="_blank" rel="noreferrer" title="${esc(s.name)} in Claude Design">&#8599;</a>` : ''}<span class="cov">${n.cover.map((on, i) => `<i class="${on ? 'on' : ''}" title="${COVER_LABEL[i]}"></i>`).join('')}</span><span class="snb">${n.shots || ''}</span>
    </div>`
    }).join('\n    ')}
    ${unrouted.length ? `<div class="sgrp">designed, not routed</div>
    ${unrouted.map(s => `<div class="srow s-${s.state}" style="--d:0" title="${esc(s.name)}${s.slice ? ` · slice ${s.slice}` : ''} · ${s.shots} capture(s) · no route on disk carries this screen's name
${COVER_LABEL.map((l, i) => `${s.cover[i] ? '▪' : '▫'} ${l}`).join('   ')}">
      <span class="sdot"></span><span class="sn">${String(s.n).padStart(2, '0')}</span><span class="snm">${esc(trunc(s.name, 18))}</span>${s.href ? `<a class="dlink" href="${esc(s.href)}" target="_blank" rel="noreferrer" title="${esc(s.name)} in Claude Design">&#8599;</a>` : ''}<span class="cov">${s.cover.map((on, i) => `<i class="${on ? 'on' : ''}" title="${COVER_LABEL[i]}"></i>`).join('')}</span><span class="snb">${s.shots || ''}</span>
    </div>`).join('\n    ')}` : ''}
    </div>
    <div class="sfoot">${routesInTree.length ? `${routesInTree.length} route(s) on disk, ${tied.size} carrying a designed screen` : 'No router convention recognised in this tree.'}${unclassified ? ` · ${unclassified} of ${captures.length} capture(s) prove no single screen` : ''}${evidenceGone ? `<br><span class="swarn">${evidenceGone} of ${evidenceNamed} capture(s) named in EVIDENCE.md are no longer on disk.</span>` : ''}</div>
  </div>` : ''}
</main>

<footer>
  <div class="mw"><div class="marq">${footerA}${footerA}</div></div>
  <div class="mw"><div class="marq" style="animation-duration:38s">${footerB}${footerB}</div></div>
</footer>

${allLines.length ? `<div class="rb">
  <div class="box">
    <div class="bh"><span class="ti">Rubric · ${nVerified} verified · ${nEvidence} evidence${nFailing ? ` · ${nFailing} failing` : ''}${nBuilding ? ` · ${nBuilding} in build` : ''}${unrecorded.length ? ` · ${unrecorded.length} unrecorded` : ''} · ${nOpen} open of ${allLines.length}</span><span class="lg"><span class="dotln ok"></span>verified<span class="dotln wait"></span>evidence${nFailing ? '<span class="dotln fail"></span>ruled against' : ''}<span class="dotln bld"></span>in build${unrecorded.length ? '<span class="dotln bad"></span>built, never recorded' : ''}<span class="dotln idle"></span>open</span>${linesBySlice.length ? `<span class="grp"><button data-g="slice" class="on">by slice</button><button data-g="sec">by section</button></span>` : ''}</div>
    ${linesBySlice.length ? `<div class="bb bb-slice">
    ${linesBySlice.map(g => {
      const pr = sliceProgress[g.n]
      return `<div class="sec"><span>slice ${g.n} · ${esc(g.title)}</span>${pr ? `<b class="${pr.done === pr.all ? 'full' : ''}">${pr.done}/${pr.all}</b>` : ''}</div>
    ${g.lines.map(l => `<div class="row" title="${esc(lineTitle(l))}"><span class="dotln ${dotCls[l.state]}"></span><span class="id">${esc(l.id)}</span><span class="tx">${esc(l.text)}</span>${l.fail ? `<span class="why">${esc(trunc(l.fail.why, 180))}</span>` : ''}</div>`).join('\n    ')}`
    }).join('\n    ')}
    ${unclaimedLines.length ? `<div class="sec"><span>closed by no slice</span><b>${unclaimedLines.length}</b></div>
    ${unclaimedLines.map(l => `<div class="row" title="${esc(lineTitle(l))}"><span class="dotln ${dotCls[l.state]}"></span><span class="id">${esc(l.id)}</span><span class="tx">${esc(l.text)}</span>${l.fail ? `<span class="why">${esc(trunc(l.fail.why, 180))}</span>` : ''}</div>`).join('\n    ')}` : ''}
    </div>` : ''}
    <div class="bb bb-sec">
    ${sections.filter(s => s.lines.length).map(s => `<div class="sec"><span>${esc(s.name)}</span></div>
    ${s.lines.map(l => `<div class="row" title="${esc(lineTitle(l))}"><span class="dotln ${dotCls[l.state]}"></span><span class="id">${esc(l.id)}</span><span class="tx">${esc(l.text)}</span>${l.fail ? `<span class="why">${esc(trunc(l.fail.why, 180))}</span>` : ''}</div>`).join('\n    ')}`).join('\n    ')}
    </div>
  </div>
</div>` : ''}
<div class="lb">
  <button class="nav prev" aria-label="previous capture">&#8249;</button>
  <figure><img alt=""><figcaption></figcaption></figure>
  <button class="nav next" aria-label="next capture">&#8250;</button>
</div>
<script>
var G=${galleryJson},gi=0
var lb=document.querySelector('.lb')
document.querySelectorAll('.marq').forEach(function(m){
  if(m.scrollWidth/2<=m.parentElement.clientWidth)m.classList.add('still')
})
// vf narrows the walk to one viewport, so a reviewer can step through every
// mobile capture without the desktop ones in between. m, d, a to switch.
var vf=''
function pool(){return vf?G.filter(function(x){return x.v===vf}):G}
function show(i){
  if(!G.length)return
  gi=((i%G.length)+G.length)%G.length
  var P=pool(),at=P.indexOf(G[gi])
  lb.querySelector('img').src=G[gi].s
  lb.querySelector('figcaption').textContent=(at<0?gi+1:at+1)+' / '+(at<0?G.length:P.length)
    +(vf?' · '+(vf==='m'?'mobile':'desktop')+' only':'')
    +(G[gi].b?' · '+G[gi].b:'')+' · '+G[gi].c
  lb.classList.add('open')
}
function step(d){
  var P=pool()
  if(!P.length){show(gi+d);return}
  var at=P.indexOf(G[gi])
  show(G.indexOf(at<0?P[d>0?0:P.length-1]:P[(at+d+P.length)%P.length]))
}
var rb=document.querySelector('.rb')
setInterval(function(){if(!document.querySelector('.lb.open,.rb.open'))location.reload()},15000)
document.addEventListener('click',function(e){
  if(rb&&e.target.closest('.btn-all')){rb.classList.add('open');return}
  if(rb&&rb.classList.contains('open')){
    var g=e.target.closest('.rb .grp button')
    if(g){rb.classList.toggle('by-sec',g.dataset.g==='sec')
      rb.querySelectorAll('.grp button').forEach(function(b){b.classList.toggle('on',b===g)})
      return}
    if(!e.target.closest('.rb .box'))rb.classList.remove('open')
    return}
  var f=e.target.closest('.shots figure')
  if(f){show(+f.dataset.i);return}
  if(e.target.closest('.lb .prev')){step(-1);return}
  if(e.target.closest('.lb .next')){step(1);return}
  if(e.target.closest('.lb figure'))return
  lb.classList.remove('open')
})
document.addEventListener('keydown',function(e){
  if(rb&&rb.classList.contains('open')){
    if(e.key==='Escape')rb.classList.remove('open')
    return}
  if(!lb.classList.contains('open'))return
  if(e.key==='Escape')lb.classList.remove('open')
  else if(e.key==='ArrowLeft')step(-1)
  else if(e.key==='ArrowRight')step(1)
  else if(e.key==='m'||e.key==='d'){vf=vf===e.key?'':e.key;show(gi)}
  else if(e.key==='a'){vf='';show(gi)}
})
</script>
</body></html>
`

writeFileSync('.forge/PROGRESS.html', html)
