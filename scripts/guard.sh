#!/usr/bin/env bash
# PreToolUse gate on Bash. Five rules, nothing else. Exit 2 blocks the call.
INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
[ -z "$CMD" ] && exit 0

deny() { echo "forge guard: $1" >&2; exit 2; }

echo "$CMD" | grep -Eq 'git +push +.*(--force|-f)\b.*\b(main|master)\b' && deny "no force-push to main"
echo "$CMD" | grep -Eq 'git +branch +-D +(main|master)\b' && deny "no deleting main"
echo "$CMD" | grep -Eq 'rm +(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r) +(/[^ ]*|~[^ ]*|\$HOME)' && deny "no destructive deletes outside the project"
echo "$CMD" | grep -Eq '(cat|cp|scp|curl|wget|base64|nc) +[^|;]*\.env' && deny "no reading or moving secret files"
echo "$CMD" | grep -Eq '(id_rsa|id_ed25519|\.aws/credentials|\.npmrc)' && deny "no touching credentials"
exit 0
