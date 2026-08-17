#!/usr/bin/env node
// Renders .forge/PROGRESS.html from the state files. Called by runlog.sh,
// checkpoint.sh, and evidence.sh; safe to run by hand. No-ops without .forge/.
// Wallboard layout: fills one screen, no scroll, no interaction needed.
// The state files stay the source of truth; this file only draws them.
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

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
let cur = null
for (const line of dod.split('\n')) {
  const h = line.match(/^##\s+(.+)/)
  if (h) { cur = { name: h[1].trim(), lines: [] }; sections.push(cur); continue }
  const c = line.match(/^- \[([ x])\]\s+(?:[*_`]*([A-Za-z]+\d+)[*_`]*\s+)?(.*)/)
  if (c && cur) {
    const id = c[2] || ''
    cur.lines.push({
      id, text: c[3],
      state: c[1] === 'x' ? 'verified' : (id && evidenced.has(id) ? 'evidence' : 'open'),
    })
  }
}
const allLines = sections.flatMap(s => s.lines)
const nVerified = allLines.filter(l => l.state === 'verified').length
const nEvidence = allLines.filter(l => l.state === 'evidence').length

// Slices from PLAN.md, cursor from RESUME.md.
const sliceTitles = [...plan.matchAll(/^#{0,3}\s*Slice (\d+)[:.]\s*([^\n]*)/gim)].map(m => ({ n: +m[1], title: m[2].trim() }))
const curSlice = +((resume.match(/Current slice:[^\n]*?(\d+)/i) || [, 0])[1])
const resumeTop = resume.split('\n').filter(l => /^(Last phase|Current slice|Next action)/i.test(l))

// Pipeline cursor: the highest phase named in RESUME's next action is active;
// earlier phases are done, scout and design show skipped when their artifacts
// never appeared.
const PHASES = [
  ['Intake', /intake/i], ['Size', /\bsize\b|router/i], ['Scout', /scout/i],
  ['Design', /design\b(?!\.md)/i], ['Plan', /\bplan\b|architect/i],
  ['Gate + arm', /greenlight|arm\b/i], ['Build', /build|slice|builder/i],
  ['Verify', /verif/i], ['Ship', /ship|deploy|finisher/i],
]
const nextAction = (resume.match(/Next action:\s*([^\n]*)/i) || [, ''])[1]
// The canonical resume line leads with the forge phase number ("Next action:
// 8 BUILD ..."); trust that first. Otherwise the earliest keyword in the
// line wins, with .md filenames stripped so PLAN.md is not read as PLAN.
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
if (active < 0) { // fall back to artifact existence
  active = shipped ? 9 : armed ? 6 : dod ? 5 : brief ? 1 : 0
}
if (shipped) active = 9
const scoutSkipped = active > 2 && !/##\s*Research/i.test(brief)
const designSkipped = active > 3 && !existsSync('.forge/DESIGN.md')
const phaseState = i =>
  i < active ? ((i === 2 && scoutSkipped) || (i === 3 && designSkipped) ? 'skipped' : 'done')
  : i === active ? 'active' : 'pending'

// Completion estimate. The gate work is worth 20 points; the rubric carries
// the other 80, an evidence-recorded line counting half a verified one.
// Capped at 99 until REPORT.md exists: only shipping is 100.
const pct = shipped ? 100
  : allLines.length
    ? Math.min(99, Math.round(20 + 80 * (nVerified + 0.5 * nEvidence) / allLines.length))
    : Math.min(20, Math.round(((Math.min(active, 5) + (armed ? 1 : 0)) / 6) * 20))

// Latest captures: newest images from the usual spots plus paths named in evidence.
const shots = []
const walk = (d, depth) => { try {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    const st = statSync(p)
    if (st.isDirectory()) { if (depth > 0) walk(p, depth - 1) }
    else if (/\.(png|jpe?g|webp)$/i.test(f)) shots.push(p)
  }
} catch {} }
walk('tests/screenshots', 1); walk('launch/screenshots', 1)
walk('.forge/shots', 1); walk('test-results', 3)
for (const m of evidence.matchAll(/[\w./-]+\.(?:png|jpe?g|webp)/gi)) if (existsSync(m[0])) shots.push(m[0])
const latest = [...new Set(shots)]
  .map(p => { try { return { p, t: statSync(p).mtimeMs } } catch { return null } })
  .filter(Boolean).sort((a, b) => b.t - a.t).slice(0, 6)

const stackLine = (plan.match(/^\*{0,2}Stack[:*]*\s*(.+)$/mi) || greenlight.match(/^Stack:\s*(.+)$/mi) || [, ''])[1]

const feed = lines => lines.map(l => `<div class="fl">${esc(l)}</div>`).join('\n')
const evTail = evidenceLines.slice(-7).reverse().map(l => {
  const m = l.match(/^(\S+) \| (\S+) \| (.*)$/)
  return m ? `${m[1].slice(11, 16)}  ${m[2]}  ${trunc(m[3], 120)}` : trunc(l, 130)
})
const logTail = runlog.trim() ? runlog.trim().split('\n').slice(-5).reverse().map(l => {
  const m = l.match(/^(\S+) \| (\S+) \| (.*)$/)
  return m ? `${m[1].slice(11, 16)}  ${m[2]}  ${m[3]}` : trunc(l, 90)
}) : []

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="15">
<title>Forge run</title>
<style>
:root{--bg:#faf9f6;--ink:#1c1b18;--dim:#6b675e;--line:#e2dfd6;--panel:#f1efe8;
--accent:#b4530a;--good:#2c6e49;--mid:#8a6d1f}
@media (prefers-color-scheme:dark){:root{--bg:#191813;--ink:#e8e6df;--dim:#9a958a;
--line:#33312a;--panel:#201f19;--accent:#e07b39;--good:#6fbf8f;--mid:#c9a44a}}
*{box-sizing:border-box;margin:0}
html{font-size:clamp(10px,0.95vw,19px)}
body{height:100dvh;overflow:hidden;display:grid;
grid-template-rows:auto auto 1fr auto;gap:.9rem;padding:1.1rem 1.4rem;
background:var(--bg);color:var(--ink);
font:1rem/1.45 -apple-system,"Segoe UI",system-ui,sans-serif}
.plabel{font:600 .64rem ui-monospace,Menlo,monospace;text-transform:uppercase;
letter-spacing:.09em;color:var(--dim);margin-bottom:.45rem}
header{display:flex;gap:1.4rem;align-items:center}
header .id{flex:1;min-width:0}
h1{font-size:1.55rem;line-height:1.15;letter-spacing:-.01em;
white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badges{margin-top:.3rem;white-space:nowrap;overflow:hidden}
.badges span{display:inline-block;font:600 .68rem ui-monospace,Menlo,monospace;
padding:.12em .55em;border:1px solid var(--line);border-radius:99px;
margin-right:.4rem;color:var(--dim)}
.badges .on{color:var(--accent);border-color:var(--accent)}
.badges .ship{color:var(--good);border-color:var(--good)}
.pct{text-align:right;flex:none}
.pct .n{font-size:3rem;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.pct .cap{font-size:.68rem;color:var(--dim)}
.meter{height:.42rem;background:var(--line);border-radius:99px;overflow:hidden;
display:flex;margin-top:.35rem;width:11rem}
.m-v{background:var(--good)}.m-e{background:var(--mid)}
.stepper{display:grid;grid-template-columns:repeat(9,1fr)}
.step{text-align:center;position:relative;color:var(--dim);font-size:.78rem;padding-top:.1rem}
.step::before{content:"";position:absolute;top:.52rem;right:50%;width:100%;
height:2px;background:var(--line)}
.step:first-child::before{display:none}
.step .dot{width:.85rem;height:.85rem;border-radius:99px;background:var(--line);
margin:0 auto .3rem;position:relative;border:2px solid var(--bg)}
.step.done{color:var(--ink)}.step.done .dot,.step.done::before{background:var(--good)}
.step.active{color:var(--ink);font-weight:600}.step.active .dot{background:var(--accent)}
.step.active::before{background:var(--good)}
.step.skipped .lbl{text-decoration:line-through}
@media (prefers-reduced-motion:no-preference){
.step.active .dot{animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35}}}
.slices{display:flex;gap:1.2rem;justify-content:center;margin-top:.55rem;
font-size:.78rem;color:var(--dim);flex-wrap:nowrap;overflow:hidden}
.slices .done{color:var(--ink)}.slices .done::before{content:"✓ ";color:var(--good)}
.slices .active{color:var(--ink);font-weight:600}
.slices .active::before{content:"▸ ";color:var(--accent)}
.slices .pending::before{content:"○ "}
main{display:grid;grid-template-columns:1.1fr 1.15fr 1fr;gap:.9rem;min-height:0}
.panel{border:1px solid var(--line);border-radius:10px;padding:.85rem .95rem;
overflow:hidden;min-height:0;display:flex;flex-direction:column;background:var(--panel)}
.rrow{display:grid;grid-template-columns:7.5em 1fr auto;gap:.7rem;
align-items:center;padding:.34rem 0;font-size:.82rem}
.rrow .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rrow .ct{font:0.72rem ui-monospace,Menlo,monospace;color:var(--dim);white-space:nowrap}
.rrow .meter{width:auto;margin:0}
.legend{color:var(--dim);font-size:.7rem;margin-top:auto;padding-top:.5rem}
.legend i{display:inline-block;width:.65em;height:.65em;border-radius:2px;
margin:0 .3em 0 .75em;vertical-align:baseline}
.sub{font-size:.78rem;color:var(--dim)}
.feed{font:0.72rem/1.5 ui-monospace,Menlo,monospace;overflow:hidden;min-height:0}
.fl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:.1rem 0;
border-bottom:1px solid var(--line)}
.fl:last-child{border-bottom:none}
.gap{margin-top:.8rem}
.shots{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:1fr;gap:.5rem;
flex:1;min-height:0}
.shots figure{overflow:hidden;border-radius:6px;border:1px solid var(--line);
position:relative;min-height:0}
.shots img{width:100%;height:100%;object-fit:cover;display:block}
.shots figcaption{position:absolute;left:0;right:0;bottom:0;font-size:.6rem;
padding:.15rem .35rem;background:color-mix(in srgb,var(--bg) 82%,transparent);
color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.empty{color:var(--dim);font-size:.82rem;margin:auto;text-align:center;padding:1rem}
footer{display:flex;justify-content:space-between;gap:1rem;color:var(--dim);
font-size:.68rem;white-space:nowrap;overflow:hidden}
footer span{overflow:hidden;text-overflow:ellipsis}
@media (max-width:900px),(orientation:portrait){
body{height:auto;overflow:auto;grid-template-rows:none}
main{grid-template-columns:1fr}
h1{white-space:normal}
.stepper{grid-template-columns:repeat(3,1fr);row-gap:.6rem}
.step::before{display:none}
.slices{flex-wrap:wrap}}
</style>
</head>
<body>
<header>
  <div class="id">
    <h1>${esc(goal || 'Forge run')}</h1>
    <p class="badges">
    ${shipped ? '<span class="ship">SHIPPED</span>' : armed ? '<span class="on">GATE ACTIVE</span>' : '<span>PRE-GREENLIGHT</span>'}
    ${allLines.length ? `<span>${nVerified} verified · ${nEvidence} evidence · ${allLines.length - nVerified - nEvidence} open of ${allLines.length}</span>` : ''}
    ${stackLine ? `<span>${esc(trunc(stackLine, 64))}</span>` : ''}
    </p>
  </div>
  <div class="pct">
    <div class="n">${pct}%</div>
    <div class="cap">complete, estimated</div>
    ${allLines.length ? `<div class="meter"><span class="m-v" style="width:${(nVerified / allLines.length * 100).toFixed(1)}%"></span><span class="m-e" style="width:${(nEvidence / allLines.length * 100).toFixed(1)}%"></span></div>` : ''}
  </div>
</header>

<section>
  <div class="plabel">Pipeline</div>
  <div class="stepper">
  ${PHASES.map(([name], i) => `<div class="step ${phaseState(i)}"><div class="dot"></div><span class="lbl">${esc(name)}</span></div>`).join('\n  ')}
  </div>
  ${sliceTitles.length ? `<div class="slices">
  ${sliceTitles.map(s => `<span class="${s.n < curSlice ? 'done' : s.n === curSlice && !shipped ? 'active' : s.n === curSlice ? 'done' : 'pending'}">Slice ${s.n} · ${esc(trunc(s.title, 34))}</span>`).join('\n  ')}
  </div>` : ''}
</section>

<main>
  <div class="panel">
    <div class="plabel">Rubric</div>
    ${allLines.length ? sections.filter(s => s.lines.length).map(s => {
      const v = s.lines.filter(l => l.state === 'verified').length
      const e = s.lines.filter(l => l.state === 'evidence').length
      return `<div class="rrow"><span class="nm">${esc(s.name)}</span><div class="meter"><span class="m-v" style="width:${(v / s.lines.length * 100).toFixed(1)}%"></span><span class="m-e" style="width:${(e / s.lines.length * 100).toFixed(1)}%"></span></div><span class="ct">${v}✓ ${e}● ${s.lines.length}</span></div>`
    }).join('\n') + `<p class="legend">verified by the verifier<i style="background:var(--good)"></i>evidence recorded, awaiting the verifier<i style="background:var(--mid)"></i>open</p>`
    : '<p class="empty">The rubric arrives with the plan. Nothing is measured before it exists.</p>'}
  </div>

  <div class="panel">
    <div class="plabel">Activity</div>
    ${resumeTop.length ? `<div class="feed">${feed(resumeTop.map(l => trunc(l, 150)))}</div>` : ''}
    ${evTail.length ? `<div class="plabel gap">Evidence, newest first</div><div class="feed" style="flex:1">${feed(evTail)}</div>` : '<p class="sub gap">No evidence recorded yet.</p>'}
    ${logTail.length ? `<div class="plabel gap">Dispatches</div><div class="feed">${feed(logTail)}</div>` : ''}
  </div>

  <div class="panel">
    <div class="plabel">Latest captures</div>
    ${latest.length ? `<div class="shots">
    ${latest.map(s => `<figure><img src="../${esc(s.p)}" alt="${esc(s.p)}" loading="lazy"><figcaption>${esc(s.p.split('/').pop())}</figcaption></figure>`).join('\n    ')}
    </div>` : '<p class="empty">Captures appear as the build starts producing screenshots.</p>'}
  </div>
</main>

<footer>
  <span>Drawn from .forge/ by scripts/progress.mjs after every dispatch, checkpoint, and evidence line. The state files win over this page.</span>
  <span>estimate: gate 20 + rubric 80, evidence at half weight · rendered ${new Date().toISOString().replace(/\.\d+Z/, 'Z')} · refreshes every 15 s</span>
</footer>
</body></html>
`

writeFileSync('.forge/PROGRESS.html', html)
