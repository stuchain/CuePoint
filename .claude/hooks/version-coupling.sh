#!/usr/bin/env bash
# PostToolUse(Edit|Write): src/cuepoint/version.py and the desktop package.json
# engine version must move together. Silent drift here is expensive to find later.
set -u

HOOK_INPUT=$(cat)
export HOOK_INPUT
. "$(dirname "$0")/lib.sh"

path=$(norm_path "$(json_str file_path)")
case "$path" in
  */src/cuepoint/version.py|*/apps/desktop-electron/package.json) ;;
  *) exit 0 ;;
esac

root="$(repo_root)"
py="$(py_bin)" || exit 0
out=$("$py" "$root/scripts/check_desktop_version_coupling.py" 2>&1) || {
  emit_block "check_desktop_version_coupling.py failed after this edit. Keep src/cuepoint/version.py and the desktop package.json engine version in sync.

$out"
  exit 0
}
exit 0
