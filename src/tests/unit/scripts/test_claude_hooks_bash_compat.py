"""The Claude hooks must run on macOS's bash 3.2.

macOS ships bash 3.2 and will not update it. A hook that uses a bash-4 construct
(``${x,,}`` for one) fails there, and because the hooks swallow their own
failures they silently do nothing. There is no bash 3.2 on the CI runners that
could prove otherwise, so this reads the scripts for the bash-4-only syntax.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

_HOOKS = Path(__file__).resolve().parents[4] / ".claude" / "hooks"

#: Bash 4+ constructs, each with the pattern that finds it.
_BASH4_ONLY = {
    "lowercase expansion ${x,,}": r"\$\{[A-Za-z_][A-Za-z_0-9]*(,,?)\}",
    "uppercase expansion ${x^^}": r"\$\{[A-Za-z_][A-Za-z_0-9]*(\^\^?)\}",
    "associative array (declare/local/typeset -A)": r"\b(declare|local|typeset)\s+-[a-zA-Z]*A",
    "nameref (-n)": r"\b(declare|local|typeset)\s+-[a-zA-Z]*n\b",
    "${x@Q} transform": r"\$\{[A-Za-z_][A-Za-z_0-9]*@[QEPAKa]\}",
    "negative array index": r"\[-[0-9]+\]\}",
    "coproc": r"\bcoproc\b",
    "globstar": r"\bglobstar\b",
    "mapfile": r"\bmapfile\b",
    "readarray": r"\breadarray\b",
    "|& pipe": r"\|&",
    "&>> redirect": r"&>>",
    ";;& case terminator": r";;&",
}


def _code_lines(path: Path):
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.lstrip().startswith("#"):
            yield number, line


def test_there_are_hooks_to_check():
    assert sorted(p.name for p in _HOOKS.glob("*.sh")), "no hooks found"


@pytest.mark.parametrize("hook", sorted(_HOOKS.glob("*.sh")), ids=lambda p: p.name)
def test_a_hook_uses_no_bash_4_only_syntax(hook: Path):
    found = [
        f"{hook.name}:{number}: {what}"
        for number, line in _code_lines(hook)
        for what, pattern in _BASH4_ONLY.items()
        if re.search(pattern, line)
    ]
    assert not found, "bash 4+ syntax breaks on macOS bash 3.2: " + "; ".join(found)


def test_the_checker_catches_what_it_is_for():
    assert re.search(_BASH4_ONLY["lowercase expansion ${x,,}"], 'echo "${p,,}"')
    assert re.search(_BASH4_ONLY["uppercase expansion ${x^^}"], "echo ${p^^}")
    arrays = _BASH4_ONLY["associative array (declare/local/typeset -A)"]
    assert re.search(arrays, "declare -A m")
    assert re.search(arrays, "local -A m")
    assert re.search(_BASH4_ONLY["nameref (-n)"], "local -n ref=x")
    assert re.search(_BASH4_ONLY["${x@Q} transform"], 'echo "${p@Q}"')
    assert re.search(_BASH4_ONLY["negative array index"], 'echo "${a[-1]}"')
    assert not re.search(_BASH4_ONLY["nameref (-n)"], "local name=x")
