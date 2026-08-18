#!/usr/bin/env bash
# PreToolUse gate on Bash. Five rules, nothing else. Exit 2 blocks the call.
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

echo "$CMD" | grep -Eq 'git +push +.*(--force|-f)\b.*\b(main|master)\b' && deny "no force-push to main"
echo "$CMD" | grep -Eq 'git +branch +-D +(main|master)\b' && deny "no deleting main"
echo "$CMD" | grep -Eq 'rm +(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r) +(/[^ ]*|~[^ ]*|\$HOME)' && deny "no destructive deletes outside the project"
echo "$CMD" | grep -Eq '(cat|cp|scp|curl|wget|base64|nc) +[^|;]*\.env' && deny "no reading or moving secret files"
echo "$CMD" | grep -Eq '(id_rsa|id_ed25519|\.aws/credentials|\.npmrc)' && deny "no touching credentials"
exit 0
