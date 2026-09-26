#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Who a library track is by, when Beatport knows (DISCOVER-07, DEC-095).

The rule behind ``beatport_artist is <id>`` and ``beatport_label is <id>``,
which an Artist or Label page hands the Library once resolution knows the id:

- every library track whose accepted Beatport track credits the id;
- every track not resolved yet whose name resolution linked to that id and to
  no other.

And the reads that resolve a page's reference, which must agree with it: a
name redirects to an id exactly when that id's page gathers the name's tracks.

Built through the real write paths — ``TrackRepository`` writes the credits
and label keys, ``TrackMetadataRepository`` an override's — with matches and
catalog rows written as DISCOVER-04's tests write them. The last class holds
the query plans that keep a page fast at 50,000 tracks.
"""

from __future__ import annotations

import random
from typing import Dict, List, Optional, Sequence, Set, Tuple

import pytest

from cuepoint.core.entity_names import name_key, split_credit
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.persistence.beatport_catalog_repository import (
    BeatportCatalogRepository,
    owned_among_json,
)
from cuepoint.persistence.track_credit_repository import (
    TrackCreditRepository,
    identity_tracks_sql,
)
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.fixtures.beatport_library import NOW, accept, catalog_track

pytestmark = pytest.mark.unit


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


class Library:
    """A library written through the real paths, and its Beatport side."""

    def __init__(self, db) -> None:
        self.db = db
        self.tracks = TrackRepository(db)
        self.catalog = BeatportCatalogRepository(db)
        self.credits = TrackCreditRepository(db)
        self.numbers: Dict[str, int] = {}
        self._next_bp = 5_000_000

    def add(
        self,
        ref: str,
        artist: str,
        label: Optional[str] = None,
        *,
        beatport: Optional[Sequence[Tuple[int, str]]] = None,
        remixers: Sequence[Tuple[int, str]] = (),
        beatport_label: Optional[Tuple[Optional[int], str]] = None,
        remixer: Optional[str] = None,
    ) -> int:
        """A library track; resolved on Beatport when ``beatport`` is given.

        ``beatport`` is who Beatport credits, ``beatport_label`` its label.
        A track with neither is not matched at all.
        """
        stored = self.tracks.add(
            LibraryTrack(
                rekordbox_track_id=ref,
                file_path=f"/m/{ref}.mp3",
                title=ref,
                artist=artist,
                remixer=remixer,
                label=label,
            )
        )
        assert stored.id is not None
        self.numbers[ref] = stored.id
        if beatport is not None or beatport_label is not None:
            self._next_bp += 1
            bp_track = self._next_bp
            with self.db.transaction() as conn:
                accept(conn, stored.id, str(bp_track))
            self.catalog.upsert_tracks(
                [
                    catalog_track(
                        bp_track,
                        artists=list(beatport or ()),
                        remixers=list(remixers),
                        label=beatport_label,
                    )
                ],
                NOW,
            )
        return stored.id

    def matched_not_read(
        self, ref: str, artist: str, label: Optional[str] = None
    ) -> int:
        """A track whose match is accepted and whose Beatport track is not cached."""
        stored = self.tracks.add(
            LibraryTrack(
                rekordbox_track_id=ref,
                file_path=f"/m/{ref}.mp3",
                title=ref,
                artist=artist,
                label=label,
            )
        )
        assert stored.id is not None
        self.numbers[ref] = stored.id
        self._next_bp += 1
        with self.db.transaction() as conn:
            accept(conn, stored.id, str(self._next_bp))
        return stored.id

    def refs(self, ids) -> List[str]:
        by_id = {v: k for k, v in self.numbers.items()}
        return sorted(by_id[i] for i in ids)

    def by(self, field: str, operator: str, value) -> List[str]:
        query = BrowseQuery(rules=RuleSet(rules=(FilterRule(field, operator, value),)))
        return self.refs(self.tracks.browse_ids(query, limit=100_000, offset=0))

    def count(self, field: str, operator: str, value) -> int:
        query = BrowseQuery(rules=RuleSet(rules=(FilterRule(field, operator, value),)))
        return self.tracks.browse_count(query)

    def reject(self, ref: str) -> None:
        with self.db.transaction() as conn:
            conn.execute(
                "UPDATE track_match SET state = 'rejected', decided_by = 'user'"
                " WHERE track_id = ?",
                (self.numbers[ref],),
            )


@pytest.fixture
def lib(db) -> Library:
    return Library(db)


# ------------------------------------------------------------------ artists


class TestAnArtistById:
    def test_a_resolved_track_is_by_the_artist_beatport_credits(self, lib):
        lib.add("a1", "Ame", beatport=[(100, "Âme")])
        lib.add("b1", "Solo", beatport=[(200, "Solo")])
        assert lib.by("beatport_artist", "is", 100) == ["a1"]
        assert lib.by("beatport_artist", "is", 200) == ["b1"]

    def test_the_unresolved_tracks_of_a_linked_name_join_it(self, lib):
        # The resolved "Âme" links the library's "Ame" to 100; the tracks
        # that were never matched stay on her page (DEC-095's one page).
        lib.add("a1", "Âme", beatport=[(100, "Âme")])
        lib.add("a2", "Ame")
        lib.add("a3", "Ame, Dixon")
        lib.add("a4", "AME feat. Rampa")
        lib.add("x1", "Amelie")
        assert lib.by("beatport_artist", "is", 100) == ["a1", "a2", "a3", "a4"]

    def test_a_track_matched_but_not_read_yet_joins_it_by_name(self, lib):
        lib.add("a1", "Âme", beatport=[(100, "Âme")])
        lib.matched_not_read("a2", "Ame")
        assert lib.by("beatport_artist", "is", 100) == ["a1", "a2"]

    def test_a_remix_counts_as_the_name_rule_counts_it(self, lib):
        lib.add("a1", "Someone", beatport=[(1, "Someone")], remixers=[(100, "Âme")])
        lib.add("a2", "Other", remixer="Âme")
        lib.add("a3", "Âme", beatport=[(100, "Âme")])
        assert lib.by("beatport_artist", "is", 100) == ["a1", "a2", "a3"]

    def test_beatport_is_authoritative_for_a_resolved_track(self, lib):
        # The library credits "Âme" on b1, but Beatport says it is by someone
        # else entirely: resolved, so not hers, even though her name is linked.
        lib.add("a1", "Âme", beatport=[(100, "Âme")])
        lib.add("b1", "Âme", beatport=[(300, "Kollektiv")])
        assert lib.by("beatport_artist", "is", 100) == ["a1"]
        assert lib.by("beatport_artist", "is", 300) == ["b1"]

    def test_a_name_two_artists_share_gives_its_unresolved_tracks_to_neither(self, lib):
        lib.add("t1", "Twin", beatport=[(300, "Twin")])
        lib.add("t2", "Twin", beatport=[(301, "Twin")])
        lib.add("t3", "Twin")
        assert lib.by("beatport_artist", "is", 300) == ["t1"]
        assert lib.by("beatport_artist", "is", 301) == ["t2"]
        # Asked about both, the name's every artist is in the question.
        assert lib.by("beatport_artist", "any_of", [300, 301]) == ["t1", "t2", "t3"]

    def test_a_link_needs_both_sides_to_name_the_artist(self, lib):
        # "A, B" resolved to A and B links A's id to "A" alone (DISCOVER-05).
        lib.add("ab", "A, B", beatport=[(1, "A"), (2, "B")])
        lib.add("a2", "A")
        lib.add("b2", "B")
        lib.add("c1", "C", beatport=[(3, "Someone Else")])
        assert lib.by("beatport_artist", "is", 1) == ["a2", "ab"]
        assert lib.by("beatport_artist", "is", 2) == ["ab", "b2"]
        # Beatport's "Someone Else" names nobody the library credits.
        assert lib.by("beatport_artist", "is", 3) == ["c1"]

    def test_a_credit_beatport_gave_no_id_links_nothing(self, lib):
        lib.add("a1", "Âme", beatport=[(None, "Âme"), (100, "Âme")])
        lib.add("a2", "Ame")
        assert lib.by("beatport_artist", "is", 100) == ["a1", "a2"]

    def test_is_not_is_the_exact_complement(self, lib):
        lib.add("a1", "Âme", beatport=[(100, "Âme")])
        lib.add("a2", "Ame")
        lib.add("b1", "Solo", beatport=[(200, "Solo")])
        lib.add("c1", "Nobody")
        assert lib.by("beatport_artist", "is_not", 100) == ["b1", "c1"]
        total = lib.tracks.count()
        assert (
            lib.count("beatport_artist", "is", 100)
            + lib.count("beatport_artist", "is_not", 100)
            == total
        )

    def test_an_id_with_no_tracks_is_an_empty_answer_not_a_mistake(self, lib):
        lib.add("a1", "Âme", beatport=[(100, "Âme")])
        assert lib.by("beatport_artist", "is", 999) == []
        assert lib.by("beatport_artist", "is_not", 999) == ["a1"]

    def test_identity_follows_a_rejected_match_at_once(self, lib):
        lib.add("a1", "Âme", beatport=[(100, "Âme")])
        lib.add("a2", "Ame")
        lib.reject("a1")
        # Nothing links "Ame" to 100 any more, and a1 is no longer resolved.
        assert lib.by("beatport_artist", "is", 100) == []

    def test_it_agrees_with_the_name_rule_when_every_track_is_linked(self, lib):
        # The spec's test: the rule set returns the tracks the equivalent
        # filter does. With one artist behind a name, the two are the same.
        lib.add("a1", "Âme", beatport=[(100, "Âme")])
        lib.add("a2", "Ame")
        lib.add("a3", "Ame, Dixon")
        lib.add("x1", "Amelie")
        assert lib.by("beatport_artist", "is", 100) == lib.by(
            "artist_name", "is", "Âme"
        )


# ------------------------------------------------------------------- labels


class TestALabelById:
    def test_a_resolved_track_is_on_the_label_beatport_says(self, lib):
        lib.add("n1", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        lib.add("o1", "B", "Other", beatport_label=(901, "Other"))
        assert lib.by("beatport_label", "is", 900) == ["n1"]

    def test_the_unresolved_tracks_of_a_linked_label_join_it(self, lib):
        # By track, not by spelling: "Nightfall" links to "Nightfall Audio".
        lib.add("n1", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        lib.add("n2", "B", "Nightfall")
        lib.add("n3", "C", "NIGHTFALL")
        lib.add("x1", "D", "Nightfall Records")
        assert lib.by("beatport_label", "is", 900) == ["n1", "n2", "n3"]

    def test_the_label_most_resolved_tracks_are_on_takes_the_rest(self, lib):
        lib.add("n1", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        lib.add("n2", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        lib.add("n3", "A", "Nightfall", beatport_label=(950, "Nightfall Records"))
        lib.add("n4", "A", "Nightfall")
        assert lib.by("beatport_label", "is", 900) == ["n1", "n2", "n4"]
        assert lib.by("beatport_label", "is", 950) == ["n3"]

    def test_a_tie_goes_to_the_lower_id(self, lib):
        lib.add("n1", "A", "Nightfall", beatport_label=(950, "Nightfall Records"))
        lib.add("n2", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        lib.add("n3", "A", "Nightfall")
        assert lib.by("beatport_label", "is", 900) == ["n2", "n3"]
        assert lib.by("beatport_label", "is", 950) == ["n1"]

    def test_the_label_is_the_effective_one(self, lib, db):
        lib.add("n1", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        moved_in = lib.add("m1", "B", "Elsewhere")
        moved_out = lib.add("m2", "C", "Nightfall")
        metadata = TrackMetadataRepository(db)
        metadata.set_override(moved_in, "label", "Nightfall")
        metadata.set_override(moved_out, "label", "Elsewhere")
        assert lib.by("beatport_label", "is", 900) == ["m1", "n1"]

    def test_a_track_beatport_gave_no_label_id_joins_by_its_library_label(self, lib):
        lib.add("n1", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        lib.add("n2", "A", "Nightfall", beatport=[(1, "A")])
        lib.add("n3", "A", "Nightfall", beatport_label=(None, "Nightfall Audio"))
        assert lib.by("beatport_label", "is", 900) == ["n1", "n2", "n3"]

    def test_is_not_is_the_exact_complement(self, lib):
        lib.add("n1", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        lib.add("n2", "A", "Nightfall")
        lib.add("x1", "A")
        assert lib.by("beatport_label", "is_not", 900) == ["x1"]

    def test_any_of_is_either(self, lib):
        lib.add("n1", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        lib.add("o1", "B", "Other", beatport_label=(901, "Other"))
        lib.add("o2", "B", "Other")
        assert lib.by("beatport_label", "any_of", [900, 901]) == ["n1", "o1", "o2"]

    def test_it_agrees_with_the_name_rule_when_the_label_is_whole(self, lib):
        lib.add("n1", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        lib.add("n2", "B", "Nightfall")
        lib.add("x1", "C", "Other")
        assert lib.by("beatport_label", "is", 900) == lib.by(
            "label_name", "is", "Nightfall"
        )


# ---------------------------------------------------------------- the reads


class TestResolutionReads:
    def test_a_name_is_linked_to_the_ids_its_resolved_tracks_credit(self, lib):
        lib.add("a1", "Âme", beatport=[(100, "Âme")])
        lib.add("a2", "Ame", beatport=[(100, "Âme")])
        lib.add("t1", "Twin", beatport=[(300, "Twin")])
        lib.add("t2", "Twin", beatport=[(301, "Twin")])
        lib.add("t3", "Twin", beatport=[(301, "Twin")])
        assert lib.credits.artist_links("ame") == [(100, "Âme", 2)]
        # Most tracks first, then the lower id.
        assert lib.credits.artist_links("twin") == [(301, "Twin", 2), (300, "Twin", 1)]
        assert lib.credits.artist_links("nobody") == []

    def test_a_label_is_linked_to_the_one_most_of_its_tracks_are_on(self, lib):
        lib.add("n1", "A", "Nightfall", beatport_label=(950, "Nightfall Records"))
        lib.add("n2", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        lib.add("n3", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        assert lib.credits.label_links("nightfall") == [
            (900, "Nightfall Audio", 2),
            (950, "Nightfall Records", 1),
        ]
        assert lib.credits.label_links("nothing") == []

    def test_an_id_names_the_library_spellings_it_gathers(self, lib):
        lib.add("a1", "Âme", beatport=[(100, "Âme")])
        lib.add("a2", "Ame")
        lib.add("t1", "Twin", beatport=[(300, "Twin")])
        lib.add("t2", "Twin", beatport=[(301, "Twin")])
        assert lib.credits.linked_names("artist", 100) == [("ame", "Ame", 2)]
        # A shared name is gathered by neither.
        assert lib.credits.linked_names("artist", 300) == []

    def test_a_label_id_names_the_library_labels_it_gathers(self, lib):
        lib.add("n1", "A", "Nightfall", beatport_label=(900, "Nightfall Audio"))
        lib.add("n2", "A", "NIGHTFALL")
        assert lib.credits.linked_names("label", 900) == [("nightfall", "NIGHTFALL", 2)]

    def test_the_library_spelling_is_the_facet_s(self, lib, db):
        lib.add("a1", "Âme")
        lib.add("a2", "Ame")
        overridden = lib.add("n1", "A", "Imported")
        TrackMetadataRepository(db).set_override(overridden, "label", "Nightfall")
        lib.add("n2", "A", "nightfall")
        assert lib.credits.library_name("artist", "ame") == "Ame"
        assert lib.credits.library_name("label", "nightfall") == "Nightfall"
        assert lib.credits.library_name("label", "imported") is None
        assert lib.credits.library_name("artist", "nobody") is None

    def test_resolvable_counts_the_matched_tracks_not_read_yet(self, lib):
        lib.add("a1", "Âme", beatport=[(100, "Âme")])
        lib.matched_not_read("a2", "Ame", "Nightfall")
        lib.matched_not_read("a3", "Ame")
        lib.add("a4", "Ame")
        assert lib.credits.unresolved_owned("artist", "ame") == 2
        assert lib.credits.unresolved_owned("label", "nightfall") == 1
        assert lib.credits.unresolved_owned("artist", "nobody") == 0

    @pytest.mark.parametrize(
        "read", ["linked_names", "library_name", "unresolved_owned"]
    )
    def test_a_kind_that_is_neither_is_refused(self, lib, read):
        with pytest.raises(ValueError):
            getattr(lib.credits, read)("genre", 1 if read == "linked_names" else "x")

    def test_the_rule_needs_an_id_and_a_kind(self):
        with pytest.raises(ValueError):
            identity_tracks_sql("artist", [])
        with pytest.raises(ValueError):
            identity_tracks_sql("genre", [1])


# -------------------------------------------------------------- agreement


def _generated(lib: Library, seed: int) -> None:
    """A library of every shape the rule meets, drawn at random."""
    rng = random.Random(seed)
    names = ["Âme", "Ame", "Twin", "Solo", "Mara Veil", "Dixon", "Rampa"]
    labels = ["Nightfall", "NIGHTFALL", "Toolroom", "Kompakt", None]
    # One artist behind most names, two behind "Twin", and none linked for
    # "Rampa", whom Beatport spells "Rampa (DE)".
    artist_ids = {
        "ame": [100],
        "twin": [300, 301],
        "solo": [200],
        "mara veil": [400],
        "dixon": [600],
    }
    label_ids = {"nightfall": [900, 950], "toolroom": [910], "kompakt": [920]}
    for n in range(120):
        credited = rng.sample(names, rng.choice([1, 1, 2]))
        artist = ", ".join(credited)
        label = rng.choice(labels)
        shape = rng.random()
        if shape < 0.45:
            beatport = []
            for name in credited:
                key = name_key(name)
                if key in artist_ids and rng.random() < 0.9:
                    beatport.append((rng.choice(artist_ids[key]), name))
                elif key in artist_ids:
                    # Beatport says someone else made it: resolved, and not theirs.
                    beatport.append((800, "Someone Else"))
                else:
                    beatport.append((700, f"{name} (DE)"))
            key = name_key(label) if label else None
            bp_label = (
                (rng.choice(label_ids[key]), label)
                if key in label_ids and rng.random() < 0.9
                else (990, "Elsewhere")
            )
            lib.add(
                f"r{n:03}", artist, label, beatport=beatport, beatport_label=bp_label
            )
        elif shape < 0.55:
            lib.matched_not_read(f"m{n:03}", artist, label)
        else:
            lib.add(f"u{n:03}", artist, label)


def _expected(lib: Library, kind: str, ids: Set[int]) -> List[str]:
    """The rule, stated again in Python from the rows, for the agreement test."""
    conn = lib.db.connect()
    resolved = lib.catalog.library_credits(lib.numbers.values())
    library_keys: Dict[int, Set[str]] = {}
    effective: Dict[int, Optional[str]] = {}
    for row in conn.execute(
        "SELECT t.id, t.artist, t.remixer, COALESCE(m.label_key, t.label_key) AS k"
        " FROM tracks AS t LEFT JOIN track_metadata AS m ON m.track_id = t.id"
    ):
        library_keys[row["id"]] = {
            name_key(n) for n in split_credit(row["artist"] or "")
        } | {name_key(n) for n in split_credit(row["remixer"] or "")}
        effective[row["id"]] = row["k"]
    found: Set[int] = set()
    if kind == "artist":
        links: Dict[str, Set[int]] = {}
        for track_id, rows in resolved.items():
            for credit in rows:
                if credit.kind != "artist":
                    continue
                if credit.beatport_id in ids:
                    found.add(track_id)
                if (
                    credit.beatport_id is not None
                    and credit.name_key in library_keys[track_id]
                ):
                    links.setdefault(credit.name_key, set()).add(credit.beatport_id)
        gathered = {k for k, linked in links.items() if linked & ids and linked <= ids}
        for track_id, keys in library_keys.items():
            is_resolved = any(c.kind == "artist" for c in resolved.get(track_id, []))
            if not is_resolved and keys & gathered:
                found.add(track_id)
    else:
        label_of: Dict[int, Optional[int]] = {}
        for track_id, rows in resolved.items():
            for credit in rows:
                if credit.kind == "label":
                    label_of[track_id] = credit.beatport_id
        votes: Dict[str, Dict[int, int]] = {}
        for track_id, label_id in label_of.items():
            if label_id in ids:
                found.add(track_id)
            key = effective[track_id]
            if label_id is not None and key is not None:
                votes.setdefault(key, {}).setdefault(label_id, 0)
                votes[key][label_id] += 1
        winners = {
            key: min(counts, key=lambda i: (-counts[i], i))
            for key, counts in votes.items()
        }
        gathered = {key for key, winner in winners.items() if winner in ids}
        for track_id, key in effective.items():
            if label_of.get(track_id) is None and key in gathered:
                found.add(track_id)
    return lib.refs(found)


class TestAgreement:
    @pytest.mark.parametrize("seed", [1, 2, 3, 4, 5])
    @pytest.mark.parametrize(
        "kind, ids",
        [
            ("artist", {100}),
            ("artist", {300}),
            ("artist", {300, 301}),
            ("artist", {200, 400}),
            ("label", {900}),
            ("label", {950}),
            ("label", {900, 950}),
            ("label", {910, 920}),
        ],
    )
    def test_the_rule_is_the_rule_stated_in_python(self, lib, seed, kind, ids):
        _generated(lib, seed)
        field = f"beatport_{kind}"
        wanted = sorted(ids)
        got = (
            lib.by(field, "is", wanted[0])
            if len(wanted) == 1
            else lib.by(field, "any_of", wanted)
        )
        assert got == _expected(lib, kind, ids)

    @pytest.mark.parametrize("seed", [1, 2, 3])
    def test_a_name_redirects_exactly_when_its_id_gathers_it(self, lib, seed):
        # The service redirects a name linked to one id, and only then; the id's
        # page must then be the one gathering the name's unresolved tracks, and
        # a name linked to several ids must be gathered by none of them.
        _generated(lib, seed)
        seen_one = seen_shared = False
        for key, _ in lib.credits.library_artists():
            links = [beatport_id for beatport_id, _, _ in lib.credits.artist_links(key)]
            gatherers = [
                beatport_id
                for beatport_id in links
                if key
                in {k for k, _, _ in lib.credits.linked_names("artist", beatport_id)}
            ]
            if len(links) == 1:
                seen_one = True
                assert gatherers == links, key
            else:
                seen_shared = seen_shared or len(links) > 1
                assert gatherers == [], key
        for key, _ in lib.credits.library_labels():
            links = lib.credits.label_links(key)
            for rank, (beatport_id, _, _) in enumerate(links):
                gathered = {
                    k for k, _, _ in lib.credits.linked_names("label", beatport_id)
                }
                assert (key in gathered) == (rank == 0), (key, beatport_id)
        assert seen_one and seen_shared

    @pytest.mark.parametrize("seed", [1, 2, 3])
    def test_a_label_link_is_discovery_s_link(self, lib, seed):
        # DISCOVER-05's whole-library reading and the page's one-label reading
        # are the same rule.
        _generated(lib, seed)
        by_key = lib.credits.label_ids_by_key()
        for key, _ in lib.credits.library_labels():
            links = lib.credits.label_links(key)
            assert (links[0][0] if links else None) == by_key.get(key)

    @pytest.mark.parametrize("seed", [1, 2, 3])
    def test_an_artist_link_is_discovery_s_link(self, lib, seed):
        _generated(lib, seed)
        linked: Dict[str, Set[int]] = {}
        for beatport_id, key in lib.credits.artist_ids_by_key().items():
            linked.setdefault(key, set()).add(beatport_id)
        for key, _ in lib.credits.library_artists():
            ids = {i for i, _, _ in lib.credits.artist_links(key)}
            # Every id discovery links to the name, the page links too.
            assert linked.get(key, set()) <= ids


# ------------------------------------------------------------ query plans


def _plan(db, sql: str, params: Sequence[object]) -> List[str]:
    return [
        str(row[3]) for row in db.connect().execute("EXPLAIN QUERY PLAN " + sql, params)
    ]


class TestPlans:
    """What keeps a page fast at 50,000 tracks (see the step's outcome).

    Each read by id reaches accepted matches through the owned-id index
    (migration 0024), never by computing every match's id; each read of a
    track's identity is by the track, never the whole view; and a label's
    tracks are found by the label-key indexes, never by computing every
    track's effective label. Each assertion fails on the first form this step
    wrote, which took 1.9 s for an artist page and 9.4 s for a label page.
    """

    @pytest.mark.parametrize("kind", ["artist", "label"])
    def test_the_rule_never_scans_the_accepted_matches(self, db, kind):
        plan = _plan(db, *identity_tracks_sql(kind, [7]))
        assert any("idx_match_candidates_owned_id" in step for step in plan), plan
        assert not any(step.startswith(("SCAN m", "SCAN c")) for step in plan), plan

    def test_a_label_s_tracks_are_found_by_its_key(self, db):
        plan = _plan(db, *identity_tracks_sql("label", [7]))
        assert any("idx_tracks_label_key" in step for step in plan), plan
        assert any("idx_track_metadata_label_key" in step for step in plan), plan
        assert not any(step.startswith("SCAN t") for step in plan), plan

    def test_an_artist_rule_reads_no_label(self, db):
        plan = " ".join(_plan(db, *identity_tracks_sql("artist", [7])))
        assert "SCAN t " not in plan and not plan.endswith("SCAN t")

    def test_owned_among_a_list_uses_the_index(self, db):
        conn = db.connect()
        sql = "SELECT beatport_track_id FROM beatport_tracks WHERE label_id = ?"
        traced: List[str] = []
        conn.set_trace_callback(traced.append)
        try:
            owned_among_json(conn, sql, (1,))
        finally:
            conn.set_trace_callback(None)
        statement = next(s for s in traced if "library_beatport_tracks" in s)
        plan = [
            str(row[3])
            for row in conn.execute(
                "EXPLAIN QUERY PLAN "
                + statement.replace("label_id = 1", "label_id = ?"),
                (1,),
            )
        ]
        assert any("idx_match_candidates_owned_id" in step for step in plan), plan
        assert not any(step.startswith("SCAN m") for step in plan), plan
