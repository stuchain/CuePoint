#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Beatport's key is the key (PAGES-15, DEC-201, DEC-202, DEC-203).

A track's key is the user's correction, else its accepted match's Beatport key,
else none. Rekordbox's key is never the fallback. The rule is written twice, in
SQL (``models/filter_rule.py``) and in Python (``services/key_resolver.py``);
these tests drive both against one database, so the two cannot drift apart, and
then drive every reader the specification lists.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path
from typing import Optional

import pytest

from cuepoint.engine.library_api import track_to_dict
from cuepoint.models.collection import KIND_SET, Collection
from cuepoint.models.filter_rule import FilterRule, RuleSet
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.rekordbox_export_values import ExportTrackValues
from cuepoint.persistence.collection_repository import CollectionRepository
from cuepoint.persistence.file_write_repository import FileWriteRepository
from cuepoint.persistence.set_repository import SetRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.key_resolver import (
    NO_KEY,
    camelot_of,
    key_name,
    resolve_key,
)
from cuepoint.services.migration_runner import MigrationRunner
from cuepoint.services.tag_write_service import written_values
from cuepoint.services.tag_write_options import TagWriteOptions

SRC = Path(__file__).resolve().parents[3]


# ---------------------------------------------------------------------------
# The rule in Python
# ---------------------------------------------------------------------------


class TestResolveKey:
    def test_yours_beats_beatport(self):
        found = resolve_key("Am", "cuepoint", "F# Major")
        assert (found.camelot, found.name, found.source) == ("8A", "A minor", "yours")

    def test_beatport_with_no_correction(self):
        found = resolve_key(None, None, "F♯ Major")
        assert (found.camelot, found.name, found.source) == (
            "2B",
            "F♯ major",
            "beatport",
        )

    def test_neither_gives_none(self):
        assert resolve_key(None, None, None) == NO_KEY
        assert resolve_key(None, None, "  ") == NO_KEY

    def test_a_key_applied_from_a_match_follows_the_match(self):
        # DEC-203: History says Beatport applied it, so it is Beatport's.
        assert resolve_key("9A", "beatport", None) == NO_KEY
        assert resolve_key("9A", "beatport", "A Minor").camelot == "8A"

    def test_a_typed_key_stays_a_correction(self):
        assert resolve_key("9A", "cuepoint", None).source == "yours"

    def test_an_override_with_no_history_is_a_correction(self):
        assert resolve_key("9A", None, "A Minor").camelot == "9A"

    def test_an_unparseable_key_is_none(self):
        assert resolve_key(None, None, "Open 1m") == NO_KEY
        assert resolve_key("nonsense", "cuepoint", "A Minor") == NO_KEY

    @pytest.mark.parametrize(
        ("text", "camelot"),
        [("8A", "8A"), ("Am", "8A"), ("A minor", "8A"), ("A Min", "8A"), ("C", "8B")],
    )
    def test_any_notation_is_one_key(self, text, camelot):
        assert camelot_of(text) == camelot

    def test_names(self):
        assert key_name(9, True) == "A minor"
        assert key_name(6, False) == "F♯ major"
        assert key_name(8, True) == "A♭ minor"


# ---------------------------------------------------------------------------
# The rule in SQL, against a database
# ---------------------------------------------------------------------------


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def repo(db) -> TrackRepository:
    return TrackRepository(db)


class Library:
    """A handful of tracks, each in the state a key case needs."""

    def __init__(self, db: DatabaseService, repo: TrackRepository) -> None:
        self.db = db
        self.repo = repo
        self.n = 0

    def track(self, key: Optional[str] = None) -> int:
        self.n += 1
        added = self.repo.add(
            LibraryTrack(
                rekordbox_track_id=str(self.n),
                title=f"Title {self.n}",
                artist="Artist",
                file_path=f"/music/{self.n}.mp3",
                key=key,
            )
        )
        assert added.id is not None
        return added.id

    def match(
        self, track_id: int, beatport_key: Optional[str], state: str = "accepted"
    ) -> None:
        by = "auto" if state == "accepted" else "user"
        with self.db.transaction() as conn:
            attempt = conn.execute(
                "INSERT INTO match_attempts (track_id, started_at, finished_at,"
                " outcome, input_json) VALUES (?, 't', 't', 'matched', '{}')",
                (track_id,),
            ).lastrowid
            candidate = conn.execute(
                "INSERT INTO match_candidates (attempt_id, rank, url, key, score,"
                " guard_ok, is_winner) VALUES (?, 0, 'https://b/1', ?, 96, 1, 1)",
                (attempt, beatport_key),
            ).lastrowid
            conn.execute(
                "INSERT OR REPLACE INTO track_match (track_id, state, decided_by,"
                " attempt_id, candidate_id, decided_at)"
                " VALUES (?, ?, ?, ?, ?, 't')",
                (track_id, state, by, attempt, candidate),
            )

    def set_state(self, track_id: int, state: str) -> None:
        with self.db.transaction() as conn:
            conn.execute(
                "UPDATE track_match SET state = ? WHERE track_id = ?",
                (state, track_id),
            )

    def override(self, track_id: int, key: str, source: Optional[str]) -> None:
        with self.db.transaction() as conn:
            conn.execute(
                "INSERT INTO track_metadata (track_id, key, created_at, updated_at)"
                " VALUES (?, ?, 't', 't')"
                " ON CONFLICT(track_id) DO UPDATE SET key = excluded.key",
                (track_id, key),
            )
            if source is not None:
                conn.execute(
                    "INSERT INTO track_history (track_id, field, old_value_json,"
                    " new_value_json, source, changed_at)"
                    " VALUES (?, 'cuepoint_key', NULL, ?, ?, ?)",
                    (track_id, f'"{key}"', source, f"2026-01-0{self.n % 9 + 1}"),
                )

    def keys(self, *rules: FilterRule) -> list:
        query = BrowseQuery(rules=RuleSet(rules=rules))
        return sorted(t.rekordbox_track_id for t in self.repo.browse(query, limit=500))

    def row(self, track_id: int) -> dict:
        track = self.repo.get_many([track_id])[0]
        metadata = TrackMetadataRepository(self.db).get_many([track_id])
        clean = self.repo.clean_states([track_id])
        sources = TrackMetadataRepository(self.db).override_sources([track_id])
        return track_to_dict(
            track,
            metadata.get(track_id),
            clean.get(track_id),
            sources.get(track_id),
        )


@pytest.fixture
def lib(db, repo) -> Library:
    return Library(db, repo)


def is_key(value: str) -> FilterRule:
    return FilterRule(field="key", operator="is", value=value)


class TestTheRowAndTheFilter:
    def test_rekordbox_alone_is_no_key(self, lib):
        track = lib.track(key="8A")
        row = lib.row(track)
        assert row["key"] == "8A"  # the imported value, as ever
        assert (row["effective_key"], row["key_source"], row["key_name"]) == (
            None,
            None,
            None,
        )
        assert lib.keys(is_key("8A")) == []

    def test_an_accepted_match_gives_its_key(self, lib):
        track = lib.track(key="3B")
        lib.match(track, "A Minor")
        row = lib.row(track)
        assert (row["effective_key"], row["key_source"], row["key_name"]) == (
            "8A",
            "beatport",
            "A minor",
        )
        assert row["key"] == "3B"

    def test_key_is_8a_matches_a_beatport_a_minor_and_never_a_rekordbox_only_8a(
        self, lib
    ):
        beatport = lib.track(key="1A")
        lib.match(beatport, "A Minor")
        rekordbox_only = lib.track(key="8A")
        classic = lib.track()
        lib.match(classic, "Am")
        assert lib.keys(is_key("8A")) == ["1", "3"]
        assert lib.keys(is_key("A minor")) == ["1", "3"]
        assert lib.keys(is_key("Am")) == ["1", "3"]
        assert rekordbox_only == 2 and "2" not in lib.keys(is_key("8A"))

    def test_the_other_operators_read_the_resolved_key(self, lib):
        lib.match(lib.track(), "A Minor")
        lib.track(key="8A")
        lib.match(lib.track(), "F# Major")
        assert lib.keys(FilterRule(field="key", operator="is_empty")) == ["2"]
        assert lib.keys(FilterRule(field="key", operator="is_not", value="8A")) == [
            "2",
            "3",
        ]
        assert lib.keys(
            FilterRule(field="key", operator="any_of", value=["8A", "2B"])
        ) == ["1", "3"]

    def test_the_filter_for_rekordbox_s_own_key_still_exists_and_says_so(self, lib):
        lib.track(key="8A")
        rule = FilterRule(field="key_rekordbox", operator="is", value="8A")
        assert lib.keys(rule) == ["1"]
        assert rule.spec.label == "Key from Rekordbox (not used)"

    def test_auto_accept_gives_the_key(self, lib):
        track = lib.track()
        lib.match(track, "Cm", state="accepted")  # decided_by auto (DEC-202)
        assert lib.row(track)["effective_key"] == "5A"

    @pytest.mark.parametrize("state", ["rejected", "no_match", "needs_review"])
    def test_a_match_that_is_not_accepted_gives_none(self, lib, state):
        track = lib.track()
        lib.match(track, "Cm", state=state)
        assert lib.row(track)["effective_key"] is None
        assert lib.keys(is_key("5A")) == []

    def test_yours_beats_beatport(self, lib):
        track = lib.track()
        lib.match(track, "Cm")
        lib.override(track, "Am", "cuepoint")
        row = lib.row(track)
        assert (row["effective_key"], row["key_source"]) == ("8A", "yours")
        assert row["overridden"] == ["key"]
        assert lib.keys(is_key("8A")) == ["1"]

    def test_a_key_applied_from_a_match_follows_the_match(self, lib):
        track = lib.track()
        lib.match(track, "Cm")
        lib.override(track, "Cm", "beatport")  # applied before DEC-201
        row = lib.row(track)
        assert (row["effective_key"], row["key_source"]) == ("5A", "beatport")
        assert row["overridden"] == []  # it is Beatport's, not a correction
        lib.set_state(track, "rejected")
        row = lib.row(track)
        assert row["effective_key"] is None
        assert lib.keys(is_key("5A")) == []

    def test_a_typed_key_stays_after_a_reject(self, lib):
        track = lib.track()
        lib.match(track, "Cm")
        lib.override(track, "Am", "cuepoint")
        lib.set_state(track, "rejected")
        assert lib.row(track)["effective_key"] == "8A"

    def test_the_latest_history_row_decides(self, lib):
        track = lib.track()
        lib.match(track, "Cm")
        with lib.db.transaction() as conn:
            conn.execute(
                "INSERT INTO track_metadata (track_id, key, created_at, updated_at)"
                " VALUES (?, 'Am', 't', 't')",
                (track,),
            )
            for source, at in (("beatport", "2026-01-01"), ("cuepoint", "2026-01-02")):
                conn.execute(
                    "INSERT INTO track_history (track_id, field, new_value_json,"
                    " source, changed_at) VALUES (?, 'cuepoint_key', '\"Am\"', ?, ?)",
                    (track, source, at),
                )
        assert lib.row(track)["key_source"] == "yours"

    def test_the_newest_row_by_id_decides_when_the_dates_disagree(self, lib):
        """History's order is its id everywhere: the row, the filter, the queue
        and the count read the same latest row, whatever its changed_at says."""
        track = lib.track()
        lib.match(track, "Cm")
        with lib.db.transaction() as conn:
            conn.execute(
                "INSERT INTO track_metadata (track_id, key, created_at, updated_at)"
                " VALUES (?, 'Am', 't', 't')",
                (track,),
            )
            # Typed first but dated later; applied from the match second but
            # dated earlier. The newer row by id is Beatport's.
            for source, at in (("cuepoint", "2026-02-01"), ("beatport", "2026-01-01")):
                conn.execute(
                    "INSERT INTO track_history (track_id, field, new_value_json,"
                    " source, changed_at) VALUES (?, 'cuepoint_key', '\"Am\"', ?, ?)",
                    (track, source, at),
                )
        row = lib.row(track)
        assert (row["effective_key"], row["key_source"]) == ("5A", "beatport")
        assert lib.keys(is_key("5A")) == ["1"]
        assert lib.keys(is_key("8A")) == []
        assert (
            lib.repo.browse_count(BrowseQuery(rules=RuleSet(rules=(is_key("5A"),))))
            == 1
        )
        queue = lib.repo.browse_queue(BrowseQuery(), limit=10)
        assert [(t.id, t.key) for t in queue] == [(track, "5A")]

    def test_an_unparseable_key_is_none(self, lib):
        track = lib.track()
        lib.match(track, "Open 1m")
        assert lib.row(track)["effective_key"] is None
        assert lib.keys(FilterRule(field="key", operator="is_empty")) == ["1"]

    def test_sql_and_python_agree(self, lib):
        """The two spellings of the rule give one answer for every case."""
        cases = [
            (None, None, None),
            (None, None, "Am"),
            ("Cm", "cuepoint", "Am"),
            ("Cm", "beatport", "Am"),
            ("Cm", "beatport", None),
            ("Cm", None, "Am"),
            ("junk", "cuepoint", "Am"),
        ]
        for override, source, beatport in cases:
            track = lib.track(key="12B")
            if beatport is not None:
                lib.match(track, beatport)
            if override is not None:
                lib.override(track, override, source)
            expected = resolve_key(override, source, beatport)
            row = lib.row(track)
            assert (row["effective_key"], row["key_source"]) == (
                expected.camelot,
                expected.source,
            ), (override, source, beatport)


# ---------------------------------------------------------------------------
# The readers
# ---------------------------------------------------------------------------


class TestEveryReader:
    def test_the_queue_projection(self, lib):
        matched = lib.track(key="1A")
        lib.match(matched, "Am")
        lib.track(key="2A")
        queue = lib.repo.browse_queue(BrowseQuery(), limit=10)
        assert [(t.id, t.key) for t in queue] == [(matched, "8A"), (matched + 1, None)]

    def test_sorting_by_key_uses_the_resolved_key(self, lib):
        a = lib.track(key="1A")
        b = lib.track()
        lib.match(b, "Am")
        found = lib.repo.browse(BrowseQuery(sort="key", direction="desc"), limit=10)
        assert [t.id for t in found][0] == b
        assert a in [t.id for t in found]

    def test_sorting_by_key_goes_round_the_wheel_with_no_key_last(self, lib):
        order = {}
        for text in ("12B", "2A", "1B", "10A", "1A", "2B"):
            order[text] = lib.track()
            lib.match(order[text], text)
        keyless = lib.track(key="1A")  # Rekordbox's key is never used
        ascending = [t.id for t in lib.repo.browse(BrowseQuery(sort="key"), limit=20)]
        wanted = [order[k] for k in ("1A", "1B", "2A", "2B", "10A", "12B")]
        assert ascending == [*wanted, keyless]
        descending = [
            t.id
            for t in lib.repo.browse(
                BrowseQuery(sort="key", direction="desc"), limit=20
            )
        ]
        assert descending[:6] == wanted[::-1]

    def test_the_facet_counts_resolved_keys(self, lib):
        lib.match(lib.track(key="1A"), "A Minor")
        lib.match(lib.track(key="1A"), "Am")
        lib.track(key="1A")
        facet = lib.repo.facet_values(BrowseQuery(), "key")
        assert [(v.value, v.count) for v in facet.values if v.value] == [("8A", 2)]

    def test_a_sets_entries(self, lib, db):
        keyed = lib.track(key="1A")
        lib.match(keyed, "Am")
        bare = lib.track(key="1A")
        facts = _entry_facts(db, [keyed, bare])
        assert facts == [(keyed, "8A"), (bare, None)]

    def test_the_tag_write_targets(self, lib, db):
        keyed = lib.track(key="1A")
        lib.match(keyed, "Am")
        bare = lib.track(key="1A")
        targets = {
            t.track_id: t for t in FileWriteRepository(db).targets([keyed, bare])
        }
        assert targets[keyed].key == "8A"
        assert targets[bare].key is None

    def test_a_track_with_no_key_writes_none_and_leaves_the_files_key(self, lib, db):
        bare = lib.track(key="1A")
        [target] = FileWriteRepository(db).targets([bare])
        options = TagWriteOptions.from_request({"write_key": True})
        values, missing = written_values(target, options)
        assert "key" not in values
        assert "key" in missing

    def test_the_export_values(self, lib, db):
        keyed = lib.track(key="1A")
        lib.match(keyed, "Am")
        bare = lib.track(key="3B")
        exported = {v.track_id: v for v in lib.repo.iter_export_values()}

        def resolved(values):
            return resolve_key(
                values.override_key, values.override_key_source, values.beatport_key
            ).camelot

        assert resolved(exported[keyed]) == "8A"
        assert exported[bare].key == "3B"  # the imported value stays
        assert resolved(exported[bare]) is None  # but is never exported

    def test_an_export_with_no_key_writes_the_imported_value_back_unchanged(self):
        from cuepoint.services.rekordbox_export_service import _export_values

        values = ExportTrackValues(track_id=1, rekordbox_track_id="1", key="3B")
        assert _export_values(values, "camelot").key is None

    def test_an_export_writes_the_resolved_key(self):
        from cuepoint.services.rekordbox_export_service import _export_values

        values = ExportTrackValues(
            track_id=1, rekordbox_track_id="1", key="3B", beatport_key="Am"
        )
        assert _export_values(values, "classic").key == "Am"
        assert _export_values(values, "camelot").key == "8A"


def _entry_facts(db: DatabaseService, track_ids: list) -> list:
    """Run the Set repository's entry read over an ad hoc Set of ``track_ids``."""
    collections = CollectionRepository(db)
    gig = int(collections.create(Collection(name="Friday", kind=KIND_SET)).id)
    collections.add(gig, track_ids)
    return [(row.track_id, row.key) for row in SetRepository(db).entry_facts(gig)]


# ---------------------------------------------------------------------------
# No reader falls back to Rekordbox's key
# ---------------------------------------------------------------------------

#: Modules whose code (not comments or docstrings) may name ``tracks.key``,
#: Rekordbox's imported column, and why. Anything else is a new reader of it.
ALLOWED_IMPORTED_KEY = {
    "persistence/track_repository.py": "the imported value on the row, the "
    "notation count of the file, and the export's imported layer",
}

#: The readers the specification lists, each of which must resolve through the
#: one rule (the SQL fragments or ``resolve_key``).
READERS = (
    "models/filter_rule.py",
    "persistence/track_repository.py",
    "persistence/track_query.py",
    "persistence/set_repository.py",
    "persistence/similarity_repository.py",
    "persistence/file_write_repository.py",
    "services/rekordbox_export_service.py",
    "engine/library_api.py",
)

RESOLVER_NAMES = re.compile(
    r"KEY_SQL|KEY_RAW_SQL|KEY_BEATPORT_SQL|resolve_key|field_spec\([\"']key[\"']\)"
)


def _code_strings_match(path: Path, pattern: "re.Pattern[str]") -> bool:
    """Whether a string in the module's code matches: comments and docstrings
    are not code, and SQL is a string, so this reads exactly the SQL."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    docstrings = {
        id(node.body[0].value)
        for node in ast.walk(tree)
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef))
        and node.body
        and isinstance(node.body[0], ast.Expr)
        and isinstance(node.body[0].value, ast.Constant)
    }
    return any(
        isinstance(node, ast.Constant)
        and isinstance(node.value, str)
        and id(node) not in docstrings
        and pattern.search(node.value)
        for node in ast.walk(tree)
    )


class TestNoReaderFallsBack:
    def test_no_module_combines_the_override_with_the_imported_key(self):
        pattern = re.compile(r"COALESCE\(\s*meta\.key\s*,\s*tracks\.key\s*\)")
        offenders = [
            str(path.relative_to(SRC / "cuepoint"))
            for path in (SRC / "cuepoint").rglob("*.py")
            if pattern.search(path.read_text(encoding="utf-8"))
        ]
        assert offenders == []

    def test_the_imported_key_is_named_only_where_the_list_says_why(self):
        pattern = re.compile(r"tracks\.key\b")
        found = {
            str(path.relative_to(SRC / "cuepoint")).replace("\\", "/")
            for path in (SRC / "cuepoint").rglob("*.py")
            if _code_strings_match(path, pattern)
        }
        assert found - set(ALLOWED_IMPORTED_KEY) == set()

    @pytest.mark.parametrize("reader", READERS)
    def test_each_reader_resolves_through_the_one_rule(self, reader):
        source = (SRC / "cuepoint" / reader).read_text(encoding="utf-8")
        assert RESOLVER_NAMES.search(source), reader
