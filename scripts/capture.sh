#!/usr/bin/env bash
# One capture, one contract, three files.
#
#   capture.sh <shot-id> <url> [--viewport 1440x900] [--theme light|dark]
#              [--state <name>] [--wait <selector>] [--platform web|ios|android|engine]
#   capture.sh --smoke
#
# PLATFORM LIVES IN DATA, NOT IN SEAT PROSE. Every target answers the same
# command and writes the same three files, so the verifier's instructions never
# fork per platform. What differs is the freeze recipe, the variant matrix and
# where the tree comes from, and all of that is configuration.
#
# WHY THIS EXISTS. The vitrine build shipped 209 scripts, 13 of them Forge's and
# 196 hand-written by the run. Sixty-nine imported chromium from playwright
# directly, each starting from nothing. Twenty-three of them covered two rubric
# lines: prove-f19.mjs, prove-f19-path3.mjs, f19-f49-path3-probe.mjs,
# f19-stranger-nokey-probe.mjs, run-f19-path3.sh, and eighteen more for r13.
# Not one shared a helper.
#
# So the loop was never open. It was reinvented per rubric line, and all 221
# scripts were committed into the product. This is the shared floor: a seat
# composes from it and passes paths, and only writes its own probe when the
# contract genuinely cannot express the check.
#
# EVERY CAPTURE WRITES THREE FILES, and the seat is told the ids, never the
# bytes:
#   .forge/evidence/shots/<id>.png        the frame
#   .forge/evidence/tree/<id>.json        elements with stable ids and styles
#   .forge/evidence/shots/<id>.meta.json  the command, the pins, the sha256
#
# The tree is the half a PNG cannot carry: div soup, skipped heading levels,
# missing landmarks, buttons that are spans. A pixel diff cannot see any of it,
# and a cross-renderer pixel diff cannot see anything reliably at all.
set -u
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
# Outside a forge project this does nothing and says nothing, like every other
# script here. Argument validation comes after, so a bare invocation in the
# wrong directory is silence rather than a usage error about a run that is not
# happening.
[ -d .forge ] || exit 0

SHOT=""; URL=""; VIEWPORT="1440x900"; THEME="light"; STATE="ideal"; WAITSEL=""
SMOKE=0; PLATFORM="${FORGE_PLATFORM:-web}"; TEXTSIZE="${FORGE_TEXT_SIZE:-default}"; DEVICE=""
LOCKED=.forge/design/CAPTURE.lock.json
if [ -f "$LOCKED" ] && command -v python3 >/dev/null 2>&1; then
  PLATFORM=$(python3 -c "
import json,sys
try: print(json.load(open('$LOCKED')).get('platform','$PLATFORM'))
except Exception: print('$PLATFORM')" 2>/dev/null || echo "$PLATFORM")
fi
while [ $# -gt 0 ]; do
  case "$1" in
    --smoke)    SMOKE=1; shift ;;
    --viewport) VIEWPORT="$2"; shift 2 ;;
    --theme)    THEME="$2"; shift 2 ;;
    --state)    STATE="$2"; shift 2 ;;
    --wait)     WAITSEL="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --device)   DEVICE="$2"; shift 2 ;;
    --text-size) TEXTSIZE="$2"; shift 2 ;;
    -*)         echo "capture: unknown flag $1" >&2; exit 2 ;;
    *)          if [ -z "$SHOT" ]; then SHOT="$1"; else URL="$1"; fi; shift ;;
  esac
done

if [ "$SMOKE" = 1 ]; then
  SHOT="${SHOT:-smoke}"
  URL="${URL:-${FORGE_BASE_URL:-http://localhost:3000}}"
fi
[ -z "$SHOT" ] && { echo "capture: no shot id" >&2; exit 2; }
# Only the web path navigates. A simulator or an engine rig captures whatever is
# already on screen, so demanding a URL there would be a usage error about a
# concept that does not exist on that platform.
[ "$PLATFORM" = web ] && [ -z "$URL" ] && { echo "capture: no url" >&2; exit 2; }

mkdir -p .forge/evidence/shots .forge/evidence/tree

# ---------------------------------------------------------------- non-web
# Each of these ends in the same triple. Where a platform genuinely has no
# element tree, the rig emits its declared regions and the meta marks the shot
# tree:declared, so a verifier knows it is reading a contract rather than an
# observation and does not claim a comparison it did not make.
emit_meta () { # emit_meta <png> <treekind> <cmd> <extra-json>
  python3 - "$SHOT" "$1" "$2" "$3" "${4:-{\}}" <<'PYMETA'
import hashlib, json, os, sys
shot, png, treekind, cmd, extra = sys.argv[1:6]
sha = hashlib.sha256(open(png,'rb').read()).hexdigest() if os.path.exists(png) else None
meta = {"shot": shot, "capturedBy": "scripts/capture.sh", "command": cmd,
        "tree": treekind, "sha256": sha,
        "anchor": {"rendered": bool(sha), "ok": bool(sha)}}
try: meta.update(json.loads(extra))
except Exception: pass
open(f".forge/evidence/shots/{shot}.meta.json","w").write(json.dumps(meta, indent=2))
print(f"shot     .forge/evidence/shots/{shot}.png")
print(f"meta     .forge/evidence/shots/{shot}.meta.json")
print(f"sha256   {sha}")
print(f"anchor   {'ok' if sha else 'FAILED'}")
PYMETA
}

case "$PLATFORM" in
  ios)
    # Freeze the status bar BEFORE the frame, or the clock and the battery make
    # every capture a new image and the threshold gets widened until it rules on
    # nothing. Permissions are granted up front so no system modal covers the
    # first frame.
    command -v xcrun >/dev/null 2>&1 || { echo "capture: xcrun missing. xcode-select --install" >&2; exit 3; }
    xcrun simctl status_bar booted override --time "9:41" --dataNetwork wifi \
      --wifiMode active --wifiBars 3 --cellularBars 4 \
      --batteryState charged --batteryLevel 100 >/dev/null 2>&1 || true
    xcrun simctl ui booted appearance "$THEME" >/dev/null 2>&1 || true
    # The variant that catches the real defect. Text clipping and contrast
    # collapse appear at accessibility content sizes, so the default-size
    # light-mode capture is exactly the one that hides what agents get wrong.
    [ "$TEXTSIZE" != default ] && xcrun simctl ui booted content_size "$TEXTSIZE" >/dev/null 2>&1
    PNG=".forge/evidence/shots/$SHOT.png"
    xcrun simctl io booted screenshot "$PNG" >/dev/null 2>&1 || { echo "capture: simctl screenshot failed; is a simulator booted?" >&2; exit 4; }
    if command -v maestro >/dev/null 2>&1; then
      maestro inspect-screen --format json > ".forge/evidence/tree/$SHOT.json" 2>/dev/null \
        && TREE=observed || TREE=declared
    else TREE=declared; fi
    emit_meta "$PNG" "$TREE" "xcrun simctl io booted screenshot" "{\"appearance\":\"$THEME\",\"contentSize\":\"$TEXTSIZE\"}"
    exit 0 ;;
  android)
    command -v adb >/dev/null 2>&1 || { echo "capture: adb missing. brew install --cask android-platform-tools" >&2; exit 3; }
    PNG=".forge/evidence/shots/$SHOT.png"
    # exec-out, never `adb shell screencap` piped: shell line-ending translation
    # corrupts the PNG and the corruption looks like a rendering difference.
    adb exec-out screencap -p > "$PNG" 2>/dev/null || { echo "capture: adb screencap failed; is an emulator running?" >&2; exit 4; }
    if command -v maestro >/dev/null 2>&1; then
      maestro inspect-screen --format json > ".forge/evidence/tree/$SHOT.json" 2>/dev/null \
        && TREE=observed || TREE=declared
    else TREE=declared; fi
    emit_meta "$PNG" "$TREE" "adb exec-out screencap -p" "{\"appearance\":\"$THEME\"}"
    exit 0 ;;
  engine)
    # The rig belongs in the target repo, because evidence that exists only
    # inside one MCP session on one OS is not reproducible and does not satisfy
    # rule 6. This dispatches to it and refuses to invent one.
    RIG="${FORGE_ENGINE_RIG:-scripts/engine-capture.sh}"
    [ -x "$RIG" ] || { echo "capture: no engine rig at $RIG. The target repo owns it; it must write .forge/evidence/shots/<id>.png and never pass -nographics, which initialises no graphics device and reports green over blank frames." >&2; exit 3; }
    SHOT="$SHOT" THEME="$THEME" STATE="$STATE" "$RIG" || exit 4
    PNG=".forge/evidence/shots/$SHOT.png"
    [ -f ".forge/evidence/tree/$SHOT.json" ] && TREE=observed || TREE=declared
    emit_meta "$PNG" "$TREE" "$RIG" "{\"engine\":true}"
    exit 0 ;;
  web) ;;
  *) echo "capture: unknown platform $PLATFORM" >&2; exit 2 ;;
esac

# ---------------------------------------------------------------- web
command -v node >/dev/null 2>&1 || { echo "capture: node is not installed" >&2; exit 3; }
node -e "require.resolve('playwright')" 2>/dev/null || \
  node -e "require.resolve('playwright-core')" 2>/dev/null || {
    echo "capture: playwright is not installed. npm i -D playwright && npx playwright install chromium" >&2
    exit 3
  }

SHOT="$SHOT" URL="$URL" VIEWPORT="$VIEWPORT" THEME="$THEME" STATE="$STATE" WAITSEL="$WAITSEL" \
node --input-type=module -e '
import { chromium } from "playwright"
import { writeFileSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"

const { SHOT, URL, VIEWPORT, THEME, STATE, WAITSEL } = process.env
const [w, h] = VIEWPORT.split("x").map(Number)

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: w, height: h },
  colorScheme: THEME,
  reducedMotion: "reduce",
  deviceScaleFactor: 1,
})
const page = await ctx.newPage()

// Console errors are collected BEFORE the verdict, because the render has to be
// anchored first. A verifier that goes straight to comparison judges a blank
// mount as a design difference and writes confident nonsense about a page that
// never painted.
const consoleErrors = []
const failedRequests = []
page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)) })
page.on("requestfailed", r => failedRequests.push(r.url().slice(0, 200)))
page.on("response", r => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url().slice(0,200)}`) })

let navError = null
try {
  await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 })
  if (WAITSEL) await page.waitForSelector(WAITSEL, { timeout: 15000 })
} catch (e) { navError = String(e.message || e).slice(0, 300) }

// Freeze what moves, so two captures of one idle shot are byte-identical and a
// tight threshold stays affordable. A threshold nobody can meet gets widened,
// and widening is the visual form of softening a rubric line.
await page.addStyleTag({ content: `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  html { scroll-behavior: auto !important; }
`}).catch(() => {})

const png = `.forge/evidence/shots/${SHOT}.png`
await page.screenshot({ path: png, fullPage: false, animations: "disabled", caret: "hide" })

// The tree. Same shape on every platform so the seat prose does not fork:
// a flat array of {id, role, name, text, box, styles}.
const tree = await page.evaluate(() => {
  const out = []
  const SKIP = new Set(["SCRIPT", "STYLE", "META", "LINK", "HEAD", "NOSCRIPT"])
  let n = 0
  const walk = (el, depth) => {
    if (n > 1200 || depth > 24) return
    if (SKIP.has(el.tagName)) return
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) {
      const cs = getComputedStyle(el)
      out.push({
        id: el.id || `n${n}`,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role") || null,
        name: el.getAttribute("aria-label") || el.getAttribute("alt") || null,
        text: (el.childElementCount === 0 ? (el.textContent || "").trim().slice(0, 120) : ""),
        box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        styles: {
          fontSize: cs.fontSize, fontWeight: cs.fontWeight,
          color: cs.color, background: cs.backgroundColor,
        },
      })
      n++
    }
    for (const c of el.children) walk(c, depth + 1)
  }
  walk(document.body, 0)
  return {
    url: location.href,
    title: document.title,
    landmarks: {
      main: !!document.querySelector("main, [role=main]"),
      nav: !!document.querySelector("nav, [role=navigation]"),
      h1: document.querySelectorAll("h1").length,
    },
    headingOrder: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(e => +e.tagName[1]),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    elements: out,
  }
})

const sha = createHash("sha256").update(readFileSync(png)).digest("hex")

// The anchor. A capture that fails any of these is not evidence about design,
// it is evidence the page did not render, and the difference decides whether a
// verdict means anything.
const anchor = {
  rendered: !navError,
  navError,
  consoleErrors: consoleErrors.slice(0, 10),
  failedRequests: failedRequests.slice(0, 10),
  hasMain: tree.landmarks.main,
  horizontalOverflow: tree.scrollWidth > tree.clientWidth + 1,
  elementCount: tree.elements.length,
}
anchor.ok = anchor.rendered && anchor.consoleErrors.length === 0 &&
            anchor.failedRequests.length === 0 && anchor.elementCount > 5

writeFileSync(`.forge/evidence/tree/${SHOT}.json`, JSON.stringify(tree, null, 2))
writeFileSync(`.forge/evidence/shots/${SHOT}.meta.json`, JSON.stringify({
  shot: SHOT, url: URL, viewport: VIEWPORT, theme: THEME, state: STATE,
  sha256: sha, capturedBy: "scripts/capture.sh", anchor,
}, null, 2))

console.log(`shot     .forge/evidence/shots/${SHOT}.png`)
console.log(`tree     .forge/evidence/tree/${SHOT}.json`)
console.log(`meta     .forge/evidence/shots/${SHOT}.meta.json`)
console.log(`sha256   ${sha}`)
console.log(`anchor   ${anchor.ok ? "ok" : "FAILED"}`)
if (!anchor.ok) {
  if (navError) console.log(`  nav      ${navError}`)
  for (const e of anchor.consoleErrors) console.log(`  console  ${e}`)
  for (const f of anchor.failedRequests) console.log(`  request  ${f}`)
  if (!anchor.hasMain) console.log("  no main landmark")
}
await browser.close()
process.exit(anchor.ok ? 0 : 4)
'
