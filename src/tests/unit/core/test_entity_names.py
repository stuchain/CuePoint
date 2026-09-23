#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""What an artist or a label is, by name (DISCOVER-03, DEC-095).

``name_key`` and ``split_credit`` are the one identity rule the whole of Phase
9 shares, so these tests are about the ways an identity rule goes wrong:

1. **Merging what differs.** A key that dropped every accent would make a
   Japanese "ガ" and "カ" one artist; a split on ``&`` would make "Above &
   Beyond" two.
2. **Losing a name.** A key that dropped non-Latin letters would give every
   Cyrillic artist the same empty key; a featuring rule that fired at the edge
   of a credit would turn "Soft Feat" into "Soft".
3. **Changing silently.** The index built from these records the rule version
   that built it. :data:`PINNED` holds a table of answers to the current
   version, so an edit that changes an answer without bumping
   ``ENTITY_NAMES_VERSION`` fails here rather than leaving every library's
   index built by a rule that no longer exists.
"""

from __future__ import annotations

import pytest

from cuepoint.core import entity_names
from cuepoint.core.entity_names import ENTITY_NAMES_VERSION, name_key, split_credit


class TestNameKey:
    @pytest.mark.parametrize(
        "name, key",
        [
            ("Âme", "ame"),
            ("AME", "ame"),
            ("Ame", "ame"),
            ("Óscar Lindqvist", "oscar lindqvist"),
            ("Straße", "strasse"),
        ],
    )
    def test_case_and_latin_accents_fold(self, name, key):
        assert name_key(name) == key

    @pytest.mark.parametrize(
        "name, key",
        [
            ("Mara-Veil", "mara veil"),
            ("Jay-Z", "jay z"),
            ("Guns N' Roses", "guns n roses"),
            ("D.J. Koze", "d j koze"),
            ("A$AP Rocky", "a ap rocky"),
            ("  Mara   Veil  ", "mara veil"),
        ],
    )
    def test_punctuation_and_symbols_read_as_spaces_and_whitespace_collapses(
        self, name, key
    ):
        assert name_key(name) == key

    def test_cyrillic_keeps_its_letters(self):
        assert name_key("Дельфин") == "дельфин"

    def test_a_cyrillic_letter_with_a_mark_is_not_another_letter(self):
        # "й" decomposes into "и" and a breve; to a reader they are two letters.
        assert name_key("Йога") == "йога"
        assert name_key("Йога") != name_key("Иога")

    def test_japanese_keeps_its_voicing_marks(self):
        # "ガ" decomposes into "カ" and a voicing mark, and they are two sounds.
        assert name_key("ガガガSP") == "ガガガsp"
        assert name_key("ガ") != name_key("カ")

    def test_full_width_letters_are_letters(self):
        assert name_key("ＡＢＣ") == "abc"

    def test_a_letter_that_is_not_an_accented_one_is_kept(self):
        # "ø" is a letter of its own in Danish, not an o with a mark on it.
        assert name_key("MØ") == "mø"

    @pytest.mark.parametrize("name", ["!!!", "…", "***", "+/-"])
    def test_a_name_that_is_only_punctuation_keeps_it(self, name):
        key = name_key(name)
        assert key != ""
        assert key == name_key(name.upper())

    def test_two_punctuation_only_names_stay_two(self):
        assert name_key("!!!") != name_key("***")

    @pytest.mark.parametrize("name", ["", " ", "\t\n"])
    def test_an_empty_name_has_an_empty_key(self, name):
        assert name_key(name) == ""

    @pytest.mark.parametrize(
        "name",
        ["Nightfall Audio Records", "Defected Music", "Dub Phizix", "Original Mix"],
    )
    def test_no_word_is_ever_stripped(self, name):
        # DEC-095: "Records" and "Music" distinguish labels, and "Dub" is part
        # of a name. The matcher's normalize_text would strip these.
        assert name_key(name) == name.lower()

    def test_it_is_idempotent(self):
        for name in ("Âme", "Mara-Veil", "!!!", "Дельфин", "ガガガSP"):
            assert name_key(name_key(name)) == name_key(name)

    def test_it_refuses_what_is_not_text(self):
        with pytest.raises(TypeError):
            name_key(None)  # type: ignore[arg-type]


class TestSplitCredit:
    @pytest.mark.parametrize(
        "credit, names",
        [
            ("A, B", ["A", "B"]),
            ("A,B", ["A", "B"]),
            ("A; B", ["A", "B"]),
            ("  A ,B  ", ["A", "B"]),
            ("A, ", ["A"]),
            (", A", ["A"]),
            ("A,,B", ["A", "B"]),
        ],
    )
    def test_commas_and_semicolons_separate_artists(self, credit, names):
        assert split_credit(credit) == names

    @pytest.mark.parametrize(
        "credit, names",
        [
            ("B feat. D", ["B", "D"]),
            ("B Feat. D", ["B", "D"]),
            ("B feat D", ["B", "D"]),
            ("B ft. D", ["B", "D"]),
            ("B featuring D", ["B", "D"]),
            ("B (feat. D)", ["B", "D"]),
            ("B [ft. D, E]", ["B", "D", "E"]),
            ("A, B feat. C", ["A", "B", "C"]),
            ("Chase & Status feat. Plan B", ["Chase & Status", "Plan B"]),
        ],
    )
    def test_a_featuring_marker_separates_and_is_dropped(self, credit, names):
        assert split_credit(credit) == names

    @pytest.mark.parametrize(
        "credit",
        [
            "Above & Beyond",
            "Chase & Status",
            "Simon and Garfunkel",
            "Kölsch x Tale Of Us",
            "A vs B",
            "AC/DC",
        ],
    )
    def test_an_act_joined_by_and_x_vs_or_slash_stays_one(self, credit):
        # split_artists splits on all of these, which is right for scoring and
        # wrong for identity (DEC-074: err by not grouping — here, by not
        # splitting).
        assert split_credit(credit) == [credit]

    def test_a_list_ending_in_an_ampersand_keeps_the_last_two_together(self):
        # The specification's example "A, B & C" is written as if B were found
        # on its own; the rule it states keeps "B & C" one act, and the rule
        # wins: it is the direction DEC-095 errs in.
        assert split_credit("A, B & C") == ["A", "B & C"]

    def test_ft_without_its_dot_is_part_of_a_name(self):
        assert split_credit("Ft Lauderdale Collective") == ["Ft Lauderdale Collective"]

    @pytest.mark.parametrize("credit", ["Feat Lux", "Soft Feat", "Featuring"])
    def test_a_marker_with_no_artist_on_one_side_is_part_of_a_name(self, credit):
        assert split_credit(credit) == [credit]

    def test_a_bracket_that_belongs_to_a_name_stays(self):
        assert split_credit("Artist (UK), Other") == ["Artist (UK)", "Other"]
        assert split_credit("B (feat. Artist (UK))") == ["B", "Artist (UK)"]

    def test_a_name_listed_twice_is_one_artist(self):
        assert split_credit("A, a, Â") == ["A"]

    def test_names_keep_their_spelling(self):
        assert split_credit("Óscar Lindqvist, MARA VEIL") == [
            "Óscar Lindqvist",
            "MARA VEIL",
        ]

    @pytest.mark.parametrize("credit", ["", "   ", ",", " ; , "])
    def test_a_blank_credit_names_nobody(self, credit):
        assert split_credit(credit) == []

    def test_it_refuses_what_is_not_text(self):
        with pytest.raises(TypeError):
            split_credit(None)  # type: ignore[arg-type]


#: The rule's answers at ``ENTITY_NAMES_VERSION``. If a change to either
#: function changes one of these, bump the version — every library's index is
#: then rebuilt at its next start — and update the table to the new answers.
PINNED_VERSION = 1
PINNED_KEYS = {
    "Âme": "ame",
    "Mara-Veil": "mara veil",
    "!!!": "!!!",
    "Дельфин": "дельфин",
    "ガガガSP": "ガガガsp",
    "ＡＢＣ": "abc",
    "Straße": "strasse",
}
PINNED_SPLITS = {
    "A, B & C": ["A", "B & C"],
    "B (feat. D)": ["B", "D"],
    "Soft Feat": ["Soft Feat"],
    "A; B": ["A", "B"],
}


class TestTheVersion:
    def test_the_pinned_answers_are_this_version_s(self):
        assert ENTITY_NAMES_VERSION == PINNED_VERSION, (
            "ENTITY_NAMES_VERSION changed: update PINNED_KEYS and PINNED_SPLITS "
            "to the new rule's answers and PINNED_VERSION to match"
        )
        assert {name: name_key(name) for name in PINNED_KEYS} == PINNED_KEYS, (
            "name_key's answers changed without ENTITY_NAMES_VERSION changing: "
            "bump it, so every library's index is rebuilt"
        )
        assert {c: split_credit(c) for c in PINNED_SPLITS} == PINNED_SPLITS, (
            "split_credit's answers changed without ENTITY_NAMES_VERSION "
            "changing: bump it, so every library's index is rebuilt"
        )

    def test_it_is_a_positive_whole_number(self):
        assert isinstance(ENTITY_NAMES_VERSION, int) and ENTITY_NAMES_VERSION >= 1

    def test_the_module_imports_nothing_from_cuepoint(self):
        # Every layer uses it — the persistence layer compiles rules with it —
        # so it must not pull in anything that could import back.
        from pathlib import Path

        source = Path(entity_names.__file__).read_text(encoding="utf-8")
        assert "from cuepoint" not in source and "import cuepoint" not in source


class TestTheCacheChangesNoAnswer:
    def test_a_caller_editing_the_list_does_not_edit_the_next_answer(self):
        first = split_credit("A, B")
        first.append("Intruder")
        assert split_credit("A, B") == ["A", "B"]

    def test_repeated_calls_answer_the_same(self):
        for _ in range(3):
            assert name_key("Âme") == "ame"
            assert split_credit("B (feat. D)") == ["B", "D"]

    def test_the_cache_is_bounded(self):
        from cuepoint.core.entity_names import NAME_KEY_CACHE_SIZE

        assert entity_names._cached_name_key.cache_info().maxsize == NAME_KEY_CACHE_SIZE
        assert (
            entity_names._cached_split_credit.cache_info().maxsize
            == NAME_KEY_CACHE_SIZE
        )
