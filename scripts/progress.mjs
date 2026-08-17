#!/usr/bin/env node
// Renders .forge/PROGRESS.html from the state files. Called by runlog.sh,
// checkpoint.sh, and evidence.sh; safe to run by hand. No-ops without .forge/.
// The state files stay the source of truth; this file only draws them.
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

if (!existsSync('.forge')) process.exit(0)

const read = f => { try { return readFileSync(f, 'utf8') } catch { return '' } }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

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
const curSlice = +((resume.match(/Current slice:\s*(\d+)/i) || [, 0])[1])
const resumeTop = resume.split('\n').filter(l => /^(Last phase|Current slice|Next action|Rubric)/i.test(l))

// Pipeline cursor: the highest phase named in RESUME's next action is active;
// earlier phases are done, scout and design show skipped when their artifacts
// never appeared.
const PHASES = [
  ['Intake', /intake/i], ['Size', /\bsize\b|router/i], ['Scout', /scout/i],
  ['Design', /design\b(?!\.md)/i], ['Plan', /\bplan\b|architect/i],
  ['Greenlight + arm', /greenlight|arm\b/i], ['Build', /build|slice|builder/i],
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
  .filter(Boolean).sort((a, b) => b.t - a.t).slice(0, 12)

const stackLine = (plan.match(/^\*{0,2}Stack[:*]*\s*(.+)$/mi) || greenlight.match(/^Stack:\s*(.+)$/mi) || [, ''])[1]

const meter = (v, e, total) => total ? `<div class="meter"><span class="m-v" style="width:${(v / total * 100).toFixed(1)}%"></span><span class="m-e" style="width:${(e / total * 100).toFixed(1)}%"></span></div>` : ''

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="15">
<title>Forge run</title>
<style>
:root{--bg:#faf9f6;--ink:#1c1b18;--dim:#6b675e;--line:#e2dfd6;--panel:#f1efe8;
--accent:#b4530a;--good:#2c6e49;--mid:#8a6d1f;--code:#23221e;--code-ink:#e8e6df}
@media (prefers-color-scheme:dark){:root{--bg:#191813;--ink:#e8e6df;--dim:#9a958a;
--line:#33312a;--panel:#201f19;--accent:#e07b39;--good:#6fbf8f;--mid:#c9a44a;
--code:#11100d;--code-ink:#d9d6cd}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:15px/1.55 -apple-system,"Segoe UI",system-ui,sans-serif}
main{max-width:46rem;margin:0 auto;padding:1.5rem 1.1rem 4rem}
h1{font-size:1.5rem;margin:.2rem 0 .1rem;letter-spacing:-.01em}
h2{font-size:1.02rem;margin:2rem 0 .6rem;padding-top:1rem;border-top:1px solid var(--line)}
.sub{color:var(--dim);margin:0 0 1rem}
.badges span{display:inline-block;font:600 .72rem ui-monospace,Menlo,monospace;
padding:.15em .55em;border:1px solid var(--line);border-radius:99px;margin-right:.4rem}
.badges .on{color:var(--accent);border-color:var(--accent)}
.badges .ship{color:var(--good);border-color:var(--good)}
ol.pipe{list-style:none;margin:0;padding:0}
ol.pipe li{display:flex;gap:.6rem;align-items:baseline;padding:.28rem 0;color:var(--dim)}
ol.pipe .dot{width:.62rem;height:.62rem;border-radius:99px;flex:none;
background:var(--line);position:relative;top:.05rem}
ol.pipe .done{color:var(--ink)} ol.pipe .done .dot{background:var(--good)}
ol.pipe .active{color:var(--ink);font-weight:600} ol.pipe .active .dot{background:var(--accent)}
@media (prefers-reduced-motion:no-preference){
ol.pipe .active .dot{animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35}}}
ol.pipe .skipped{text-decoration:none} ol.pipe .skipped .lbl::after{content:" (skipped)";font-size:.8em}
.meter{height:.5rem;background:var(--line);border-radius:99px;overflow:hidden;
display:flex;margin:.35rem 0 .2rem}
.m-v{background:var(--good)} .m-e{background:var(--mid)}
.legend{color:var(--dim);font-size:.8rem}
.legend i{display:inline-block;width:.7em;height:.7em;border-radius:2px;margin:0 .25em 0 .8em;vertical-align:baseline}
details{margin:.5rem 0}
summary{cursor:pointer;font-weight:600;font-size:.92rem}
ul.rub{list-style:none;padding:0;margin:.4rem 0;font-size:.85rem}
ul.rub li{padding:.14rem 0 .14rem 1.4rem;position:relative;color:var(--dim)}
ul.rub li::before{position:absolute;left:0;font-family:ui-monospace,Menlo,monospace}
ul.rub .verified{color:var(--ink)} ul.rub .verified::before{content:"✓";color:var(--good)}
ul.rub .evidence{color:var(--ink)} ul.rub .evidence::before{content:"●";color:var(--mid)}
ul.rub .open::before{content:"○"}
ul.rub b{font-family:ui-monospace,Menlo,monospace;font-weight:600}
pre{background:var(--code);color:var(--code-ink);padding:.7rem .8rem;border-radius:8px;
overflow-x:auto;font-size:.78rem;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.6rem}
.shots figure{margin:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--panel)}
.shots img{width:100%;height:110px;object-fit:cover;display:block}
.shots figcaption{font-size:.68rem;color:var(--dim);padding:.25rem .4rem;overflow-wrap:anywhere}
.slice{padding:.2rem 0;color:var(--dim)} .slice.done{color:var(--ink)}
.slice.done::before{content:"✓ ";color:var(--good)}
.slice.active{color:var(--ink);font-weight:600} .slice.active::before{content:"▸ ";color:var(--accent)}
.slice.pending::before{content:"○ "}
footer{margin-top:2.5rem;color:var(--dim);font-size:.78rem;border-top:1px solid var(--line);padding-top:.8rem}
</style>
</head>
<body><main>
<h1>${esc(goal || 'Forge run')}</h1>
<p class="sub">rendered ${new Date().toISOString().replace(/\.\d+Z/, 'Z')} · refreshes every 15 s</p>
<p class="badges">
${shipped ? '<span class="ship">SHIPPED</span>' : armed ? '<span class="on">GATE ACTIVE</span>' : '<span>PRE-GREENLIGHT</span>'}
${stackLine ? `<span>${esc(stackLine.slice(0, 60))}</span>` : ''}
</p>

<h2>Pipeline</h2>
<ol class="pipe">
${PHASES.map(([name], i) => `<li class="${phaseState(i)}"><span class="dot"></span><span class="lbl">${esc(name)}</span></li>`).join('\n')}
</ol>

${sliceTitles.length ? `<h2>Slices</h2>
${sliceTitles.map(s => `<div class="slice ${s.n < curSlice ? 'done' : s.n === curSlice && !shipped ? 'active' : s.n === curSlice ? 'done' : 'pending'}">Slice ${s.n}: ${esc(s.title)}</div>`).join('\n')}` : ''}

${allLines.length ? `<h2>Rubric · ${nVerified} verified, ${nEvidence} with evidence, ${allLines.length - nVerified - nEvidence} open, of ${allLines.length}</h2>
${meter(nVerified, nEvidence, allLines.length)}
<p class="legend">verified by the verifier<i style="background:var(--good)"></i>evidence recorded, awaiting the verifier<i style="background:var(--mid)"></i>open</p>
${sections.filter(s => s.lines.length).map(s => {
  const v = s.lines.filter(l => l.state === 'verified').length
  const e = s.lines.filter(l => l.state === 'evidence').length
  return `<details${s.lines.some(l => l.state !== 'open') ? ' open' : ''}><summary>${esc(s.name)} · ${v} verified, ${e} evidence, ${s.lines.length} lines</summary>
<ul class="rub">
${s.lines.map(l => `<li class="${l.state}">${l.id ? `<b>${esc(l.id)}</b> ` : ''}${esc(l.text.length > 180 ? l.text.slice(0, 177) + '...' : l.text)}</li>`).join('\n')}
</ul></details>`
}).join('\n')}` : ''}

${latest.length ? `<h2>Latest captures</h2>
<div class="shots">
${latest.map(s => `<figure><a href="../${esc(s.p)}"><img src="../${esc(s.p)}" alt="${esc(s.p)}" loading="lazy"></a><figcaption>${esc(s.p.split('/').pop())}</figcaption></figure>`).join('\n')}
</div>` : ''}

${resumeTop.length ? `<h2>Where the run stands</h2>
<pre>${esc(resumeTop.join('\n'))}</pre>` : ''}

${greenlight ? `<details><summary>The approved card (GREENLIGHT.md)</summary><pre>${esc(greenlight.trim())}</pre></details>` : ''}

${evidenceLines.length ? `<h2>Evidence · ${evidenceLines.length} line(s)</h2>
<pre>${esc(evidenceLines.slice(-10).join('\n'))}</pre>
${evidenceLines.length > 10 ? `<details><summary>all ${evidenceLines.length} lines</summary><pre>${esc(evidenceLines.join('\n'))}</pre></details>` : ''}` : ''}

${runlog.trim() ? `<h2>Dispatch log</h2>
<pre>${esc(runlog.trim().split('\n').slice(-12).join('\n'))}</pre>` : ''}

<footer>Drawn from .forge/ by scripts/progress.mjs after every dispatch,
checkpoint, and evidence line. The state files are the source of truth; if
this page and a file disagree, the file wins.</footer>
</main></body></html>
`

writeFileSync('.forge/PROGRESS.html', html)
