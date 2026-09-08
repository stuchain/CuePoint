#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Every design token a renderer stylesheet names has to exist (ORG-10).

A ``var(--border-subtle)`` that nothing defines is not a compile error, not a
lint error, and not a visible one either. The declaration holding it is thrown
away at computed-value time, so a border simply vanishes or inherits and the
page looks *nearly* right in whichever theme the author happened to be looking
at. ORG-09 shipped four of them — ``--border-subtle``, ``--fg-secondary``,
``--bg-elevated`` and ``--bg-base`` — all plausible names, none of them in
``tokens.css`` or in any theme, and every one invisible to TypeScript, to
oxlint, to the production build and to every component test.

This check lives in the Python suite for the reason ``test_browse_sort_contract``
gives: the renderer deliberately has no Node types, so a Vitest file cannot read
files off disk, and Vite's SSR pipeline hands back an empty string for a CSS
import however it is queried. Reading the stylesheets as text from here is the
one place the question can actually be asked.

A ``var(--x, fallback)`` is deliberately not checked. Naming a token that may
not exist and saying what to do instead is a different, correct thing.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Set

import pytest

# src/tests/unit -> 3 levels up is the repository root
_REPO_ROOT = Path(__file__).resolve().parents[3]
_RENDERER = _REPO_ROOT / "apps" / "desktop-electron" / "renderer" / "src"

#: ``--name:`` — a token being given a value.
_DECLARED = re.compile(r"(--[A-Za-z0-9-]+)\s*:")

#: ``var(--name)`` with nothing after it. A fallback makes it a different question.
_USED = re.compile(r"var\(\s*(--[A-Za-z0-9-]+)\s*\)")

#: ``"--name"`` in a module — a custom property a component sets itself, which
#: is how the track table's computed grid template is legitimately absent from
#: every stylesheet.
_SET_IN_CODE = re.compile(r"[\"'](--[A-Za-z0-9-]+)[\"']")


def _stylesheets() -> List[Path]:
    return sorted(_RENDERER.rglob("*.css"))


def _modules() -> List[Path]:
    return [
        path
        for pattern in ("*.ts", "*.tsx")
        for path in _RENDERER.rglob(pattern)
        if ".test." not in path.name
    ]


@pytest.fixture(scope="module")
def defined_tokens() -> Set[str]:
    """Every token name a stylesheet declares or a component sets."""
    names: Set[str] = set()
    for path in _stylesheets():
        names.update(_DECLARED.findall(path.read_text(encoding="utf-8")))
    for path in _modules():
        names.update(_SET_IN_CODE.findall(path.read_text(encoding="utf-8")))
    return names


@pytest.fixture(scope="module")
def used_tokens() -> Dict[str, List[str]]:
    """Every unguarded ``var(--name)``, and the stylesheets that wrote it."""
    uses: Dict[str, List[str]] = {}
    for path in _stylesheets():
        where = str(path.relative_to(_REPO_ROOT))
        for name in _USED.findall(path.read_text(encoding="utf-8")):
            uses.setdefault(name, []).append(where)
    return uses


class TestRendererCssTokens:
    """The renderer's stylesheets name tokens that exist."""

    def test_the_stylesheets_are_actually_found(self) -> None:
        """A check that reads nothing passes for the wrong reason."""
        sheets = _stylesheets()
        assert len(sheets) > 20
        assert any(path.name == "tokens.css" for path in sheets)

    def test_something_is_being_checked(
        self, used_tokens: Dict[str, List[str]]
    ) -> None:
        """The regex still matches the way the stylesheets are written."""
        assert len(used_tokens) > 20
        assert "--space-sm" in used_tokens

    def test_every_named_token_is_defined_somewhere(
        self, defined_tokens: Set[str], used_tokens: Dict[str, List[str]]
    ) -> None:
        """No stylesheet names a token nothing gives a value to."""
        missing = {
            name: sorted(set(files))
            for name, files in used_tokens.items()
            if name not in defined_tokens
        }
        assert missing == {}, (
            "These custom properties are used with no fallback and never "
            f"defined, so the declarations holding them do nothing: {missing}"
        )

    def test_every_theme_defines_the_same_palette(self) -> None:
        """A token one theme has and another does not is a theme-shaped hole.

        The base sheet holds the sizes and the themes hold the colours, so the
        themes are compared with each other rather than with ``tokens.css``.
        """
        themes = sorted((_RENDERER / "tokens" / "themes").glob("*.css"))
        assert len(themes) >= 2

        palettes = {
            path.name: set(_DECLARED.findall(path.read_text(encoding="utf-8")))
            for path in themes
        }
        every = set().union(*palettes.values())
        gaps = {
            name: sorted(every - palette)
            for name, palette in palettes.items()
            if palette != every
        }
        assert gaps == {}, f"Themes missing tokens the others define: {gaps}"
