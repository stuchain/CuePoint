#!/usr/bin/env bash
# PostToolUse(Edit|Write): run the repo's own lint gates against the one file that
# just changed, so failures surface at edit time instead of in CI.
#
# Formatting is applied (ruff format is deterministic and matches the CI gate).
# Lint violations are reported back rather than auto-fixed, so the fix stays a
# deliberate edit and not a silent rewrite.
set -u

HOOK_INPUT=$(cat)
export HOOK_INPUT
. "$(dirname "$0")/lib.sh"

raw=$(json_str file_path)
[ -n "$raw" ] || exit 0
path=$(norm_path "$raw")

case "$path" in
  */.venv/*|*/node_modules/*|*/build/*|*/dist/*|*/electron-dist/*|*/release/*|*/output/*) exit 0 ;;
esac

root="$(repo_root)"

case "$path" in
  *.py)
    ruff="$root/.venv/Scripts/ruff.exe"
    [ -x "$ruff" ] || ruff="$root/.venv/bin/ruff"
    [ -x "$ruff" ] || ruff=$(command -v ruff) || exit 0
    "$ruff" format -q "$raw" >/dev/null 2>&1
    out=$("$ruff" check "$raw" 2>&1) || {
      emit_block "ruff check reports violations in the file just edited:

$out"
    }
    ;;
  */apps/desktop-electron/renderer/*.ts|*/apps/desktop-electron/renderer/*.tsx)
    rdir="$root/apps/desktop-electron/renderer"
    ox="$rdir/node_modules/.bin/oxlint"
    [ -x "$ox" ] || exit 0
    out=$(cd "$rdir" && "$ox" -D correctness "$raw" 2>&1) || {
      emit_block "oxlint -D correctness reports violations in the file just edited (this fails the build, not just warns):

$out"
    }
    ;;
esac
exit 0
