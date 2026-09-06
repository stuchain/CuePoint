#!/usr/bin/env bash
# PostToolUse(Edit|Write): enforce the "no Qt in core" invariant from AGENTS.md
# as soon as a Python file under src/cuepoint/ changes, rather than at CI time.
set -u

HOOK_INPUT=$(cat)
export HOOK_INPUT
. "$(dirname "$0")/lib.sh"

path=$(norm_path "$(json_str file_path)")
case "$path" in
  */src/cuepoint/*.py|*/src/gui_app.py) ;;
  *) exit 0 ;;
esac

root="$(repo_root)"
py="$(py_bin)" || exit 0
out=$("$py" "$root/scripts/check_no_qt_in_core.py" 2>&1) || {
  emit_block "check_no_qt_in_core.py failed after this edit. Qt must not enter core, engine, CLI, or services.

$out"
  exit 0
}
exit 0
