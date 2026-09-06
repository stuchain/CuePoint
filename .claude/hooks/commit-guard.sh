#!/usr/bin/env bash
# PreToolUse(Bash): refuse commits and PR bodies that carry AI attribution traces,
# and hold commit subjects to the repo's Conventional Commits, one-line rule.
#
# This is the mechanical backstop for the standing rule in ~/.claude/CLAUDE.md.
set -u

HOOK_INPUT=$(cat)
export HOOK_INPUT
. "$(dirname "$0")/lib.sh"

cmd=$(json_str command)
[ -n "$cmd" ] || exit 0

deny() {
  local r=$1
  r=${r//\\/\\\\}
  r=${r//\"/\\\"}
  r=${r//$'\n'/\\n}
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$r"
  exit 0
}

case "$cmd" in
  *"git commit"*|*"git tag"*|*"gh pr create"*|*"gh pr edit"*) ;;
  *) exit 0 ;;
esac

# 1. Attribution traces -- never allowed, in any of these commands.
if printf '%s' "$cmd" | grep -qiE 'co-authored-by:[[:space:]]*claude|noreply@anthropic\.com|generated with .{0,20}claude code|claude\.com/claude-code|🤖'; then
  deny "This message carries an AI attribution trace (Co-Authored-By: Claude, a Generated with Claude Code line, an anthropic.com address, or a robot emoji). The standing rule in ~/.claude/CLAUDE.md forbids these in commits, tags and PR bodies. Rewrite the message without it and retry."
fi

# 2. Commit subject shape. Only checked when a -m value is cleanly extractable,
#    so -F/--file and heredoc forms pass through untouched.
case "$cmd" in
  *"git commit"*)
    msg=""
    case "$cmd" in
      *' -m "'*) rest=${cmd#*-m \"}; msg=${rest%%\"*} ;;
      *" -m '"*) rest=${cmd#*-m \'}; msg=${rest%%\'*} ;;
    esac
    [ -n "$msg" ] || exit 0

    case "$msg" in
      *$'\n'*)
        deny "Commit messages in this repo are one-liners: a single Conventional Commits subject, no body. Put the detail in the PR description, design docs, or your chat response instead."
        ;;
    esac
    if ! printf '%s' "$msg" | grep -qE '^(feat|fix|refactor|test|docs|build|chore|ci|perf|style|revert)(\([^)]+\))?!?: .'; then
      deny "Commit subject must start with a Conventional Commits prefix (feat:, fix:, refactor:, test:, docs:, build:, chore:, ci:). Got: $msg"
    fi
    ;;
esac
exit 0
