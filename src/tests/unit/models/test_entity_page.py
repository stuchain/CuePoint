#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""An Artist or Label page's models (DISCOVER-07, DEC-094, DEC-095).

A reference parses and renders round trip; every model refuses what a page
could not draw; and the Beatport half's states are DISCOVER-01's error classes
plus the two a page adds.
"""

from __future__ import annotations

import pytest

from cuepoint.models.beatport_cache import MAX_BEATPORT_ID
from cuepoint.models.beatport_listing import BeatportListing
from cuepoint.models.entity_page import (
    ACTION_RESOLVE,
    ACTION_SETTINGS,
    BEATPORT_STATES,
    IDENTITY_BEATPORT,
    IDENTITY_NAME,
    MAX_NAME_KEY_LENGTH,
    NAME_ONLY_REASONS,
    REASON_SHARED,
    STATE_NAME_ONLY,
    STATE_NO_TOKEN,
    STATE_OK,
    EntityBeatportHalf,
    EntityLibrarySummary,
    EntityPage,
    EntityRef,
    EntityResolution,
    EntityTrackRow,
    EntityTracksPage,
    LinkedEntity,
    LinkedName,
    parse_entity_ref,
)
from cuepoint.models.filter_rule import Facet, FacetValue, FilterRule, RuleSet
from cuepoint.services.beatport_api_client import BEATPORT_ERROR_CLASSES
from cuepoint.services.beatport_ownership import (
    MAX_BEATPORT_ID as OWNERSHIP_MAX_BEATPORT_ID,
)
from tests.fixtures.beatport_library import NOW, catalog_track

pytestmark = pytest.mark.unit


def _cached(beatport_id: int = 5):
    from cuepoint.persistence.beatport_catalog_repository import catalog_rows

    return catalog_rows(catalog_track(beatport_id), NOW)[0]


def _rules() -> RuleSet:
    return RuleSet(rules=(FilterRule("artist_name", "is", "Âme"),))


class TestReferences:
    @pytest.mark.parametrize(
        "kind, token",
        [
            ("artist", "bp:1190547"),
            ("label", "bp:1"),
            ("artist", "name:ame"),
            ("label", "name:nightfall audio"),
            ("artist", "name:!!!"),
            ("artist", "name:дельфин"),
            ("label", f"bp:{MAX_BEATPORT_ID}"),
        ],
    )
    def test_a_reference_renders_as_it_was_written(self, kind, token):
        ref = parse_entity_ref(kind, token)
        assert ref.token == token
        assert parse_entity_ref(kind, ref.token) == ref

    @pytest.mark.parametrize(
        "ref",
        [
            EntityRef("artist", beatport_id=7),
            EntityRef("label", name_key="toolroom records"),
        ],
    )
    def test_a_reference_parses_back_to_itself(self, ref):
        assert parse_entity_ref(ref.kind, ref.token) == ref

    def test_the_identity_says_which_it_is(self):
        assert EntityRef("artist", beatport_id=7).identity == IDENTITY_BEATPORT
        assert EntityRef("artist", name_key="ame").identity == IDENTITY_NAME

    def test_surrounding_space_is_not_part_of_a_reference(self):
        assert parse_entity_ref("label", "  bp:12 ") == EntityRef(
            "label", beatport_id=12
        )
        assert parse_entity_ref("label", "name: ame ") == EntityRef(
            "label", name_key="ame"
        )

    @pytest.mark.parametrize(
        "token",
        [
            "bp:",
            "bp:0",
            "bp:012",
            "bp:-3",
            "bp:+3",
            "bp:1.5",
            "bp:12a",
            "bp:١٢",  # Arabic-Indic digits: digits, but not ASCII ones
            f"bp:{MAX_BEATPORT_ID + 1}",
            "name:",
            "name:   ",
            "ame",
            "id:12",
            "",
            None,
            12,
        ],
    )
    def test_a_reference_that_is_not_one_is_refused(self, token):
        with pytest.raises(ValueError):
            parse_entity_ref("artist", token)

    def test_a_kind_that_is_neither_is_refused(self):
        with pytest.raises(ValueError):
            parse_entity_ref("genre", "bp:3")

    def test_a_reference_is_an_id_or_a_name_and_not_both(self):
        with pytest.raises(ValueError):
            EntityRef("artist")
        with pytest.raises(ValueError):
            EntityRef("artist", beatport_id=3, name_key="ame")

    @pytest.mark.parametrize("value", [True, 0, -1, 1.0, "3"])
    def test_an_id_is_a_positive_whole_number(self, value):
        with pytest.raises(ValueError):
            EntityRef("artist", beatport_id=value)

    def test_a_name_key_is_bounded(self):
        EntityRef("artist", name_key="a" * MAX_NAME_KEY_LENGTH)
        with pytest.raises(ValueError):
            EntityRef("artist", name_key="a" * (MAX_NAME_KEY_LENGTH + 1))

    def test_a_name_key_carries_no_surrounding_space(self):
        with pytest.raises(ValueError):
            EntityRef("artist", name_key=" ame")

    def test_the_serialized_reference_names_both_forms(self):
        assert EntityRef("label", beatport_id=9).to_dict() == {
            "kind": "label",
            "ref": "bp:9",
            "identity": "beatport",
            "beatport_id": 9,
            "name_key": None,
        }

    def test_one_largest_id_is_shared_by_the_models_and_the_ownership_rule(self):
        assert MAX_BEATPORT_ID == OWNERSHIP_MAX_BEATPORT_ID == 2**63 - 1


class TestResolution:
    def test_a_redirected_resolution_says_what_was_asked(self):
        resolution = EntityResolution(
            ref=EntityRef("artist", beatport_id=7),
            requested=EntityRef("artist", name_key="ame"),
            name="Âme",
            rules=_rules(),
            names=(LinkedName("ame", "Âme", 3),),
        )
        assert resolution.redirected
        data = resolution.to_dict()
        assert data["ref"] == "bp:7"
        assert data["redirected_from"] == "name:ame"
        assert data["names"] == [{"name_key": "ame", "name": "Âme", "tracks": 3}]
        assert data["rules"] == _rules().to_dict()

    def test_an_unredirected_one_does_not(self):
        ref = EntityRef("artist", name_key="twin")
        resolution = EntityResolution(
            ref=ref,
            requested=ref,
            name="Twin",
            rules=_rules(),
            links=(LinkedEntity(300, "Twin", 1), LinkedEntity(301, "Twin", 1)),
        )
        assert not resolution.redirected
        data = resolution.to_dict()
        assert data["redirected_from"] is None
        assert [link["ref"] for link in data["links"]] == ["bp:300", "bp:301"]

    def test_an_id_page_has_no_links_and_a_name_page_gathers_no_names(self):
        with pytest.raises(ValueError):
            EntityResolution(
                ref=EntityRef("artist", beatport_id=7),
                requested=EntityRef("artist", beatport_id=7),
                name=None,
                rules=_rules(),
                links=(LinkedEntity(7, None, 1),),
            )
        with pytest.raises(ValueError):
            EntityResolution(
                ref=EntityRef("artist", name_key="ame"),
                requested=EntityRef("artist", name_key="ame"),
                name=None,
                rules=_rules(),
                names=(LinkedName("ame", "Ame", 1),),
            )

    def test_a_reference_resolves_to_the_same_kind(self):
        with pytest.raises(ValueError):
            EntityResolution(
                ref=EntityRef("label", beatport_id=7),
                requested=EntityRef("artist", name_key="ame"),
                name=None,
                rules=_rules(),
            )

    def test_a_link_is_a_real_id(self):
        with pytest.raises(ValueError):
            LinkedEntity(0, "x", 1)
        with pytest.raises(ValueError):
            LinkedEntity(3, "x", -1)


class TestSummary:
    def _facet(self, field: str) -> Facet:
        return Facet(field=field, values=(FacetValue("House", 3),), total_values=1)

    def test_it_serializes_every_fact(self):
        summary = EntityLibrarySummary(
            tracks=3,
            first_year=2019,
            last_year=2024,
            genres=self._facet("genre"),
            related=self._facet("label_name"),
            index_current=False,
        )
        page = EntityPage(
            resolution=EntityResolution(
                ref=EntityRef("artist", name_key="ame"),
                requested=EntityRef("artist", name_key="ame"),
                name="Âme",
                rules=_rules(),
            ),
            library=summary,
        )
        data = page.to_dict()
        assert data["library"] == {
            "tracks": 3,
            "years": {"first": 2019, "last": 2024},
            "genres": self._facet("genre").to_dict(),
            "related": self._facet("label_name").to_dict(),
            "index_current": False,
        }
        assert data["ref"] == "name:ame"

    def test_the_years_run_forwards(self):
        with pytest.raises(ValueError):
            EntityLibrarySummary(
                tracks=1,
                first_year=2024,
                last_year=2019,
                genres=self._facet("genre"),
                related=self._facet("label_name"),
            )


class TestBeatportHalf:
    def _page(self, rows=()) -> EntityTracksPage:
        return EntityTracksPage(
            rows=tuple(rows), total=len(rows), tracks=len(rows), owned=0
        )

    def test_its_states_are_the_error_classes_and_two_more(self):
        assert set(BEATPORT_STATES) == set(BEATPORT_ERROR_CLASSES) | {
            STATE_OK,
            STATE_NAME_ONLY,
        }
        assert len(BEATPORT_STATES) == len(set(BEATPORT_STATES))

    def test_tracks_come_exactly_with_ok(self):
        ref = EntityRef("label", beatport_id=7)
        EntityBeatportHalf(ref, STATE_OK, "ok", beatport_id=7, page=self._page())
        with pytest.raises(ValueError):
            EntityBeatportHalf(ref, STATE_OK, "ok", beatport_id=7)
        with pytest.raises(ValueError):
            EntityBeatportHalf(
                ref, STATE_NO_TOKEN, "no", beatport_id=7, page=self._page()
            )

    def test_tracks_are_some_artists_or_labels(self):
        with pytest.raises(ValueError):
            EntityBeatportHalf(
                EntityRef("label", name_key="x"), STATE_OK, "ok", page=self._page()
            )

    def test_a_reason_comes_exactly_with_name_only(self):
        ref = EntityRef("artist", name_key="twin")
        for reason in NAME_ONLY_REASONS:
            EntityBeatportHalf(ref, STATE_NAME_ONLY, "why", reason=reason)
        with pytest.raises(ValueError):
            EntityBeatportHalf(ref, STATE_NAME_ONLY, "why")
        with pytest.raises(ValueError):
            EntityBeatportHalf(ref, STATE_NO_TOKEN, "why", reason=REASON_SHARED)
        with pytest.raises(ValueError):
            EntityBeatportHalf(ref, STATE_NAME_ONLY, "why", reason="guessed")

    def test_every_state_says_what_happened(self):
        with pytest.raises(ValueError):
            EntityBeatportHalf(EntityRef("label", beatport_id=7), STATE_NO_TOKEN, " ")

    def test_an_action_is_one_a_page_has(self):
        ref = EntityRef("label", beatport_id=7)
        for action in (ACTION_SETTINGS, ACTION_RESOLVE, None):
            EntityBeatportHalf(ref, STATE_NO_TOKEN, "no", action=action)
        with pytest.raises(ValueError):
            EntityBeatportHalf(ref, STATE_NO_TOKEN, "no", action="retry")

    def test_it_serializes_its_rows(self):
        row = EntityTrackRow(
            track=_cached(5), artists=("Âme",), owned=True, on_wantlist=True
        )
        half = EntityBeatportHalf(
            EntityRef("artist", beatport_id=7),
            STATE_OK,
            "1 track",
            beatport_id=7,
            since="2025-09-23",
            until="2026-09-23",
            fetched_at=NOW,
            page=self._page([row]),
        )
        data = half.to_dict()
        assert data["ref"] == "bp:7" and data["kind"] == "artist"
        assert data["page"]["rows"][0]["beatport_track_id"] == 5
        assert data["page"]["rows"][0]["artists"] == ["Âme"]
        assert data["page"]["rows"][0]["owned"] is True
        assert data["page"]["rows"][0]["on_wantlist"] is True
        assert data["state"] == "ok" and data["retry_after"] is None

    def test_a_window_holds_no_more_than_its_list(self):
        row = EntityTrackRow(track=_cached(5))
        with pytest.raises(ValueError):
            EntityTracksPage(rows=(row,), total=0, tracks=1, owned=0)
        with pytest.raises(ValueError):
            EntityTracksPage(rows=(), total=0, tracks=1, owned=2)


class TestListing:
    def test_it_round_trips(self):
        listing = BeatportListing("artist", 7, "2025-09-23", NOW, 4)
        assert BeatportListing.from_row(listing.to_dict()) == listing

    def test_it_answers_for_a_later_window_and_not_an_earlier_one(self):
        listing = BeatportListing("label", 7, "2026-06-25", NOW)
        assert listing.answers_for("2026-06-25")
        assert listing.answers_for("2026-07-01")
        assert not listing.answers_for("2026-06-24")

    @pytest.mark.parametrize(
        "fields",
        [
            {"kind": "genre"},
            {"beatport_id": 0},
            {"beatport_id": MAX_BEATPORT_ID + 1},
            {"since": "23 September"},
            {"since": ""},
            {"fetched_at": ""},
            {"tracks": -1},
        ],
    )
    def test_it_refuses_what_a_listing_never_is(self, fields):
        values = {
            "kind": "artist",
            "beatport_id": 7,
            "since": "2025-09-23",
            "fetched_at": NOW,
            "tracks": 0,
            **fields,
        }
        with pytest.raises(ValueError):
            BeatportListing(**values)
