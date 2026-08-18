#!/usr/bin/env bash
# Reads .forge/PREFLIGHT.md and reports what the operator still has to install,
# create, or authorise. Reports; never gates. Exit 0 always.
#
# The architect writes one machine-checkable line per requirement:
#
#   - [ ] cmd:node:20      | Node 20 or newer   | nodejs.org
#   - [ ] cmd:vercel       | Vercel CLI         | npm i -g vercel
#   - [ ] path:.vercel     | Project linked     | vercel link
#   - [ ] env:DATABASE_URL | Neon connection    | neon.tech, then vercel env add
#
# Third field is the remedy and is optional. It prints only when the item is
# outstanding, because a remedy beside a satisfied item reads as work to do.
#
# Written because run one discovered "vercel is not on your PATH" at slice 1,
# hours into a build whose first slice needed a live URL. A prerequisite found
# late is a prerequisite nobody planned for.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
F=.forge/PREFLIGHT.md
[ -f "$F" ] || exit 0

satisfied() {
  KIND=${1%%:*}
  REST=${1#*:}
  case "$KIND" in
    cmd)
      NAME=${REST%%:*}
      WANT=${REST#*:}
      command -v "$NAME" >/dev/null 2>&1 || { DETAIL="not on PATH"; return 1; }
      if [ "$WANT" != "$REST" ] && [ -n "$WANT" ]; then
        GOT=$("$NAME" --version 2>/dev/null | grep -oE '[0-9]+' | head -1)
        [ -z "$GOT" ] && { DETAIL="version unreadable"; return 1; }
        [ "$GOT" -lt "$WANT" ] 2>/dev/null && { DETAIL="found v$GOT, need $WANT+"; return 1; }
        DETAIL="found v$GOT"
      else
        DETAIL="found"
      fi
      return 0 ;;
    path)
      [ -e "$REST" ] && { DETAIL="present"; return 0; }
      DETAIL="no $REST"; return 1 ;;
    env)
      eval "V=\${$REST:-}"
      [ -n "$V" ] && { DETAIL="set in environment"; return 0; }
      for E in .env.local .env; do
        [ -f "$E" ] && grep -qE "^[[:space:]]*(export[[:space:]]+)?$REST=..*" "$E" && {
          DETAIL="set in $E"; return 0; }
      done
      DETAIL="not set"; return 1 ;;
    *)
      DETAIL="unknown check"; return 1 ;;
  esac
}

OUT=0; TOTAL=0
echo "Before this can reach a live URL"
echo
while IFS= read -r LINE; do
  case "$LINE" in
    "- ["*"] "*"|"*) ;;
    *) continue ;;
  esac
  SPEC=$(printf '%s' "$LINE" | sed -E 's/^- \[.\][[:space:]]*//; s/[[:space:]]*\|.*$//')
  LABEL=$(printf '%s' "$LINE" | cut -d'|' -f2 | sed -E 's/^[[:space:]]*//; s/[[:space:]]*$//')
  REMEDY=$(printf '%s' "$LINE" | cut -d'|' -f3- | sed -E 's/^[[:space:]]*//; s/[[:space:]]*$//')
  [ -z "$SPEC" ] && continue
  [ ${#LABEL} -gt 26 ] && LABEL="${LABEL:0:25}."
  TOTAL=$((TOTAL + 1))
  DETAIL=""
  if satisfied "$SPEC"; then
    printf '  [x] %-26s %s\n' "$LABEL" "$DETAIL"
  else
    OUT=$((OUT + 1))
    printf '  [ ] %-26s %-18s %s\n' "$LABEL" "$DETAIL" "$REMEDY"
  fi
done < "$F"

echo
if [ "$OUT" -eq 0 ]; then
  echo "  All $TOTAL satisfied. Nothing is waiting on you."
else
  echo "  $OUT of $TOTAL outstanding. These gate the live URL, not the code."
fi
exit 0
