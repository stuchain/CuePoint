#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""A library track's artists and label as links to their pages (DISCOVER-11).

The Inspector draws each artist a credit names, and the track's label, as a
link to its page. Which artists a credit names is ``split_credit``'s rule and
which page each opens is DEC-095's, so both are held here, over a real library
built through the real write paths and resolved as DISCOVER-04 resolves it:

- a credit is split as the credit index splits it, remixers included;
- a resolved track links a name to the Beatport id Beatport credits under the
  same key on it, and its label to its Beatport label;
- everything else links by the name's key, which a page follows to an id when
  resolution has linked it since;
- the label is the effective one (DEC-068).
"""

from __future__ import annotations

import pytest

from cuepoint.core.entity_names import name_key
from cuepoint.models.beatport_cache import ENTITY_ARTIST
from cuepoint.models.entity_page import (
    CREDIT_LINK_ROLES,
    MAX_NAME_KEY_LENGTH,
    CreditLink,
    EntityRef,
    TrackCreditLinks,
)
from cuepoint.models.track_credit import CREDIT_ROLES
from cuepoint.persistence.track_credit_repository import TrackCreditRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.track_credit_links import track_credit_links
from tests.unit.persistence.test_library_identity import Library

pytestmark = pytest.mark.unit


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def lib(db) -> Library:
    return Library(db)


def links(lib: Library, ref: str, artist, remixer=None, label=None):
    return track_credit_links(
        TrackCreditRepository(lib.db), lib.numbers[ref], artist, remixer, label
    ).to_dict()


def refs(entries):
    return [(entry["name"], entry["ref"]) for entry in entries]


class TestSplitting:
    def test_one_link_per_artist_the_credit_names(self, lib):
        credit = "Mara Veil, DJEFF feat. Kiko"
        lib.add("t", credit)
        answer = links(lib, "t", credit)
        assert refs(answer["artists"]) == [
            ("Mara Veil", "name:mara veil"),
            ("DJEFF", "name:djeff"),
            ("Kiko", "name:kiko"),
        ]
        assert {entry["role"] for entry in answer["artists"]} == {"artist"}

    def test_an_act_joined_by_an_ampersand_stays_one(self, lib):
        lib.add("t", "Above & Beyond")
        assert refs(links(lib, "t", "Above & Beyond")["artists"]) == [
            ("Above & Beyond", "name:above beyond")
        ]

    def test_remixers_are_linked_with_their_role(self, lib):
        lib.add("t", "Mara Veil", remixer="Kiko, Âme")
        answer = links(lib, "t", "Mara Veil", "Kiko, Âme")
        assert refs(answer["remixers"]) == [("Kiko", "name:kiko"), ("Âme", "name:ame")]
        assert {entry["role"] for entry in answer["remixers"]} == {"remixer"}

    def test_a_blank_credit_links_nobody(self, lib):
        lib.add("t", "")
        assert links(lib, "t", "", None, "  ") == {
            "artists": [],
            "remixers": [],
            "label": None,
        }

    def test_a_name_too_long_to_be_a_reference_is_left_as_text(self, lib):
        long = "x" * (MAX_NAME_KEY_LENGTH + 1)
        lib.add("t", f"Kiko, {long}")
        assert refs(links(lib, "t", f"Kiko, {long}")["artists"]) == [
            ("Kiko", "name:kiko")
        ]


class TestIdentity:
    def test_a_resolved_track_links_the_names_beatport_credits_by_id(self, lib):
        lib.add(
            "t",
            "Mara Veil, Kiko",
            "Nightfall",
            beatport=[(1190547, "Mara Veil")],
            beatport_label=(40211, "Nightfall Audio"),
        )
        answer = links(lib, "t", "Mara Veil, Kiko", None, "Nightfall")
        assert refs(answer["artists"]) == [
            ("Mara Veil", "bp:1190547"),
            ("Kiko", "name:kiko"),
        ]
        assert answer["artists"][0]["identity"] == "beatport"
        assert answer["artists"][1]["identity"] == "name"
        # A label is linked by track, not by spelling: "Nightfall" in the
        # library is on Beatport's "Nightfall Audio" (DISCOVER-07).
        assert (answer["label"]["name"], answer["label"]["ref"]) == (
            "Nightfall",
            "bp:40211",
        )

    def test_a_remixer_beatport_credits_is_linked_by_id(self, lib):
        lib.add(
            "t",
            "Mara Veil",
            beatport=[(1, "Mara Veil")],
            remixers=[(77, "Kiko")],
        )
        answer = links(lib, "t", "Mara Veil", "Kiko")
        assert refs(answer["remixers"]) == [("Kiko", "bp:77")]

    def test_a_key_beatport_credits_twice_on_one_track_links_by_name(self, lib):
        lib.add("t", "Kiko", beatport=[(5, "Kiko"), (6, "KIKO")])
        assert refs(links(lib, "t", "Kiko")["artists"]) == [("Kiko", "name:kiko")]

    def test_a_track_matched_and_not_read_links_by_name(self, lib):
        lib.matched_not_read("t", "Mara Veil", "Nightfall")
        answer = links(lib, "t", "Mara Veil", None, "Nightfall")
        assert refs(answer["artists"]) == [("Mara Veil", "name:mara veil")]
        assert answer["label"]["ref"] == "name:nightfall"

    def test_a_beatport_label_with_no_id_links_by_name(self, lib):
        lib.add(
            "t",
            "Kiko",
            "Cold Room",
            beatport=[(5, "Kiko")],
            beatport_label=(None, "Cold Room"),
        )
        assert links(lib, "t", "Kiko", None, "Cold Room")["label"]["ref"] == (
            "name:cold room"
        )

    def test_the_label_shown_is_the_one_passed_the_effective_one(self, lib):
        lib.add("t", "Kiko", "Imported Label")
        answer = links(lib, "t", "Kiko", None, "Override Label")
        assert (answer["label"]["name"], answer["label"]["ref"]) == (
            "Override Label",
            "name:override label",
        )
        assert answer["label"]["role"] is None and answer["label"]["kind"] == "label"


class TestTheRepositoryRead:
    def test_a_track_not_resolved_has_no_identity(self, lib):
        lib.add("t", "Kiko")
        assert lib.credits.track_identity(lib.numbers["t"]) == ({}, None)

    def test_a_resolved_track_by_key(self, lib):
        lib.add(
            "t",
            "Mara Veil",
            beatport=[(9, "Mara Veil"), (10, "Âme")],
            remixers=[(11, "Kiko")],
            beatport_label=(40211, "Nightfall Audio"),
        )
        assert lib.credits.track_identity(lib.numbers["t"]) == (
            {name_key("Mara Veil"): 9, "ame": 10, "kiko": 11},
            40211,
        )

    def test_a_track_that_is_not_there(self, lib):
        assert lib.credits.track_identity(999) == ({}, None)


class TestTheModel:
    def test_the_roles_are_the_credit_indexs(self):
        assert CREDIT_LINK_ROLES == CREDIT_ROLES

    def test_an_artist_carries_a_role_and_a_label_does_not(self):
        artist = EntityRef(ENTITY_ARTIST, name_key="kiko")
        with pytest.raises(ValueError, match="role"):
            CreditLink(name="Kiko", ref=artist)
        with pytest.raises(ValueError, match="without a role"):
            CreditLink(name="L", ref=EntityRef("label", name_key="l"), role="artist")
        with pytest.raises(ValueError, match="names someone"):
            CreditLink(name=" ", ref=artist, role="artist")

    def test_links_go_to_pages_of_their_own_kind(self):
        label = CreditLink(name="L", ref=EntityRef("label", name_key="l"))
        artist = CreditLink(
            name="Kiko", ref=EntityRef(ENTITY_ARTIST, name_key="kiko"), role="artist"
        )
        with pytest.raises(ValueError, match="artist page"):
            TrackCreditLinks(artists=(label,))
        with pytest.raises(ValueError, match="label page"):
            TrackCreditLinks(label=artist)
        assert TrackCreditLinks(artists=(artist,), label=label).to_dict() == {
            "artists": [
                {
                    "kind": "artist",
                    "name": "Kiko",
                    "role": "artist",
                    "ref": "name:kiko",
                    "identity": "name",
                }
            ],
            "remixers": [],
            "label": {
                "kind": "label",
                "name": "L",
                "role": None,
                "ref": "name:l",
                "identity": "name",
            },
        }
