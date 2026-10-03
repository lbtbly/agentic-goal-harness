#!/usr/bin/env bash
# The standards disqualifier list as one rubric check. Composes capture.sh; it
# opens no browser of its own except for the optional a11y pass.
#
#   craft-suite.sh [--serve "<start cmd>"] [--a11y] <base-url> <route>...
#
# Per route, at 320, 768 and 1280 wide: the render anchors (no navigation error,
# no console error, no failed request, a main landmark), nothing overflows
# horizontally, and heading levels never skip. Once per tree: no placeholder
# copy or TODO markers in shipped source, an icon exists, no probe or .bak
# debris is tracked. --a11y adds axe-core at 1280: zero serious or critical.
#
# Exit 0 pass, 1 fail, 2 could not run (no playwright, no axe-core, server
# never answered). Could-not-run is UNKNOWN to dod-check, never green.
set -u
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -d .forge ] || exit 0
HERE=$(cd "$(dirname "$0")" 2>/dev/null && pwd)

SERVE=""; A11Y=0
while [ $# -gt 0 ]; do
  case "$1" in
    --serve) SERVE=$2; shift 2 ;;
    --a11y)  A11Y=1; shift ;;
    *) break ;;
  esac
done
BASE=${1:-}; [ -n "$BASE" ] && shift
[ -z "$BASE" ] || [ $# -eq 0 ] && { echo "craft-suite: usage: craft-suite.sh [--serve cmd] [--a11y] <base-url> <route>..." >&2; exit 2; }

SPID=""
cleanup() { [ -n "$SPID" ] && kill "$SPID" 2>/dev/null; }
trap cleanup EXIT
if [ -n "$SERVE" ]; then
  bash -c "$SERVE" >/dev/null 2>&1 &
  SPID=$!
  UP=0
  for _ in $(seq 1 90); do
    curl -s -o /dev/null --max-time 2 "$BASE" && { UP=1; break; }
    sleep 1
  done
  [ "$UP" = 1 ] || { echo "craft-suite: server never answered at $BASE" >&2; exit 2; }
fi

FAIL=0
slug() { printf '%s' "$1" | tr -c 'A-Za-z0-9' '-' | sed 's/^-*//;s/-*$//'; }
for R in "$@"; do
  for VP in 320x640 768x1024 1280x800; do
    ID="craft-$(slug "$R")-${VP%%x*}"
    "$HERE/capture.sh" "$ID" "${BASE%/}$R" --viewport "$VP" >/dev/null 2>&1
    RC=$?
    # capture.sh exits 3 when its tooling is missing and 4 when the page did
    # not anchor. The first is the machine, the second is the product.
    [ "$RC" = 3 ] && { echo "craft-suite: capture could not run (playwright missing?)" >&2; exit 2; }
    VERDICT=$(node -e '
      const fs=require("fs"); const id=process.argv[1];
      let m, t; try { m=JSON.parse(fs.readFileSync(`.forge/evidence/shots/${id}.meta.json`)).anchor; t=JSON.parse(fs.readFileSync(`.forge/evidence/tree/${id}.json`)) } catch { console.log("no capture written"); process.exit(1) }
      const bad=[];
      if (!m.rendered) bad.push(`navigation: ${m.navError}`);
      for (const e of m.consoleErrors||[]) bad.push(`console: ${e.slice(0,90)}`);
      for (const f of m.failedRequests||[]) bad.push(`request: ${f.slice(0,90)}`);
      if (!m.hasMain) bad.push("no main landmark");
      if (m.horizontalOverflow) bad.push(`horizontal overflow (${t.scrollWidth} > ${t.clientWidth})`);
      const h=t.headingOrder||[]; for (let i=1;i<h.length;i++) if (h[i]>h[i-1]+1) { bad.push(`heading skips h${h[i-1]} to h${h[i]}`); break }
      if ((t.landmarks||{}).h1 === 0) bad.push("no h1");
      console.log(bad.join(" ; ")); process.exit(bad.length?1:0)' "$ID")
    if [ $? -ne 0 ]; then FAIL=1; echo "FAIL  $R @${VP%%x*}  $VERDICT"; else echo "ok    $R @${VP%%x*}"; fi
  done
done

# Source-level disqualifiers, over tracked files only, product code only.
SRC=$(git ls-files 2>/dev/null | grep -Ev '^(\.forge/|node_modules/|.*\.(md|lock)$|.*(test|spec)\.)' )
if [ -n "$SRC" ]; then
  PH=$(printf '%s\n' "$SRC" | xargs grep -nIiE 'lorem ipsum|\bTODO\b|\bFIXME\b|placeholder text' 2>/dev/null | head -5)
  [ -n "$PH" ] && { FAIL=1; echo "FAIL  placeholder or TODO in shipped source:"; printf '      %s\n' "$PH"; } || echo "ok    no placeholder or TODO markers"
  DEB=$(printf '%s\n' "$SRC" | grep -E '(^|/)(probe-[^/]*|[^/]*\.bak|scratch[^/]*)$' | head -5)
  [ -n "$DEB" ] && { FAIL=1; echo "FAIL  verification debris tracked:"; printf '      %s\n' "$DEB"; } || echo "ok    no debris tracked"
  ICON=$(printf '%s\n' "$SRC" | grep -E '(^|/)(favicon\.(ico|svg|png)|icon\.(svg|png)|apple-icon\.png)$' | head -1)
  [ -z "$ICON" ] && { FAIL=1; echo "FAIL  no favicon or app icon tracked"; } || echo "ok    icon: $ICON"
fi

if [ "$A11Y" = 1 ]; then
  node -e "require.resolve('axe-core')" 2>/dev/null || { echo "craft-suite: --a11y needs axe-core (npm i -D axe-core)" >&2; exit 2; }
  BASE="$BASE" node --input-type=module -e '
    import { chromium } from "playwright"
    import { createRequire } from "node:module"
    import { readFileSync } from "node:fs"
    const req = createRequire(process.cwd() + "/")
    const axe = readFileSync(req.resolve("axe-core/axe.min.js"), "utf8")
    const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
    let bad = 0
    for (const r of process.argv.slice(1)) {
      await p.goto(process.env.BASE.replace(/\/$/, "") + r, { waitUntil: "networkidle" })
      await p.addScriptTag({ content: axe })
      const v = await p.evaluate(async () => (await axe.run()).violations.filter(x => ["serious","critical"].includes(x.impact)).map(x => `${x.id} (${x.nodes.length})`))
      if (v.length) { bad = 1; console.log(`FAIL  a11y ${r}: ${v.join(", ")}`) } else console.log(`ok    a11y ${r}`)
    }
    await b.close(); process.exit(bad)' "$@" || FAIL=1
fi

exit $FAIL
