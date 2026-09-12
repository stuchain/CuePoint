#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The filter bar must be able to build every clause the engine offers (ORG-12).

DEC-043 put the filter vocabulary in the engine so a renderer could not offer a
clause the engine refuses. ORG-12 closes the other half of that bargain: the
engine must not offer a field the renderer cannot build. Between ORG-05 and
ORG-12 it did — the engine described ``tag``, ``collection`` and ``favorite``
and the bar dropped all three — which was honest while there were no controls
for them and would be a feature nobody can reach now.

Neither side can import the other, so this compares the two as text:

* A **field kind** the engine describes and ``filterText.ts`` has no branch for
  falls through to the free-text path, which sends a tag's *name* where the
  engine wants its id. The user sees an empty table and a clause that looks
  right.
* An **operator** the engine allows and the label table has no word for is
  rendered as its identifier, so a chip reads ``Tag not_has_tag Peak-time``.
* A **unit** is the engine's answer to "what do these numbers mean". A renderer
  that decided for itself which fields were ratings would draw stars beside a
  field this registry had moved on from.
* A **limit** that is too generous turns a refusal the dialog could have made
  into a round trip that fails after the name was typed.

Same class of check as ``test_inspector_field_contract``, and here for the same
reason: the renderer's Vitest suite cannot reach into ``src/cuepoint``.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from cuepoint.models.collection import MAX_COLLECTION_NAME_LENGTH
from cuepoint.models.filter_rule import (
    FIELD_TYPES,
    FIELDS,
    OPERATORS_BY_TYPE,
    TYPE_NUMBER,
    UNIT_STARS,
    describe_fields,
)
from cuepoint.models.tag import (
    MAX_TAG_CATEGORY_LENGTH,
    MAX_TAG_NAME_LENGTH,
    TAG_COLOURS,
)
from cuepoint.models.track_metadata import MAX_RATING

# src/tests/unit/engine -> 4 levels up is the repository root
_REPO_ROOT = Path(__file__).resolve().parents[4]
_LIBRARY = (
    _REPO_ROOT
    / "apps"
    / "desktop-electron"
    / "renderer"
    / "src"
    / "screens"
    / "library"
)
_FILTER_TEXT = _LIBRARY / "filterText.ts"
_SMART_FILTER = _LIBRARY / "smartFilter.ts"
_TAG_MANAGER = _LIBRARY / "tagManager.ts"
_FILTER_BAR = _LIBRARY / "FilterBar.tsx"


def _read(path: Path) -> str:
    assert path.is_file(), f"Renderer module moved: {path}"
    return path.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def filter_text() -> str:
    """``filterText.ts`` as text: a ``.ts`` file cannot be imported."""
    return _read(_FILTER_TEXT)


@pytest.fixture(scope="module")
def filter_bar() -> str:
    """``FilterBar.tsx`` as text."""
    return _read(_FILTER_BAR)


@pytest.fixture(scope="module")
def smart_filter() -> str:
    """``smartFilter.ts`` as text."""
    return _read(_SMART_FILTER)


@pytest.fixture(scope="module")
def tag_manager() -> str:
    """``tagManager.ts`` as text."""
    return _read(_TAG_MANAGER)


def _number(source: str, name: str) -> int:
    """The value of one exported numeric constant."""
    match = re.search(rf"export const {name} = ([0-9_]+);", source)
    assert match is not None, f"{name} is no longer declared"
    return int(match.group(1).replace("_", ""))


def _operator_labels(source: str) -> set:
    """Every operator the label table has a word for."""
    block = re.search(
        r"const OPERATOR_LABELS: Record<string, string> = \{(.*?)\n\};",
        source,
        re.DOTALL,
    )
    assert block is not None, "OPERATOR_LABELS is no longer a literal object"
    return set(re.findall(r"^\s*([a-z_]+):", block.group(1), re.MULTILINE))


class TestEveryFieldKindHasAControl:
    """No field the engine offers is missing from the bar."""

    def test_the_bar_branches_on_every_kind_the_engine_declares(
        self, filter_bar: str, filter_text: str
    ) -> None:
        # `text` and `date` share the free-text control, which is the fallback
        # every branch falls through to, so they are satisfied by that rather
        # than by a branch of their own.
        branching = filter_bar + filter_text
        for kind in FIELD_TYPES:
            if kind in ("text", "date"):
                continue
            assert f'"{kind}"' in branching, (
                f"The engine describes a {kind!r} field and the bar has no "
                "control for it, so it would send whatever was typed"
            )

    def test_a_membership_field_is_built_as_an_id(self, filter_text: str) -> None:
        # The engine's `_coerce_id` refuses anything else. A renderer that sent
        # a name would produce an empty table and no explanation.
        membership = {spec.type for spec in FIELDS if spec.is_membership}
        assert membership == {"tag", "collection"}
        for kind in membership:
            assert f'field?.type === "{kind}"' in filter_text

    def test_the_bar_offers_the_whole_field_list(self, filter_text: str) -> None:
        # `buildableFields` used to filter the list down to the kinds the bar
        # had controls for. It must not filter it any more.
        body = re.search(
            r"export function buildableFields\((.*?)\n\}", filter_text, re.DOTALL
        )
        assert body is not None
        assert ".filter(" not in body.group(1), (
            "buildableFields filters the vocabulary again, which is how a "
            "field the engine offers goes missing from the bar"
        )


class TestOperatorsAreAllNamed:
    """Every operator any field allows reads as words on a chip."""

    def test_every_operator_has_a_label(self, filter_text: str) -> None:
        labels = _operator_labels(filter_text)
        for operators in OPERATORS_BY_TYPE.values():
            for operator in operators:
                assert operator in labels, f"No word for the {operator!r} operator"

    def test_no_label_is_the_identifier_itself(self, filter_text: str) -> None:
        # `not_has_tag` on a chip is a leak of the wire format.
        block = re.search(
            r"const OPERATOR_LABELS: Record<string, string> = \{(.*?)\n\};",
            filter_text,
            re.DOTALL,
        )
        assert block is not None
        for name, label in re.findall(
            r"^\s*([a-z_]+): \"([^\"]+)\",", block.group(1), re.M
        ):
            assert "_" not in label, f"{name!r} is labelled with its identifier"


class TestTheUnitIsTheEnginesToDeclare:
    """What a number means comes from the field list, not from a field name."""

    def test_the_renderer_uses_the_engine_s_token(self, filter_text: str) -> None:
        match = re.search(r'export const UNIT_STARS = "([a-z]+)";', filter_text)
        assert match is not None, "UNIT_STARS is no longer declared"
        assert match.group(1) == UNIT_STARS

    def test_stars_are_decided_by_the_unit_and_not_by_a_name(
        self, filter_text: str
    ) -> None:
        # A renderer holding a list of rating field names would draw a number
        # box beside a fourth layer the day one is added.
        body = re.search(r"export function isStars\((.*?)\n\}", filter_text, re.DOTALL)
        assert body is not None
        assert "unit" in body.group(1)
        for spec in FIELDS:
            if spec.unit == UNIT_STARS:
                assert f'"{spec.name}"' not in body.group(1)

    def test_every_rating_layer_is_stars(self) -> None:
        # DEC-057's two layers and the effective value. One control for the
        # three is the whole reason the unit exists.
        starred = {spec.name for spec in FIELDS if spec.unit == UNIT_STARS}
        assert starred == {"rating", "rating_rekordbox", "cuepoint_rating"}

    def test_a_unit_is_only_ever_given_to_a_number(self) -> None:
        for spec in FIELDS:
            if spec.unit is not None:
                assert spec.type == TYPE_NUMBER

    def test_the_vocabulary_sends_the_unit_for_every_field(self) -> None:
        # Always present, null included: a key a renderer has to test for is a
        # key a renderer forgets to test for.
        for described in describe_fields():
            assert "unit" in described

    def test_there_are_as_many_stars_as_the_engine_allows(
        self, filter_text: str
    ) -> None:
        assert _number(filter_text, "RATING_STARS") == MAX_RATING


class TestLimitsMatch:
    """A dialog refuses before the engine does, at the same number."""

    def test_a_smart_collection_name_is_the_length_the_engine_accepts(
        self, smart_filter: str
    ) -> None:
        assert (
            _number(smart_filter, "SMART_NAME_MAX_LENGTH") == MAX_COLLECTION_NAME_LENGTH
        )

    def test_a_tag_name_is_the_length_the_engine_accepts(
        self, tag_manager: str
    ) -> None:
        assert _number(tag_manager, "TAG_NAME_MAX_LENGTH") == MAX_TAG_NAME_LENGTH

    def test_a_tag_category_is_the_length_the_engine_accepts(
        self, tag_manager: str
    ) -> None:
        assert (
            _number(tag_manager, "TAG_CATEGORY_MAX_LENGTH") == MAX_TAG_CATEGORY_LENGTH
        )


class TestTagColoursMatch:
    """The manager offers the colours the engine stores, and only those."""

    def test_the_colours_are_the_engines(self, tag_manager: str) -> None:
        # `normalize_tag_colour` refuses anything else, so a colour the picker
        # offers and the engine does not know is a save that always fails.
        match = re.search(
            r"export const TAG_COLOURS = \[(.*?)\] as const;", tag_manager, re.DOTALL
        )
        assert match is not None, "TAG_COLOURS is no longer a literal array"
        offered = tuple(re.findall(r'"([a-z]+)"', match.group(1)))
        assert offered == TAG_COLOURS

    def test_a_colour_is_painted_from_a_theme_token(self, tag_manager: str) -> None:
        # The engine stores a token rather than a hex value precisely so a tag
        # is the right red in every theme.
        assert "var(--accent-${colour})" in tag_manager
