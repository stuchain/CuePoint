#!/usr/bin/env bash
# PostToolUse(Edit|Write): keep Qt out of CuePoint (AGENTS.md, PRUNE-02) as soon as a
# Python file under src/ or scripts/ changes, rather than at CI time.
set -u

HOOK_INPUT=$(cat)
export HOOK_INPUT
. "$(dirname "$0")/lib.sh"

path=$(norm_path "$(json_str file_path)")
case "$path" in
  */src/*.py|*/scripts/*.py) ;;
  *) exit 0 ;;
esac

root="$(repo_root)"
py="$(py_bin)" || exit 0
out=$("$py" "$root/scripts/check_no_qt.py" 2>&1) || {
  emit_block "check_no_qt.py failed after this edit. CuePoint has no Qt, and it must not come back.

$out"
  exit 0
}
exit 0
