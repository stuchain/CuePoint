# Shared helpers for CuePoint's Claude Code hooks. Sourced, not executed.
# There is no jq on the supported dev machines, so payload fields are pulled out
# with a regex plus bash string ops rather than a real JSON parser. Only flat
# string fields are read, so that trade is safe here.

repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || pwd
}

# json_str FIELD -- reads $HOOK_INPUT, prints the first matching string value.
json_str() {
  local chunk v
  chunk=$(printf '%s' "${HOOK_INPUT:-}" \
    | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"(\\\\.|[^\"\\\\])*\"" \
    | head -n 1)
  [ -n "$chunk" ] || return 0
  v=${chunk#*:}
  v=${v#"${v%%[![:space:]]*}"}
  v=${v#\"}
  v=${v%\"}
  v=${v//\\\\/$'\x01'}
  v=${v//\\\"/\"}
  v=${v//\\n/$'\n'}
  v=${v//$'\x01'/\\}
  printf '%s' "$v"
}

# Normalize a Windows or POSIX path to lowercase forward slashes for matching.
norm_path() {
  local p=${1//\\//}
  printf '%s' "${p,,}"
}

py_bin() {
  local root c
  root="$(repo_root)"
  for c in "$root/.venv/Scripts/python.exe" "$root/.venv/bin/python"; do
    if [ -x "$c" ]; then printf '%s' "$c"; return 0; fi
  done
  command -v python 2>/dev/null && return 0
  command -v py 2>/dev/null && return 0
  return 1
}

# emit_block REASON -- feed REASON back to the model instead of failing silently.
emit_block() {
  local r=$1
  r=${r//\\/\\\\}
  r=${r//\"/\\\"}
  r=${r//$'\n'/\\n}
  printf '{"decision":"block","reason":"%s"}\n' "$r"
}
