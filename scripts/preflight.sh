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
PROBE=0
[ "${1:-}" = "--probe" ] && PROBE=1
F=.forge/PREFLIGHT.md
[ -f "$F" ] || exit 0

# A value that still carries the shape of the instruction is not a value.
# [YOUR-PASSWORD], <your-key>, YOUR_TOKEN, changeme, xxxx.
placeholder() {
  case "$1" in
    *'['*']'*|*'<'*'>'*|*YOUR_*|*your-*|*CHANGEME*|*changeme*|*xxxx*|*XXXX*) return 0 ;;
  esac
  return 1
}

satisfied() {
  KIND=${1%%:*}
  REST=${1#*:}
  case "$KIND" in
    cmd)
      NAME=${REST%%:*}
      WANT=${REST#*:}
      command -v "$NAME" >/dev/null 2>&1 || { DETAIL="not on PATH"; return 1; }
      # GOT is reduced to its leading integer, so WANT must be too: the compare
      # was only ever major-versus-major. Written with a dot, "cmd:node:20.11"
      # made `[ -lt ]` exit 2 for a bad operand, and `&&` reads status 2 exactly
      # like "new enough", so every version requirement reported satisfied no
      # matter how old the installed tool was.
      WANT=${WANT%%.*}
      case "$WANT" in ''|*[!0-9]*) WANT="" ;; esac
      if [ "$WANT" != "$REST" ] && [ -n "$WANT" ]; then
        GOT=$("$NAME" --version 2>/dev/null | grep -oE '[0-9]+' | head -1)
        case "$GOT" in ''|*[!0-9]*) DETAIL="version unreadable"; return 1 ;; esac
        if [ "$GOT" -lt "$WANT" ]; then DETAIL="found v$GOT, need $WANT+"; return 1; fi
        DETAIL="found v$GOT"
      else
        DETAIL="found"
      fi
      return 0 ;;
    path)
      [ -e "$REST" ] && { DETAIL="present"; return 0; }
      DETAIL="no $REST"; return 1 ;;
    env)
      # A DATABASE_URL that was masked, then unreachable, then unauthenticated
      # reported identically at every step, because the only question asked was
      # whether a value exists. Two things follow.
      #
      # First, a value carrying a literal placeholder is NOT set. Supabase hands
      # out a connection string containing [YOUR-PASSWORD] verbatim, and a
      # project created through the API has a generated password nobody has
      # seen, so there is nothing to substitute and the placeholder ships.
      #
      # Second, this reads THIS MACHINE, under a heading that promises to
      # describe what stands between the run and a live URL. A variable set in
      # a local dotenv says nothing about what the deploy target holds. The
      # detail now says which, so "set" stops meaning four different things.
      eval "V=\${$REST:-}"
      if [ -n "$V" ]; then
        if placeholder "$V"; then DETAIL="placeholder, not a value"; return 1; fi
        DETAIL="set on this machine"; return 0
      fi
      for E in .env.local .env; do
        [ -f "$E" ] || continue
        LINE=$(grep -E "^[[:space:]]*(export[[:space:]]+)?$REST=..*" "$E" 2>/dev/null | head -1)
        [ -n "$LINE" ] || continue
        if placeholder "${LINE#*=}"; then DETAIL="placeholder in $E"; return 1; fi
        DETAIL="set in $E, local only"; return 0
      done
      DETAIL="not set"; return 1 ;;
    remote-env)
      # What the DEPLOY TARGET holds, which is the thing the heading claims to
      # be about. Reports "cannot check" rather than passing when the CLI is
      # absent or unauthenticated, because a check that cannot run must never
      # answer the question it was asked.
      command -v vercel >/dev/null 2>&1 || { DETAIL="vercel CLI absent, cannot check"; return 1; }
      RES=$(vercel env ls production 2>&1) || { DETAIL="not linked or not logged in"; return 1; }
      printf '%s' "$RES" | grep -qE "(^|[[:space:]])$REST([[:space:]]|$)" \
        && { DETAIL="present in the deploy target"; return 0; }
      DETAIL="the deploy target does not hold it"; return 1 ;;
    run)
      # The only kind that tests a PROPERTY rather than a presence: does the
      # thing actually work. `cmd:supabase` passes on the binary existing, which
      # says nothing about being authenticated; `run:supabase projects list`
      # asks the real question.
      #
      # Executed only under --probe, never from the SessionStart report, because
      # a file the architect writes should not run arbitrary commands every time
      # a session opens.
      if [ "${PROBE:-0}" != "1" ]; then DETAIL="not probed, run with --probe"; return 1; fi
      if RES=$(eval "$REST" 2>&1); then DETAIL="ok"; return 0; fi
      DETAIL=$(printf '%s' "$RES" | head -1 | cut -c1-40); return 1 ;;
    *)
      DETAIL="unknown check"; return 1 ;;
  esac
}

OUT=0; TOTAL=0
echo "Before this can reach a live URL"
echo
# `|| [ -n "$LINE" ]` keeps the final line of a file that does not end in a
# newline. Without it that requirement is dropped, never counted, and so can
# never be reported outstanding: the script prints "Nothing is waiting on you"
# precisely when something is. This is the report the operator trusts to be
# complete, and its whole reason for existing is that run one found a missing
# prerequisite too late.
while IFS= read -r LINE || [ -n "$LINE" ]; do
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
  satisfied "$SPEC" && VERDICT=0 || VERDICT=1
  # One line, bounded. A check whose detail spans lines corrupts the report.
  DETAIL=$(printf '%s' "$DETAIL" | tr '\n' ' ' | cut -c1-38)
  if [ "$VERDICT" -eq 0 ]; then
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
