#!/usr/bin/env bash
# PreToolUse gate on Bash. Five rules, nothing else. Exit 2 blocks the call.
#
# This is the most frequently fired thing in the harness. Bash was 77 to 78 per
# cent of all tool calls across the vitrine build, roughly ten thousand fires,
# so every millisecond here is paid ten thousand times. The five rules below
# were five `echo | grep` pipes, which is ten processes per fire on top of the
# interpreter; they are now bash regex matches, which are builtins and spawn
# nothing. The rules themselves are the same five, and the denylist stays five.
#
# Note for whoever edits this file next: these rules match the RAW COMMAND TEXT,
# so a heredoc that writes the credential patterns is itself blocked by rule
# five. That is the gate working. Edit this file with the file tools, not by
# echoing it through a shell.
INPUT=$(cat)
CMD=""
if command -v python3 >/dev/null 2>&1; then
  CMD=$(printf '%s' "$INPUT" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
fi
# An empty CMD used to mean both "the payload carried no command" and "I could
# not parse the payload", and both allowed the call. So one missing interpreter
# turned all five rules off, on a machine that looks fine, with no output
# anywhere. Stock macOS without the Xcode command line tools ships a python3
# stub that does exactly this. A safety gate fails CLOSED: when there is a
# payload but no usable parse, match the rules against the raw text instead.
if [ -z "$CMD" ] && [ -n "$INPUT" ]; then
  CMD=$INPUT
  echo "forge guard: payload unparsed, matching rules against the raw text" >&2
fi
[ -z "$CMD" ] && exit 0

deny() { echo "forge guard: $1" >&2; exit 2; }

# Bash regex is ERE and carries no \b. BSD and GNU disagree on the alternatives,
# so each word boundary is written as an explicit character class, which behaves
# the same on both. Patterns live in variables because an unquoted regex on the
# right of =~ is what bash wants, and a literal there would need escaping that
# differs again between shells.
B='([^A-Za-z0-9_]|$)'
R1="git[[:space:]]+push[[:space:]].*(--force|-f)$B.*(main|master)$B"
R2="git[[:space:]]+branch[[:space:]]+-D[[:space:]]+(main|master)$B"
R3='rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)[[:space:]]+(/[^ ]*|~[^ ]*|\$HOME)'
R4='(cat|cp|scp|curl|wget|base64|nc)[[:space:]]+[^|;]*\.env'
R5='(id_'"rsa"'|id_'"ed25519"'|\.aws/'"credentials"'|\.'"npmrc"')'

[[ $CMD =~ $R1 ]] && deny "no force-push to main"
[[ $CMD =~ $R2 ]] && deny "no deleting main"
[[ $CMD =~ $R3 ]] && deny "no destructive deletes outside the project"
[[ $CMD =~ $R4 ]] && deny "no reading or moving secret files"
[[ $CMD =~ $R5 ]] && deny "no touching credentials"

# Per-project additions live in .forge/overrides/guard-deny, one extended regex
# per line. A project that needs a sixth rule adds it there rather than editing
# this file, which is what keeps this copy hash-clean and therefore syncable.
# The shipped denylist stays five; overrides only ever ADD.
OVR="${CLAUDE_PROJECT_DIR:-.}/.forge/overrides/guard-deny"
if [ -f "$OVR" ]; then
  while IFS= read -r rule; do
    case "$rule" in ''|'#'*) continue ;; esac
    [[ $CMD =~ $rule ]] && deny "denied by .forge/overrides/guard-deny"
  done < "$OVR"
fi
exit 0
