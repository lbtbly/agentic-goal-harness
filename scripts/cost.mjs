#!/usr/bin/env node
// Per-seat cost, read straight out of the transcripts Claude Code already writes.
//
// Do not stand up OpenTelemetry for this. Every forge seat is user-defined, and
// claude_code.cost.usage collapses all of them into agent.name="custom", so a
// dashboard shows one undifferentiated bucket. The per-dispatch files carry the
// real thing: agent-*.jsonl holds message.usage per round-trip, and the sibling
// .meta.json holds agentType. That makes this retroactive to every run already
// on disk rather than something you have to remember to switch on first.
//
//   node scripts/cost.mjs                  the project in the working directory
//   node scripts/cost.mjs --all            every project
//   node scripts/cost.mjs --project vitrine
//   node scripts/cost.mjs --json
//   node scripts/cost.mjs --models         models per seat against the frontmatter,
//                                          exit 1 when a seat ran off its pin
//
// The dollars are list-price reconstructions from recorded token counts. On a
// subscription they are not what you were billed; they are what the same tokens
// would cost through the API, which is the number that makes two runs
// comparable.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'

// Per MTok, 3 October 2026 list rates. Cache read is 0.1x input. Cache write is
// 1.25x for the 5-minute TTL and 2x for the 1-hour TTL. usage.cache_creation
// carries that split; only a record without it falls back to 1.25x on the flat
// cache_creation_input_tokens.
const RATES = {
  'claude-opus-5-5':    { in: 4,    out: 20 },
  'claude-sonnet-5-5':  { in: 2,    out: 10 },
  'claude-fable-5-1':   { in: 10,   out: 50 },
  'claude-opus-5':      { in: 5,    out: 25 },
  'claude-sonnet-5':    { in: 3,    out: 15 },
  'claude-fable-5':     { in: 5,    out: 25 },
  'claude-opus-4-8':    { in: 5,    out: 25 },
  'claude-haiku-4-5':   { in: 1,    out: 5  },
  _default:             { in: 3,    out: 15 },
}

// Longest key first. Matching is by prefix, and claude-opus-5 is a prefix of
// claude-opus-5-5: checked in insertion order, a 5.5 trip bills at 5 rates.
const KEYS = Object.keys(RATES).filter(k => k !== '_default').sort((a, b) => b.length - a.length)
const familyOf = (model = '') => KEYS.find(k => model.startsWith(k)) || null
const rateFor = model => RATES[familyOf(model)] || RATES._default
const canon = (model = '') => familyOf(model) || model.replace(/\[[^\]]*\]$/, '')
const isFable = model => (familyOf(model) || '').startsWith('claude-fable')

// Frontmatter aliases resolve to the current model of each family. inherit, or
// no model line at all, means the seat runs on whatever the session runs on.
const ALIAS = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  fable: 'claude-fable-5-1',
  haiku: 'claude-haiku-4-5',
}

const args = process.argv.slice(2)
const flag = n => args.includes(n)
const val = n => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1] }

const ROOT = join(homedir(), '.claude', 'projects')
if (!existsSync(ROOT)) { console.error(`no transcripts at ${ROOT}`); process.exit(0) }

// Claude Code slugs a project path by replacing every non-alphanumeric run with
// a dash, so the working directory maps to a directory name without a lookup.
const slugOf = p => p.replace(/[^a-zA-Z0-9]/g, '-')

let projects = readdirSync(ROOT).filter(d => statSync(join(ROOT, d)).isDirectory())
if (!flag('--all')) {
  const want = val('--project')
  projects = want
    ? projects.filter(p => p.includes(want))
    : projects.filter(p => p === slugOf(process.cwd()))
}
if (!projects.length) { console.error('no matching project transcripts'); process.exit(0) }

const seats = new Map()
const dispatches = []
const fable = { cost: 0, trips: 0 }

function seatOf (seat) {
  let s = seats.get(seat)
  if (!s) {
    s = { seat, dispatches: 0, trips: 0, in: 0, out: 0, cw: 0, cw5m: 0, cw1h: 0, cr: 0, cost: 0, peak: 0,
      usd: { in: 0, cw: 0, cr: 0, out: 0 }, models: {} }
    seats.set(seat, s)
  }
  return s
}

// One API call, priced at its own model. A call that fell back to another model
// lists each attempt in usage.iterations and the top level repeats only the
// last, so a multi-attempt call is priced attempt by attempt.
function add (seat, u, model) {
  const s = seatOf(seat)
  const parts = Array.isArray(u.iterations) && u.iterations.length > 1 ? u.iterations : [u]
  let cost = 0, touchedFable = false
  for (const p of parts) {
    const m = (parts.length > 1 && p.model) || model
    const r = rateFor(m)
    const cc = p.cache_creation
    const split = cc && (cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null)
    const inTok  = p.input_tokens || 0
    const outTok = p.output_tokens || 0
    const crTok  = p.cache_read_input_tokens || 0
    const w1h    = split ? cc.ephemeral_1h_input_tokens || 0 : 0
    const w5m    = split ? cc.ephemeral_5m_input_tokens || 0 : p.cache_creation_input_tokens || 0
    const usd = {
      in: inTok * r.in / 1e6,
      cw: (w5m * 1.25 + w1h * 2) * r.in / 1e6,
      cr: crTok * r.in * 0.1 / 1e6,
      out: outTok * r.out / 1e6,
    }
    const c = usd.in + usd.cw + usd.cr + usd.out
    s.in += inTok; s.out += outTok; s.cr += crTok; s.cw5m += w5m; s.cw1h += w1h; s.cw += w5m + w1h
    for (const k in usd) s.usd[k] += usd[k]
    if (isFable(m)) { fable.cost += c; touchedFable = true }
    cost += c
  }
  if (touchedFable) fable.trips++
  s.trips++; s.cost += cost
  s.models[model] = (s.models[model] || 0) + 1
  const ctx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)
  return { cost, ctx }
}

// Layout is <project>/<session-id>/subagents/agent-*.jsonl, with the lead's own
// turns in <project>/<session-id>.jsonl beside it. The lead is counted because
// it is the largest single cost centre in every measured run and the only seat
// with no model pin, no effort and no turn cap; a report that omits it optimises
// seven seats and misses the eighth.
//
// Claude Code writes one line per content block and every line repeats the
// call's usage, the early ones with output still streaming. A call is one
// message.id, kept at its fullest line. Counting lines instead nearly doubled
// the vitrine run: 2,274 lead lines for 1,229 calls.
function tally (file, seat) {
  let text; try { text = readFileSync(file, 'utf8') } catch { return null }
  const calls = new Map()
  let model = '', cwd = ''
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let rec; try { rec = JSON.parse(line) } catch { continue }
    if (!cwd && rec.cwd) cwd = rec.cwd
    const u = rec?.message?.usage
    if (!u || rec.message.model === '<synthetic>') continue
    model = rec.message.model || model
    const id = rec.message.id || rec.requestId || rec.uuid || calls.size
    const prev = calls.get(id)
    if (!prev || (u.output_tokens || 0) >= (prev.u.output_tokens || 0)) calls.set(id, { u, model })
  }
  let cost = 0, trips = 0, peak = 0
  const models = {}
  for (const { u, model: m } of calls.values()) {
    const r = add(seat, u, m)
    cost += r.cost; trips++; peak = Math.max(peak, r.ctx)
    models[m] = (models[m] || 0) + 1
  }
  // A worktree seat records the worktree as its cwd; the agents it was
  // declared in live at the project root above it.
  cwd = cwd.replace(/\/\.claude\/worktrees\/.*$/, '')
  return trips ? { cost, trips, peak, models, cwd } : null
}

// Dispatched seats sit directly in subagents/. A dynamic workflow writes its
// agents one level deeper, in subagents/workflows/<wf>/, beside a journal.jsonl
// that carries no usage. Reading only the top level hid every workflow agent.
function agentFiles (dir, wf = null, out = []) {
  let names; try { names = readdirSync(dir) } catch { return out }
  for (const f of names) {
    const p = join(dir, f)
    let isDir = false
    try { isDir = statSync(p).isDirectory() } catch { continue }
    if (isDir) agentFiles(p, wf || (basename(dir) === 'workflows' ? f : null), out)
    else if (f.startsWith('agent-') && f.endsWith('.jsonl')) out.push({ file: p, wf })
  }
  return out
}

function record (seat, id, file, project, session, extra) {
  const t = tally(file, seat)
  if (!t) return
  const s = seatOf(seat); s.dispatches++; s.peak = Math.max(s.peak, t.peak)
  dispatches.push({ seat, id, ...t, project, session, ...extra })
}

for (const proj of projects) {
  const pdir = join(ROOT, proj)
  let sessions = []
  try { sessions = readdirSync(pdir) } catch { continue }

  for (const entry of sessions) {
    const sdir = join(pdir, entry)
    let isDir = false
    try { isDir = statSync(sdir).isDirectory() } catch { continue }

    if (isDir) {
      for (const { file, wf } of agentFiles(join(sdir, 'subagents'))) {
        let meta = {}
        const mf = file.replace(/\.jsonl$/, '.meta.json')
        if (existsSync(mf)) { try { meta = JSON.parse(readFileSync(mf, 'utf8')) } catch {} }
        const seat = meta.agentType || (wf ? 'workflow' : 'unknown')
        record(seat, basename(file, '.jsonl'), file, proj, entry, { workflow: wf, override: meta.model || null })
      }
    } else if (entry.endsWith('.jsonl')) {
      const id = basename(entry, '.jsonl')
      record('LEAD', id, sdir, proj, id, { workflow: null, override: null })
    }
  }
}

if (!dispatches.length) { console.error('no dispatch records found'); process.exit(0) }

// The frontmatter says which model a seat should run on; message.model says
// which one it did. A seat pinned to sonnet that ran opus is a cost the rubric
// never sees. The usual cause is a model override at dispatch, so the meta's
// override rides along on the mismatch line.
const declared = new Map()
function declaredFor (cwd, seat) {
  if (!cwd || seat === 'LEAD') return null
  const f = join(cwd, '.claude', 'agents', `${seat}.md`)
  if (declared.has(f)) return declared.get(f)
  let d = null
  if (existsSync(f)) {
    try {
      const fm = readFileSync(f, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)
      const m = fm && fm[1].match(/^model:\s*['"]?([^'"\s#]+)/m)
      const raw = m ? m[1] : null
      const want = !raw || raw === 'inherit' ? 'session' : canon(ALIAS[raw.toLowerCase()] || raw)
      const label = want === 'session' ? (raw ? 'inherit (session)' : 'session')
        : raw === want ? want : `${raw} (${want})`
      d = { raw, want, label }
    } catch {}
  }
  declared.set(f, d)
  return d
}

const leadModels = new Map()
for (const d of dispatches) {
  if (d.seat === 'LEAD') leadModels.set(`${d.project}/${d.session}`, new Set(Object.keys(d.models).map(canon)))
}

const modelMap = new Map()
for (const d of dispatches) {
  const key = `${d.project}\0${d.seat}`
  let row = modelMap.get(key)
  if (!row) {
    row = { project: d.project, seat: d.seat, declared: new Set(), models: {}, trips: 0, off: 0, offModels: {}, expected: new Set(), overrides: {}, unjudged: 0 }
    modelMap.set(key, row)
  }
  const dec = declaredFor(d.cwd, d.seat)
  row.declared.add(d.seat === 'LEAD' ? 'session' : dec ? dec.label : 'no agent file')
  let expect = null
  if (dec) expect = dec.want === 'session' ? leadModels.get(`${d.project}/${d.session}`) || null : new Set([dec.want])
  if (expect) for (const m of expect) row.expected.add(m)
  let off = 0
  for (const [m, n] of Object.entries(d.models)) {
    row.models[m] = (row.models[m] || 0) + n
    row.trips += n
    if (dec && !expect) row.unjudged += n
    else if (expect && !expect.has(canon(m))) { off += n; row.offModels[m] = (row.offModels[m] || 0) + n }
  }
  row.off += off
  if (off && d.override) row.overrides[d.override] = (row.overrides[d.override] || 0) + 1
}
const modelRows = [...modelMap.values()]
  .sort((a, b) => a.project.localeCompare(b.project) || b.trips - a.trips)
  .map(r => ({ ...r, declared: [...r.declared], expected: [...r.expected] }))
const mismatches = modelRows.filter(r => r.off > 0)

const total = dispatches.reduce((n, d) => n + d.cost, 0)
const rows = [...seats.values()].sort((a, b) => b.cost - a.cost)
const sum = k => rows.reduce((n, r) => n + r[k], 0)
const grand = { in: sum('in'), out: sum('out'), cw5m: sum('cw5m'), cw1h: sum('cw1h'), cr: sum('cr') }
const usd = k => rows.reduce((n, r) => n + r.usd[k], 0)
const wfAgents = dispatches.filter(d => d.workflow)
const workflow = {
  agents: wfAgents.length,
  workflows: new Set(wfAgents.map(d => `${d.project}/${d.session}/${d.workflow}`)).size,
  cost: wfAgents.reduce((n, d) => n + d.cost, 0),
}
const hasLead = seats.has('LEAD')

const money = n => '$' + n.toFixed(2)
const num = n => n.toLocaleString('en-US')
const pct = n => (n * 100).toFixed(1) + '%'

// Columns size to the longest entry: a plugin seat such as
// impeccable:impeccable-finish-reviewer is twice the width of a forge seat.
const widest = (list, floor) => Math.max(floor, ...list.map(s => s.length + 2))

// Exit through exitCode, never process.exit: a piped stdout drains after the
// last line runs, and exiting early cut --json off at 64 KB.
if (flag('--json')) {
  console.log(JSON.stringify({ projects, total, fable, workflow, seats: rows, models: modelRows, mismatches, dispatches }, null, 2))
  if (flag('--models') && mismatches.length) process.exitCode = 1
} else {
  console.log(`\nprojects: ${projects.join(', ')}`)
  if (flag('--models')) printModels()
  else printReport()
}

function printModels () {
  const ws = widest(modelRows.map(r => r.seat), 19)
  const wd = widest(modelRows.map(r => r.declared.join(', ')), 31)
  const wm = widest(modelRows.flatMap(r => Object.keys(r.models)), 19)
  console.log('\n  ' + 'seat'.padEnd(ws) + 'declared'.padEnd(wd) + 'model'.padEnd(wm) + 'trips'.padStart(10))
  console.log('  ' + '-'.repeat(ws + wd + wm + 10))
  let last = null
  for (const r of modelRows) {
    if (projects.length > 1 && r.project !== last) { console.log(`  ${r.project}`); last = r.project }
    const used = Object.entries(r.models).sort((a, b) => b[1] - a[1])
    used.forEach(([m, n], i) => {
      console.log(
        '  ' + (i ? '' : r.seat).padEnd(ws) +
        (i ? '' : r.declared.join(', ')).padEnd(wd) +
        m.padEnd(wm) +
        num(n).padStart(10) +
        (r.offModels[m] ? '  off' : '')
      )
    })
  }
  console.log('')
  for (const r of mismatches) {
    const where = projects.length > 1 ? ` in ${r.project}` : ''
    const ran = Object.entries(r.offModels).map(([m, n]) => `${m} x${num(n)}`).join(', ')
    const ov = Object.entries(r.overrides).map(([m, n]) => `${m} on ${n}`).join(', ')
    console.log(
      `  MISMATCH ${r.seat}${where}: ${num(r.off)} of ${num(r.trips)} trips off ${r.expected.join(' or ')}` +
      ` (${ran})` + (ov ? `; dispatch override ${ov}` : '')
    )
  }
  console.log(mismatches.length
    ? `\n  ${mismatches.length} seat${mismatches.length > 1 ? 's' : ''} ran off the declared model.\n`
    : '  every judged seat ran on its declared model.\n')
  process.exitCode = mismatches.length ? 1 : 0
}

function printReport () {
  console.log(`dispatches: ${dispatches.length}   ${hasLead ? 'total' : 'subagent'} spend: ${money(total)}`)
  console.log(`fable spend: ${money(fable.cost)} across ${num(fable.trips)} trips`)
  console.log(`workflow agents: ${workflow.agents} in ${workflow.workflows} workflows, ${money(workflow.cost)}\n`)

  const ws = widest(rows.map(r => r.seat), 17)
  console.log(
    '  ' + 'seat'.padEnd(ws) + 'disp'.padStart(4) + 'trips'.padStart(8) + 'cost'.padStart(12) +
    'share'.padStart(8) + 'median trips'.padStart(15) + 'peak ctx'.padStart(11)
  )
  console.log('  ' + '-'.repeat(ws + 58))
  for (const r of rows) {
    const mine = dispatches.filter(d => d.seat === r.seat).map(d => d.trips).sort((a, b) => a - b)
    const med = mine[Math.floor(mine.length / 2)] || 0
    console.log(
      '  ' + r.seat.padEnd(ws) +
      String(r.dispatches).padStart(4) +
      String(r.trips).padStart(8) +
      money(r.cost).padStart(12) +
      pct(r.cost / total).padStart(8) +
      String(med).padStart(15) +
      num(r.peak).padStart(11)
    )
  }

  // The composition line is the one that decides what to optimise. Cache reads
  // dominating means the lever is context length inside a dispatch, not seat
  // count and not prose length. Each record is priced at its own model, so a run
  // that mixes opus and haiku does not read as all one rate.
  const cAll = usd('in') + usd('cw') + usd('cr') + usd('out') || 1
  const cw = grand.cw5m + grand.cw1h || 1
  console.log('\n  composition')
  console.log(`    cache read     ${pct(usd('cr') / cAll).padStart(7)}   ${num(grand.cr).padStart(15)} tok`)
  console.log(`    cache write    ${pct(usd('cw') / cAll).padStart(7)}   ${num(grand.cw5m + grand.cw1h).padStart(15)} tok   ${pct(grand.cw1h / cw)} at 1h`)
  console.log(`    output         ${pct(usd('out') / cAll).padStart(7)}   ${num(grand.out).padStart(15)} tok`)
  console.log(`    fresh input    ${pct(usd('in') / cAll).padStart(7)}   ${num(grand.in).padStart(15)} tok`)

  // Concentration, because the expensive dispatches are the lever and the median
  // dispatch is not. Run two's top fifth carried 44.4 per cent of subagent spend.
  const sorted = [...dispatches].sort((a, b) => b.cost - a.cost)
  const share = f => sorted.slice(0, Math.max(1, Math.ceil(sorted.length * f)))
    .reduce((n, d) => n + d.cost, 0) / total
  console.log('\n  concentration')
  console.log(`    top 5%   ${pct(share(0.05)).padStart(7)}`)
  console.log(`    top 20%  ${pct(share(0.20)).padStart(7)}`)
  console.log(`    top 50%  ${pct(share(0.50)).padStart(7)}`)

  console.log('\n  most expensive dispatches')
  for (const d of sorted.slice(0, 5)) {
    console.log(`    ${money(d.cost).padStart(9)}  ${String(d.trips).padStart(4)} trips  ${num(d.peak).padStart(9)} peak  ${d.seat}${d.workflow ? ' (workflow)' : ''}`)
  }

  const perTrip = total / dispatches.reduce((n, d) => n + d.trips, 0)
  console.log(`\n  median cost per round-trip: ${money(perTrip)}`)
  console.log('  dollars are list-price reconstructions from recorded tokens, not amounts billed.\n')
}
