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
//
// The dollars are list-price reconstructions from recorded token counts. On a
// subscription they are not what you were billed; they are what the same tokens
// would cost through the API, which is the number that makes two runs
// comparable.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'

// Per MTok, 9 September 2026 list rates. Cache write is the 5-minute multiplier
// at 1.25x base; a 1h write is 2x and is not distinguishable in the transcript,
// so a run using the 1h TTL reads slightly cheap here. Cache read is 0.1x.
const RATES = {
  'claude-opus-5':      { in: 5,    out: 25 },
  'claude-sonnet-5':    { in: 3,    out: 15 },
  'claude-fable-5':     { in: 5,    out: 25 },
  'claude-haiku-4-5':   { in: 1,    out: 5  },
  _default:             { in: 3,    out: 15 },
}

function rateFor (model = '') {
  const key = Object.keys(RATES).find(k => k !== '_default' && model.startsWith(k))
  return RATES[key] || RATES._default
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

function add (seat, u, model) {
  const r = rateFor(model)
  const inTok    = u.input_tokens || 0
  const outTok   = u.output_tokens || 0
  const cwTok    = u.cache_creation_input_tokens || 0
  const crTok    = u.cache_read_input_tokens || 0
  const cost = (inTok * r.in + cwTok * r.in * 1.25 + crTok * r.in * 0.1 + outTok * r.out) / 1e6
  const s = seats.get(seat) || { seat, dispatches: 0, trips: 0, in: 0, out: 0, cw: 0, cr: 0, cost: 0, peak: 0 }
  s.trips++; s.in += inTok; s.out += outTok; s.cw += cwTok; s.cr += crTok; s.cost += cost
  seats.set(seat, s)
  return { cost, ctx: inTok + cwTok + crTok }
}

// Layout is <project>/<session-id>/subagents/agent-*.jsonl, with the lead's own
// turns in <project>/<session-id>.jsonl beside it. The lead is counted because
// it is the largest single cost centre in every measured run and the only seat
// with no model pin, no effort and no turn cap; a report that omits it optimises
// seven seats and misses the eighth.
function tally (file, seat) {
  let cost = 0, trips = 0, peak = 0, model = ''
  let text; try { text = readFileSync(file, 'utf8') } catch { return null }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let rec; try { rec = JSON.parse(line) } catch { continue }
    const u = rec?.message?.usage
    if (!u) continue
    model = rec.message.model || model
    const r = add(seat, u, model)
    cost += r.cost; trips++; peak = Math.max(peak, r.ctx)
  }
  return trips ? { cost, trips, peak } : null
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
      const sub = join(sdir, 'subagents')
      if (!existsSync(sub)) continue
      for (const f of readdirSync(sub)) {
        if (!f.endsWith('.jsonl')) continue
        const id = basename(f, '.jsonl')
        let seat = 'unknown'
        const meta = join(sub, `${id}.meta.json`)
        if (existsSync(meta)) {
          try { seat = JSON.parse(readFileSync(meta, 'utf8')).agentType || 'unknown' } catch {}
        }
        const t = tally(join(sub, f), seat)
        if (!t) continue
        const s = seats.get(seat); s.dispatches++; s.peak = Math.max(s.peak, t.peak)
        dispatches.push({ seat, id, ...t, project: proj })
      }
    } else if (entry.endsWith('.jsonl')) {
      const t = tally(sdir, 'LEAD')
      if (!t) continue
      const s = seats.get('LEAD'); s.dispatches++; s.peak = Math.max(s.peak, t.peak)
      dispatches.push({ seat: 'LEAD', id: basename(entry, '.jsonl'), ...t, project: proj })
    }
  }
}

if (!dispatches.length) { console.error('no dispatch records found'); process.exit(0) }

const total = dispatches.reduce((n, d) => n + d.cost, 0)
const rows = [...seats.values()].sort((a, b) => b.cost - a.cost)
const sum = k => rows.reduce((n, r) => n + r[k], 0)
const grand = { in: sum('in'), out: sum('out'), cw: sum('cw'), cr: sum('cr') }
const tokCost = (n, mult, kind) => n * (RATES._default[kind] * mult) / 1e6

if (flag('--json')) {
  console.log(JSON.stringify({ projects, total, seats: rows, dispatches }, null, 2))
  process.exit(0)
}

const money = n => '$' + n.toFixed(2)
const num = n => n.toLocaleString('en-US')
const pct = n => (n * 100).toFixed(1) + '%'

console.log(`\nprojects: ${projects.join(', ')}`)
console.log(`dispatches: ${dispatches.length}   subagent spend: ${money(total)}\n`)

console.log('  seat            disp   trips        cost   share    median trips   peak ctx')
console.log('  ' + '-'.repeat(76))
for (const r of rows) {
  const mine = dispatches.filter(d => d.seat === r.seat).map(d => d.trips).sort((a, b) => a - b)
  const med = mine[Math.floor(mine.length / 2)] || 0
  console.log(
    '  ' + r.seat.padEnd(15) +
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
// count and not prose length.
const cIn = tokCost(grand.in, 1, 'in')
const cCw = tokCost(grand.cw, 1.25, 'in')
const cCr = tokCost(grand.cr, 0.1, 'in')
const cOut = tokCost(grand.out, 1, 'out')
const cAll = cIn + cCw + cCr + cOut || 1
console.log('\n  composition')
console.log(`    cache read   ${pct(cCr / cAll).padStart(7)}   ${num(grand.cr).padStart(15)} tok`)
console.log(`    cache write  ${pct(cCw / cAll).padStart(7)}   ${num(grand.cw).padStart(15)} tok`)
console.log(`    output       ${pct(cOut / cAll).padStart(7)}   ${num(grand.out).padStart(15)} tok`)
console.log(`    fresh input  ${pct(cIn / cAll).padStart(7)}   ${num(grand.in).padStart(15)} tok`)

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
  console.log(`    ${money(d.cost).padStart(9)}  ${String(d.trips).padStart(4)} trips  ${num(d.peak).padStart(9)} peak  ${d.seat}`)
}

const perTrip = total / dispatches.reduce((n, d) => n + d.trips, 0)
console.log(`\n  median cost per round-trip: ${money(perTrip)}`)
console.log('  dollars are list-price reconstructions from recorded tokens, not amounts billed.\n')
