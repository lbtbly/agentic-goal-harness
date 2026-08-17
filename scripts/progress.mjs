#!/usr/bin/env node
// Renders .forge/PROGRESS.html from the state files. Called by runlog.sh,
// checkpoint.sh, and evidence.sh; safe to run by hand. No-ops without .forge/.
// Wallboard layout in the Dark Bench style (styles-library): matte graphite,
// dotted canvas, one rationed green. Fills one screen, no scroll.
// The state files stay the source of truth; this file only draws them.
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, openSync, readSync, closeSync, mkdirSync, copyFileSync, utimesSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

if (!existsSync('.forge')) process.exit(0)

const read = f => { try { return readFileSync(f, 'utf8') } catch { return '' } }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const trunc = (s, n) => s.length > n ? s.slice(0, n - 3) + '...' : s

const brief = read('.forge/BRIEF.md')
const dod = read('.forge/DOD.md')
const plan = read('.forge/PLAN.md')
const resume = read('.forge/RESUME.md')
const runlog = read('.forge/RUNLOG.md')
const evidence = read('.forge/EVIDENCE.md')
const greenlight = read('.forge/GREENLIGHT.md')
const armed = existsSync('.forge/ARMED')
const shipped = existsSync('.forge/REPORT.md')

const goal = (brief.match(/^Goal:\s*(.+)$/m) || [, ''])[1]

// Evidence: ids that carry at least one recorded line.
const evidenced = new Set()
for (const line of evidence.split('\n')) {
  const m = line.match(/^\S+ \| ([A-Za-z]*\d+[A-Za-z0-9]*) \|/)
  if (m) evidenced.add(m[1])
}
const evidenceLines = evidence.trim() ? evidence.trim().split('\n') : []

// Rubric: sections from ## headings, three states per line.
const sections = []
const byId = {}
let cur = null
for (const line of dod.split('\n')) {
  const h = line.match(/^##\s+(.+)/)
  if (h) { cur = { name: h[1].trim(), lines: [] }; sections.push(cur); continue }
  const c = line.match(/^- \[([ x])\]\s+(?:[*_`]*([A-Za-z]+\d+)[*_`]*\s+)?(.*)/)
  if (c && cur) {
    const id = c[2] || ''
    const l = {
      id, text: c[3].replace(/[*_`]/g, ''),
      state: c[1] === 'x' ? 'verified' : (id && evidenced.has(id) ? 'evidence' : 'open'),
    }
    cur.lines.push(l)
    if (id) byId[id] = l
  }
}
const allLines = sections.flatMap(s => s.lines)
const nVerified = allLines.filter(l => l.state === 'verified').length
const nEvidence = allLines.filter(l => l.state === 'evidence').length

// Slices from PLAN.md, cursor from RESUME.md, per-slice rubric ids from the
// "Closes ..." clause the architect writes in each slice.
const sliceTitles = [...plan.matchAll(/^#{0,3}\s*Slice (\d+)[:.]\s*([^\n]*)/gim)].map(m => ({ n: +m[1], title: m[2].trim() }))
const curSlice = +((resume.match(/Current slice:[^\n]*?(\d+)/i) || [, 0])[1])
const sliceIds = {}
const sliceBlocks = plan.split(/^#{0,3}\s*Slice /gim).slice(1)
for (const b of sliceBlocks) {
  const n = +(b.match(/^(\d+)/) || [, 0])[1]
  const closes = b.match(/Closes[:\s]+([A-Z0-9 ,]+)/i)
  if (n && closes) sliceIds[n] = closes[1].match(/[A-Z]+\d+/g) || []
}
const resumeTop = resume.split('\n').filter(l => /^(Last phase|Current slice|Next action)/i.test(l))
  .map(l => { const m = l.match(/^([^:]+):\s*(.*)$/); return m ? [m[1], m[2]] : ['', l] })

// In play: the current slice's not-yet-verified lines, else newest evidenced.
let inPlay = (sliceIds[curSlice] || []).map(id => byId[id]).filter(l => l && l.state !== 'verified')
let inPlayLabel = inPlay.length ? `In play · slice ${curSlice}` : 'Recently proven'
if (!inPlay.length) {
  inPlay = [...evidenced].reverse().map(id => byId[id]).filter(Boolean).slice(0, 8)
}
inPlay = inPlay.sort((a, b) => (a.state === 'open' ? 0 : 1) - (b.state === 'open' ? 0 : 1)).slice(0, 8)

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

// Latest captures.
const shots = []
const walk = (d, depth) => { try {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    const st = statSync(p)
    if (st.isDirectory()) { if (depth > 0) walk(p, depth - 1) }
    else if (/\.(png|jpe?g|webp)$/i.test(f)) shots.push(p)
  }
} catch {} }
walk('tests/screenshots', 1); walk('launch/screenshots', 1); walk('test-results', 3)
for (const m of evidence.matchAll(/[\w./-]+\.(?:png|jpe?g|webp)/gi)) if (existsSync(m[0])) shots.push(m[0])
const latest = [...new Set(shots)]
  .map(p => { try { return { p, t: statSync(p).mtimeMs } } catch { return null } })
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
  for (const f of readdirSync('.forge/shots')) if (!keep.has(f)) { try { unlinkSync(join('.forge/shots', f)) } catch {} }
} catch {}
const gallery = latest.filter(s => s.copy)
const showable = gallery.slice(0, 6)
const galleryJson = JSON.stringify(gallery.map(s => ({ s: s.copy, c: s.p }))).replace(/</g, '\\u003c')

const stackLine = (plan.match(/^\*{0,2}Stack[:*]*\s*(.+)$/mi) || greenlight.match(/^Stack:\s*(.+)$/mi) || [, ''])[1]

// Run duration: first RUNLOG timestamp to now, frozen at REPORT.md when shipped.
const firstTs = (runlog.match(/^(\d{4}-\d{2}-\d{2}T[\d:]+Z)/m) || evidence.match(/^(\d{4}-\d{2}-\d{2}T[\d:]+Z)/m) || [])[1]
let durationTxt = ''
if (firstTs) {
  const start = Date.parse(firstTs)
  const frozen = shipped && allLines.length > 0 && !dod.includes('- [ ]')
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
try {
  const files = []
  for (const f of readdirSync(projDir)) {
    if (f.endsWith('.jsonl')) files.push({ p: join(projDir, f), k: f })
    else {
      const sub = join(projDir, f, 'subagents')
      try { for (const g of readdirSync(sub)) if (g.endsWith('.jsonl')) files.push({ p: join(sub, g), k: `${f}/${g}` }) } catch {}
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
            const u = JSON.parse(line)?.message?.usage
            if (u) c.tok += (u.input_tokens || 0) + (u.output_tokens || 0) +
              (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)
          } catch {}
        }
        c.off += lastNl + 1
      }
      cache[f] = c
    }
  }
  writeFileSync(cachePath, JSON.stringify(cache))
  const total = Object.values(cache).reduce((a, c) => a + (c.tok || 0), 0)
  if (total > 0) tokensTxt = total >= 1e6 ? `${(total / 1e6).toFixed(1)}M` : `${Math.round(total / 1e3)}k`
} catch {}

const dotCls = { verified: 'ok', evidence: 'wait', open: 'idle' }
const evTail = evidenceLines.slice(-7).reverse().map(l => {
  const m = l.match(/^(\S+) \| (\S+) \| (.*)$/)
  return m ? { t: m[1].slice(11, 16), id: m[2], txt: m[3] } : { t: '', id: '', txt: l }
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
      treeAgents.push({ id, dir: sub, type: m.agentType || 'agent', desc: m.description || '', depth: m.spawnDepth || 1, tu: m.toolUseId, st, en, live, parent: null })
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
const fmtDur = ms => { if (!ms || ms < 0) return ''; const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` }
const kids = id => treeAgents.filter(a => a.parent === id)
const renderNode = a =>
  `<div class="tnode"><span class="tdot${a.live ? ' on' : ''}"></span><span class="tag">${esc(a.type)}</span><span class="tds">${esc(trunc(a.desc, 64))}</span><span class="tdu">${a.live ? 'running' : fmtDur((a.en || 0) - (a.st || a.en || 0))}</span></div>`
  + kids(a.id).map(k => `<div class="tkid">${renderNode(k)}</div>`).join('')
const roots = treeAgents.filter(a => !a.parent)
const TREE_MAX = 12
const shownRoots = roots.slice(-TREE_MAX)
const treeOmitted = roots.length - shownRoots.length
const treeHtml = shownRoots.map(renderNode).join('\n    ')

// Dispatch pulse: liveness, rhythm, and who did the work. RUNLOG records
// stops, so "last activity" is the time since any agent last finished.
const runEntries = runlog.trim() ? runlog.trim().split('\n').map(l => {
  const m = l.match(/^(\S+) \| (\S+) \|/)
  return m ? { t: Date.parse(m[1]), a: m[2] } : null
}).filter(e => e && !isNaN(e.t)) : []
const SEATS = ['router', 'scout', 'designer', 'architect', 'builder', 'verifier', 'finisher']
const typeCounts = {}
for (const a of treeAgents) typeCounts[a.type] = (typeCounts[a.type] || 0) + 1
const anonStops = runEntries.filter(e => !SEATS.includes(e.a)).length
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
const seatChips = Object.entries(typeCounts).sort((x, y) => y[1] - x[1])
  .map(([k, n]) => `<span class="chip">${esc(k)} <b>&times;${n}</b></span>`).join('\n    ')
  + (anonStops ? `\n    <span class="chip">helper stops <b>&times;${anonStops}</b></span>` : '')

const footerA = `<span class="mi"><span class="d"></span>Drawn from .forge/ by scripts/progress.mjs after every dispatch, checkpoint, and evidence line. The state files win over this page.</span>`
const footerB = `<span class="mi">estimate: gate 20 + rubric 80, evidence at half weight, 100 only when every line is verified and the report exists · tokens sum every session and subagent transcript for this folder, cache reads included · rendered ${new Date().toISOString().replace(/\.\d+Z/, 'Z')} · refresh 15s</span>`

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<noscript><meta http-equiv="refresh" content="15"></noscript>
<title>Forge run</title>
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
.chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;
font:500 .625rem/1.2 var(--sans);letter-spacing:.04em;
background:var(--raised);color:var(--muted);border:1px solid var(--line)}
.chip--ok{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 40%,var(--line))}
.chip .d{width:6px;height:6px;border-radius:50%;background:currentColor}
.pct{text-align:right;flex:none}
.pct .n{font:500 2.4rem/1 var(--sans);font-variant-numeric:tabular-nums}
.pct .cap{font:400 .625rem/1.4 var(--mono);color:var(--muted)}
.meter{height:.35rem;background:var(--raised);border:1px solid var(--line);
border-radius:99px;overflow:hidden;display:flex}
.pct .meter{margin-top:.4rem;width:10.5rem}
.m-v{background:var(--accent)}.m-e{background:var(--warn)}
.graph{display:flex;align-items:stretch;padding:.45rem 0 .15rem}
.pnode{flex:3;min-width:0;background:var(--surface);border:1px solid var(--line);
border-radius:10px;padding:.6rem .75rem .55rem;box-shadow:0 2px 8px rgb(0 0 0 / .5)}
.pnode .ph{display:flex;align-items:center;gap:.5rem;min-width:0}
.pdot{width:.6rem;height:.6rem;border-radius:50%;background:var(--raised);
border:1px solid var(--line);flex:none}
.pt{font-size:1.1rem;font-weight:500;letter-spacing:-.01em;color:var(--muted);
white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ps{font:400 .62rem/1.4 var(--mono);color:var(--muted);margin:.2rem 0 0 1.1rem;
white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pnode.done .pt{color:var(--ink)}
.pnode.done .pdot{background:var(--muted);border-color:var(--muted)}
.pnode.active{border-color:var(--accent);
box-shadow:0 0 0 1px var(--accent),0 2px 8px rgb(0 0 0 / .5)}
.pnode.active .pt{color:var(--ink)}
.pnode.active .pdot{background:var(--accent);border-color:var(--accent)}
.pnode.pending{opacity:.6}
.pnode.skipped{opacity:.45}.pnode.skipped .pt{text-decoration:line-through}
.wire{flex:1;min-width:.7rem;align-self:center;height:2px;background:var(--line);
position:relative;margin:0 -1px;z-index:0}
.wire::after{content:"";position:absolute;right:0;top:-3px;
border-left:6px solid var(--line);border-top:4px solid transparent;
border-bottom:4px solid transparent}
.wire.w-done{background:var(--muted)}.wire.w-done::after{border-left-color:var(--muted)}
.wire.w-live{background:var(--accent)}.wire.w-live::after{border-left-color:var(--accent)}
@media (prefers-reduced-motion:no-preference){
.pnode.active .pdot{animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35}}}
.slices{display:flex;gap:.6rem;justify-content:center;margin-top:.6rem;overflow:hidden}
.slices .chip{font-size:.75rem;padding:5px 11px}
.slices .chip .d{background:var(--line)}
.slices .sl-done{color:var(--ink)}.slices .sl-done .d{background:var(--muted)}
.slices .sl-active{color:var(--ink);border-color:color-mix(in srgb,var(--accent) 40%,var(--line))}
.slices .sl-active .d{background:var(--accent)}
main{display:grid;grid-template-columns:1.05fr 1.45fr .72fr;
grid-template-rows:1.3fr .8fr;gap:.8rem;min-height:0}
.panel.rub{grid-row:1/3}
.panel.disp{grid-column:2/4}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:10px;
padding:.8rem .9rem;overflow:hidden;min-height:0;display:flex;flex-direction:column;
box-shadow:0 2px 8px rgb(0 0 0 / .5)}
.panel .lbl{margin-bottom:.55rem}
.rgrid{display:grid;grid-template-columns:max-content 1fr 2.6ch 2.6ch 2.9ch;
gap:.3rem .55rem;align-items:center;font-size:.72rem}
.rgrid .h{font:500 .6rem/1.2 var(--mono);color:var(--muted);text-align:right}
.rgrid .nm{color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:9em}
.rgrid .n{font:400 .68rem/1.2 var(--mono);font-variant-numeric:tabular-nums;
text-align:right;color:var(--muted)}
.rgrid .n.on{color:var(--ink)}
.dotln{width:.5rem;height:.5rem;border-radius:50%;flex:none;margin-top:.28rem}
.dotln.ok{background:var(--accent)}
.dotln.wait{background:transparent;border:1px solid var(--warn)}
.dotln.idle{background:transparent;border:1px solid var(--line)}
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
.tnode .tds{font-size:.7rem;color:var(--ink);opacity:.85;white-space:nowrap;
overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.tnode .tdu{font:400 .62rem/1.5 var(--mono);color:var(--muted);flex:none}
.tkid{margin-left:1.3rem}
.shots{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:1fr;gap:.5rem;flex:1;min-height:0}
.shots figure{overflow:hidden;border-radius:6px;border:1px solid var(--line);
position:relative;min-height:0;cursor:pointer;background:var(--raised)}
.shots img{width:100%;height:100%;object-fit:cover;display:block}
.shots figcaption{position:absolute;left:0;right:0;bottom:0;
font:400 .58rem/1.4 var(--mono);padding:.15rem .35rem;
background:rgb(11 11 11 / .78);color:var(--muted);
white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
.rb .bh .lg{font:400 .64rem/1.4 var(--mono);color:var(--muted)}
.rb .bb{overflow-y:auto;padding:.4rem 1rem 1rem}
.rb .sec{font:500 .64rem/1.3 var(--mono);letter-spacing:.04em;color:var(--muted);
margin:.9rem 0 .3rem}
.rb .row{display:flex;gap:.6rem;padding:.34rem 0;border-bottom:1px solid var(--line);
align-items:flex-start}
.rb .row:last-child{border-bottom:none}
.rb .id{font:500 .64rem/1.6 var(--mono);color:var(--muted);flex:none;min-width:2.8ch}
.rb .tx{font-size:.73rem;line-height:1.5;color:var(--ink);opacity:.9}
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
main{grid-template-columns:1fr;grid-template-rows:none}
.panel.rub{grid-row:auto}
.panel.disp{grid-column:auto}
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
    <h1>${esc(goal || 'Forge run')}</h1>
    <div class="chips">
    ${shipped && verifiedAll ? '<span class="chip chip--ok"><span class="d"></span>shipped</span>'
      : armed ? '<span class="chip chip--ok"><span class="d"></span>gate active</span>'
      : '<span class="chip">pre-greenlight</span>'}
    ${shipped && !verifiedAll ? '<span class="chip">report written · verify pending</span>' : ''}
    ${allLines.length ? `<span class="chip">${nVerified} verified · ${nEvidence} evidence · ${allLines.length - nVerified - nEvidence} open</span>` : ''}
    ${stackLine ? `<span class="chip">${esc(trunc(stackLine, 58))}</span>` : ''}
    </div>
  </div>
  <div class="pct">
    <div class="n">${pct}%</div>
    <div class="cap">complete, estimated</div>
    ${durationTxt || tokensTxt ? `<div class="cap">${[durationTxt ? `running ${durationTxt}` : '', tokensTxt ? `${tokensTxt} tokens` : ''].filter(Boolean).join(' · ')}</div>` : ''}
    ${allLines.length ? `<div class="meter"><span class="m-v" style="width:${(nVerified / allLines.length * 100).toFixed(1)}%"></span><span class="m-e" style="width:${(nEvidence / allLines.length * 100).toFixed(1)}%"></span></div>` : ''}
  </div>
</header>

<section>
  <div class="lbl">Pipeline</div>
  <div class="graph">
  ${PHASES.map(([name, , sub], i) => {
    const st = phaseState(i)
    const node = `<div class="pnode ${st}"><div class="ph"><span class="pdot"></span><span class="pt">${esc(name)}</span></div><div class="ps">${st === 'skipped' ? 'skipped' : esc(sub)}</div></div>`
    const wire = i < PHASES.length - 1
      ? `<div class="wire ${i + 1 < active ? 'w-done' : i + 1 === active ? 'w-live' : ''}"></div>` : ''
    return node + wire
  }).join('\n  ')}
  </div>
  ${sliceTitles.length ? `<div class="slices">
  ${sliceTitles.map(s => `<span class="chip ${s.n < curSlice || (s.n === curSlice && shipped) ? 'sl-done' : s.n === curSlice ? 'sl-active' : ''}"><span class="d"></span>slice ${s.n} · ${esc(trunc(s.title, 30))}</span>`).join('\n  ')}
  </div>` : ''}
</section>

<main>
  <div class="panel rub">
    <div class="phead"><span class="lbl">Rubric</span>${allLines.length ? `<button class="btn-all">all ${allLines.length} lines</button>` : ''}</div>
    ${allLines.length ? `<div class="rgrid">
    <span></span><span></span><span class="h" title="verified by the verifier">ok</span><span class="h" title="evidence recorded, awaiting the verifier">ev</span><span class="h">all</span>
    ${sections.filter(s => s.lines.length).map(s => {
      const v = s.lines.filter(l => l.state === 'verified').length
      const e = s.lines.filter(l => l.state === 'evidence').length
      return `<span class="nm">${esc(s.name)}</span><div class="meter"><span class="m-v" style="width:${(v / s.lines.length * 100).toFixed(1)}%"></span><span class="m-e" style="width:${(e / s.lines.length * 100).toFixed(1)}%"></span></div><span class="n${v ? ' on' : ''}">${v}</span><span class="n${e ? ' on' : ''}">${e}</span><span class="n">${s.lines.length}</span>`
    }).join('\n    ')}
    </div>
    ${inPlay.length ? `<div class="play">
    <div class="lbl">${esc(inPlayLabel)}</div>
    ${inPlay.map(l => `<div class="row"><span class="dotln ${dotCls[l.state]}"></span><span class="id">${esc(l.id)}</span><span class="tx">${esc(trunc(l.text, 150))}</span></div>`).join('\n    ')}
    </div>` : ''}`
    : '<p class="empty">The rubric arrives with the plan. Nothing is measured before it exists.</p>'}
  </div>

  <div class="panel">
    <div class="lbl">Activity</div>
    ${resumeTop.length ? `<div class="kv">
    ${resumeTop.map(([k, v]) => `<span class="k">${esc(k.toLowerCase())}</span><span class="v">${esc(trunc(v, 170))}</span>`).join('\n    ')}
    </div>` : ''}
    ${evTail.length ? `<div class="lbl">Evidence, newest first</div>
    <div class="feed" style="flex:1">
    ${evTail.map(r => `<div class="row"><span class="t">${esc(r.t)}</span><span class="tag">${esc(r.id)}</span><span class="tx">${esc(r.txt)}</span></div>`).join('\n    ')}
    </div>` : '<p class="empty">No evidence recorded yet.</p>'}
  </div>

  <div class="panel">
    <div class="lbl">Latest captures${gallery.length > showable.length ? ` · ${showable.length} of ${gallery.length}, all in the popin` : ''}</div>
    ${showable.length ? `<div class="shots">
    ${showable.map((s, i) => `<figure data-i="${i}"><img src="${esc(s.copy)}" alt="${esc(s.p)}" loading="lazy"><figcaption>${esc(s.p.split('/').pop())}</figcaption></figure>`).join('\n    ')}
    </div>` : '<p class="empty">Captures appear as the build starts producing screenshots.</p>'}
  </div>

  <div class="panel disp">
    <div class="phead"><span class="lbl"><span class="live ${liveCls}"></span>Dispatches · ${treeAgents.length} agent(s) · ${runEntries.length} stop(s) · last ${agoTxt}</span><div class="spark">${sparkBars}</div></div>
    ${treeAgents.length ? `<div class="troot">lead · the session${treeOmitted > 0 ? ` · ${treeOmitted} earlier agent(s) not shown` : ''}</div>
    <div class="tree">
    ${treeHtml}
    </div>
    <div class="seats">
    ${seatChips}
    </div>` : '<p class="empty">Agent dispatches appear once the run starts delegating.</p>'}
  </div>
</main>

<footer>
  <div class="mw"><div class="marq">${footerA}${footerA}</div></div>
  <div class="mw"><div class="marq" style="animation-duration:38s">${footerB}${footerB}</div></div>
</footer>

${allLines.length ? `<div class="rb">
  <div class="box">
    <div class="bh"><span class="ti">Rubric · ${nVerified} verified · ${nEvidence} evidence · ${allLines.length - nVerified - nEvidence} open of ${allLines.length}</span><span class="lg">green filled: verified · amber ring: evidence, awaiting the verifier · grey ring: open</span></div>
    <div class="bb">
    ${sections.filter(s => s.lines.length).map(s => `<div class="sec">${esc(s.name)}</div>
    ${s.lines.map(l => `<div class="row"><span class="dotln ${dotCls[l.state]}"></span><span class="id">${esc(l.id)}</span><span class="tx">${esc(l.text)}</span></div>`).join('\n    ')}`).join('\n    ')}
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
function show(i){
  if(!G.length)return
  gi=((i%G.length)+G.length)%G.length
  lb.querySelector('img').src=G[gi].s
  lb.querySelector('figcaption').textContent=(gi+1)+' / '+G.length+' · '+G[gi].c
  lb.classList.add('open')
}
var rb=document.querySelector('.rb')
setInterval(function(){if(!document.querySelector('.lb.open,.rb.open'))location.reload()},15000)
document.addEventListener('click',function(e){
  if(rb&&e.target.closest('.btn-all')){rb.classList.add('open');return}
  if(rb&&rb.classList.contains('open')){
    if(!e.target.closest('.rb .box'))rb.classList.remove('open')
    return}
  var f=e.target.closest('.shots figure')
  if(f){show(+f.dataset.i);return}
  if(e.target.closest('.lb .prev')){show(gi-1);return}
  if(e.target.closest('.lb .next')){show(gi+1);return}
  if(e.target.closest('.lb figure'))return
  lb.classList.remove('open')
})
document.addEventListener('keydown',function(e){
  if(rb&&rb.classList.contains('open')){
    if(e.key==='Escape')rb.classList.remove('open')
    return}
  if(!lb.classList.contains('open'))return
  if(e.key==='Escape')lb.classList.remove('open')
  else if(e.key==='ArrowLeft')show(gi-1)
  else if(e.key==='ArrowRight')show(gi+1)
})
</script>
</body></html>
`

writeFileSync('.forge/PROGRESS.html', html)
