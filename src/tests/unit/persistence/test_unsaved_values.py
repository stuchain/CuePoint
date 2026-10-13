"""What is not in the files yet: the one SQL definition (G4 2.1, C23).

A field is unsaved when CuePoint has its own value, it differs from what
Rekordbox sent, and the latest confirmed write of it is not a write of that
value. These tests state each rule on its own, then hold the filter field and
the repository to the same definition.
"""

from __future__ import annotations

import pytest

from cuepoint.data.tag_fields import _FORMAT_BY_SUFFIX
from cuepoint.models.filter_rule import (
    UNSAVED_FILE_SUFFIXES,
    UNSAVED_FIELDS,
    FilterRule,
    RuleSet,
    field_spec,
)
from cuepoint.persistence.match_status_repository import MatchStatusRepository
from cuepoint.persistence.track_metadata_repository import TrackMetadataRepository
from cuepoint.persistence.track_query import BrowseQuery, build_count
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.migration_runner import MigrationRunner
from tests.unit.key_support import accept_with_key
from tests.unit.persistence.match_status_support import (
    add_playlist,
    add_track,
    write_row,
)


@pytest.fixture
def db(tmp_path):
    service = DatabaseService(db_path=tmp_path / "cuepoint.db")
    MigrationRunner(service).migrate()
    yield service
    service.close_all()


@pytest.fixture
def repo(db) -> MatchStatusRepository:
    return MatchStatusRepository(db)


@pytest.fixture
def meta(db) -> TrackMetadataRepository:
    return TrackMetadataRepository(db)


def unsaved_fields(db, track_id: int) -> set:
    from cuepoint.models.filter_rule import UNSAVED_VALUES_SQL

    return {
        row["field"]
        for row in db.connect().execute(
            f"SELECT track_id, field FROM ({UNSAVED_VALUES_SQL}) WHERE track_id = ?",
            (track_id,),
        )
    }


@pytest.mark.unit
class TestEachRule:
    def test_nothing_of_your_own_is_nothing_to_save(self, db):
        track = add_track(db, genre="House", bpm=124.0, year=2020, label="L")
        assert unsaved_fields(db, track) == set()

    def test_an_override_equal_to_rekordbox_is_not_unsaved(self, db, meta):
        track = add_track(db, genre="House", label="Label", bpm=124.0, year=2020)
        meta.set_override(track, "genre", "House")
        meta.set_override(track, "bpm", 124.004)  # the same at two decimals
        meta.set_override(track, "year", 2020)
        meta.set_override(track, "label", "  Label ")  # trimmed
        assert unsaved_fields(db, track) == set()

    def test_an_override_that_differs_is_unsaved(self, db, meta):
        track = add_track(db, genre="House", label="Label", bpm=124.0, year=2020)
        meta.set_override(track, "genre", "Techno")
        meta.set_override(track, "bpm", 125.0)
        meta.set_override(track, "year", 2021)
        meta.set_override(track, "label", "Other")
        assert unsaved_fields(db, track) == {"genre", "bpm", "year", "label"}

    def test_a_value_where_rekordbox_had_none_is_unsaved(self, db, meta):
        track = add_track(db)
        meta.set_override(track, "genre", "House")
        assert unsaved_fields(db, track) == {"genre"}

    def test_the_year_is_its_first_four_digits(self, db, meta):
        track = add_track(db, year=2020)
        meta.set_override(track, "year", 2020)
        assert unsaved_fields(db, track) == set()
        write_row(db, track, "year", value="2021-05-06")
        meta.set_override(track, "year", 2021)
        # written as a date, the file holds 2021: saved
        assert unsaved_fields(db, track) == set()

    def test_the_key_is_compared_as_a_camelot_code(self, db):
        track = add_track(db, key="8A")
        accept_with_key(db, track, "A Minor")
        assert unsaved_fields(db, track) == set()  # the same key in two styles

    def test_a_key_from_an_accepted_match_that_differs_is_unsaved(self, db):
        track = add_track(db, key="8A")
        accept_with_key(db, track, "C Major")
        assert unsaved_fields(db, track) == {"key"}

    def test_a_key_you_corrected_is_unsaved(self, db, meta):
        track = add_track(db, key="8A")
        meta.set_override(track, "key", "Em")
        assert unsaved_fields(db, track) == {"key"}

    def test_rekordbox_s_key_alone_is_not_a_value_of_yours(self, db):
        assert unsaved_fields(db, add_track(db, key="8A")) == set()

    def test_written_then_saved(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", value="Techno")
        assert unsaved_fields(db, track) == set()

    def test_written_then_edited_is_unsaved_again(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", value="Techno")
        meta.set_override(track, "genre", "Trance")
        assert unsaved_fields(db, track) == {"genre"}

    def test_restored_is_unsaved(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", value="Techno")
        write_row(db, track, "genre", "restored", value="House")
        assert unsaved_fields(db, track) == {"genre"}

    def test_written_again_after_a_restore_is_saved(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", value="Techno")
        write_row(db, track, "genre", "restored", value="House")
        write_row(db, track, "genre", value="Techno")
        assert unsaved_fields(db, track) == set()

    def test_a_key_written_as_8a_is_saved_for_a_minor(self, db, meta):
        track = add_track(db, key="C")
        meta.set_override(track, "key", "Am")
        assert unsaved_fields(db, track) == {"key"}
        write_row(db, track, "key", value="8A")
        assert unsaved_fields(db, track) == set()

    def test_a_key_written_in_any_style_counts(self, db, meta):
        track = add_track(db, key="C")
        meta.set_override(track, "key", "8A")
        write_row(db, track, "key", value="Am")
        assert unsaved_fields(db, track) == set()

    def test_bpm_written_as_text_is_compared_to_two_decimals(self, db, meta):
        track = add_track(db, bpm=120.0)
        meta.set_override(track, "bpm", 124.5)
        write_row(db, track, "bpm", value="124.50")
        assert unsaved_fields(db, track) == set()

    def test_a_pending_row_is_ignored(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", value="Techno", pending=1)
        assert unsaved_fields(db, track) == {"genre"}

    def test_a_pending_row_after_a_confirmed_write_changes_nothing(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", value="Techno")
        write_row(db, track, "genre", value="Other", pending=1)
        assert unsaved_fields(db, track) == set()

    @pytest.mark.parametrize("outcome", ["skipped", "failed"])
    def test_a_skipped_or_failed_row_is_not_a_write(self, db, meta, outcome):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", value="Techno")
        write_row(db, track, "genre", outcome, value="Techno")
        assert unsaved_fields(db, track) == set()

    def test_a_comment_slot_is_not_a_value(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(
            db,
            track,
            "genre",
            new_value_json='{"COMM": [["eng", "", ["Techno"]]], "TCON": ["House"]}',
        )
        assert unsaved_fields(db, track) == {"genre"}

    def test_one_field_s_write_does_not_save_another(self, db, meta):
        track = add_track(db, genre="House", label="L")
        meta.set_override(track, "genre", "Techno")
        meta.set_override(track, "label", "Other")
        write_row(db, track, "genre", value="Techno")
        assert unsaved_fields(db, track) == {"label"}

    @pytest.mark.parametrize("path", ["/m/a.wav", "/m/a.WAV", "/m/a.m4a", ""])
    def test_a_file_that_is_not_written_is_excluded(self, db, meta, path):
        track = add_track(db, path)
        meta.set_override(track, "genre", "Techno")
        assert unsaved_fields(db, track) == set()

    @pytest.mark.parametrize(
        "path",
        ["/m/a.mp3", "/m/a.MP3", "/m/a.flac", "/m/a.ogg", "/m/a.aif", "/m/a.aiff"],
    )
    def test_a_file_that_is_written_is_included(self, db, meta, path):
        track = add_track(db, path)
        meta.set_override(track, "genre", "Techno")
        assert unsaved_fields(db, track) == {"genre"}

    def test_the_suffixes_are_the_ones_the_writer_writes(self):
        assert set(UNSAVED_FILE_SUFFIXES) == set(_FORMAT_BY_SUFFIX)

    def test_the_fields_are_the_five_a_save_writes(self):
        assert UNSAVED_FIELDS == ("key", "genre", "label", "year", "bpm")


@pytest.mark.unit
class TestCounts:
    def test_tracks_and_fields(self, db, repo, meta):
        a = add_track(db, "/m/a.mp3", genre="House")
        b = add_track(db, "/m/b.mp3")
        add_track(db, "/m/c.mp3")
        meta.set_override(a, "genre", "Techno")
        meta.set_override(a, "bpm", 130.0)
        meta.set_override(b, "bpm", 128.0)

        counts = repo.unsaved(None)

        assert counts.tracks == 2
        assert counts.fields == {"key": 0, "genre": 1, "label": 0, "year": 0, "bpm": 2}

    def test_nothing_unsaved_is_zero_everywhere(self, db, repo):
        add_track(db)
        counts = repo.unsaved(None)
        assert (counts.tracks, sum(counts.fields.values())) == (0, 0)

    def test_a_playlist_counts_only_its_own_tracks(self, db, repo, meta):
        a = add_track(db, "/m/a.mp3")
        b = add_track(db, "/m/b.mp3")
        meta.set_override(a, "genre", "Techno")
        meta.set_override(b, "bpm", 128.0)
        mine = add_playlist(db, "Mine", [a])

        counts = repo.unsaved(mine)

        assert counts.tracks == 1
        assert counts.fields["genre"] == 1 and counts.fields["bpm"] == 0

    def test_a_track_twice_in_a_playlist_counts_once(self, db, repo, meta):
        a = add_track(db)
        meta.set_override(a, "genre", "Techno")
        playlist = add_playlist(db, "Twice", [a, a])
        assert repo.unsaved(playlist).tracks == 1

    def test_only_playlists_exist_as_playlists(self, db, repo):
        folder = add_playlist(db, "F", kind="folder")
        playlist = add_playlist(db, "P", parent=folder)
        assert repo.playlist_exists(playlist)
        assert not repo.playlist_exists(folder)
        assert not repo.playlist_exists(999)


@pytest.mark.unit
class TestFilterField:
    def test_the_field_is_a_boolean_in_files_and_facetable(self):
        spec = field_spec("unsaved_values")
        assert (spec.type, spec.group, spec.facetable) == ("bool", "Files", True)
        assert spec.label == "New values not in the files yet"

    def test_the_rule_finds_the_tracks_the_repository_counts(self, db, repo, meta):
        a = add_track(db, "/m/a.mp3", genre="House")
        b = add_track(db, "/m/b.mp3", genre="House")
        c = add_track(db, "/m/c.wav")
        meta.set_override(a, "genre", "Techno")
        meta.set_override(b, "genre", "Techno")
        write_row(db, b, "genre", value="Techno")
        meta.set_override(c, "genre", "Techno")

        def count(value: bool) -> int:
            query = BrowseQuery(
                rules=RuleSet(rules=(FilterRule("unsaved_values", "is", value),))
            )
            sql, params = build_count(query)
            return int(db.connect().execute(sql, params).fetchone()[0])

        assert count(True) == repo.unsaved(None).tracks == 1
        assert count(False) == 2

    def test_it_composes_with_another_field(self, db, meta):
        a = add_track(db, "/m/a.mp3", genre="House")
        meta.set_override(a, "genre", "Techno")
        query = BrowseQuery(
            rules=RuleSet(
                rules=(
                    FilterRule("unsaved_values", "is", True),
                    FilterRule("genre", "is", "Techno"),
                )
            )
        )
        sql, params = build_count(query)
        assert db.connect().execute(sql, params).fetchone()[0] == 1


@pytest.mark.unit
class TestSkippedRecords:
    """A skip that kept the value the file already held is a record of it."""

    def test_skipped_with_the_value_is_saved(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", "skipped", value="Techno")
        assert unsaved_fields(db, track) == set()

    def test_skipped_then_edited_is_unsaved(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", "skipped", value="Techno")
        meta.set_override(track, "genre", "Trance")
        assert unsaved_fields(db, track) == {"genre"}

    def test_a_restore_after_a_skip_is_unsaved(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", "skipped", value="Techno")
        write_row(db, track, "genre", "restored", value="House")
        assert unsaved_fields(db, track) == {"genre"}

    def test_a_skip_that_kept_another_value_is_unsaved(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", "skipped", value="Trance")
        assert unsaved_fields(db, track) == {"genre"}

    def test_a_skip_without_a_value_is_no_record(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", value="Techno")
        write_row(db, track, "genre", "skipped")  # e.g. a file that was missing
        assert unsaved_fields(db, track) == set()

    def test_a_restores_own_skip_is_no_record_of_a_value(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        written = write_row(db, track, "genre", value="Techno")
        # "the file had moved on": a restore's skip says nothing about the value
        write_row(db, track, "genre", "skipped", value="House", restore_of=written)
        assert unsaved_fields(db, track) == set()

    def test_a_pending_skip_is_ignored(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", "skipped", value="Techno", pending=1)
        assert unsaved_fields(db, track) == {"genre"}


@pytest.mark.unit
class TestTheFileTheRecordIsAbout:
    def test_a_write_to_another_path_is_not_a_write_to_this_file(self, db, meta):
        track = add_track(db, "/m/new.mp3", genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", value="Techno", file_path="/m/old.mp3")
        assert unsaved_fields(db, track) == {"genre"}

    def test_a_skip_for_another_path_is_not_either(self, db, meta):
        track = add_track(db, "/m/new.mp3", genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", "skipped", value="Techno", file_path="/m/o.mp3")
        assert unsaved_fields(db, track) == {"genre"}

    def test_a_write_to_this_path_still_counts(self, db, meta):
        track = add_track(db, "/m/new.mp3", genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", value="Techno", file_path="/m/new.mp3")
        assert unsaved_fields(db, track) == set()


@pytest.mark.unit
class TestBpmAndYear:
    def test_bpm_within_half_a_hundredth_is_the_same(self, db, meta):
        track = add_track(db, bpm=124.5)
        meta.set_override(track, "bpm", 124.504)
        assert unsaved_fields(db, track) == set()
        meta.set_override(track, "bpm", 124.51)
        assert unsaved_fields(db, track) == {"bpm"}

    def test_a_written_bpm_is_compared_with_the_same_tolerance(self, db, meta):
        track = add_track(db, bpm=100.0)
        meta.set_override(track, "bpm", 124.125)  # the writer rounds half to even
        write_row(db, track, "bpm", value="124.12")
        assert unsaved_fields(db, track) == set()

    @pytest.mark.parametrize("bpm", [0.0, -5.0])
    def test_a_bpm_that_is_not_positive_is_no_value(self, db, meta, bpm):
        track = add_track(db)
        meta.set_override(track, "bpm", bpm)
        assert unsaved_fields(db, track) == set()

    @pytest.mark.parametrize("year", [1850, 1899, 2101, 3000])
    def test_a_year_out_of_range_is_no_value(self, db, meta, year):
        track = add_track(db)
        meta.set_override(track, "year", year)
        assert unsaved_fields(db, track) == set()

    @pytest.mark.parametrize("year", [1900, 2100])
    def test_a_year_in_range_is_a_value(self, db, meta, year):
        track = add_track(db)
        meta.set_override(track, "year", year)
        assert unsaved_fields(db, track) == {"year"}


@pytest.mark.unit
class TestWhatTheWriterWrites:
    """Rows made by the real code path leave nothing unsaved."""

    @pytest.mark.parametrize(
        ("suffix", "tag_format"),
        [(".mp3", "id3"), (".flac", "flac"), (".ogg", "vorbis")],
    )
    @pytest.mark.parametrize("key_format", ["normal", "camelot", "short"])
    def test_written_rows_save_every_field(
        self, db, meta, suffix, tag_format, key_format
    ):
        from cuepoint.data.tag_fields import predicted_value
        from cuepoint.data.tag_writer import _normalize_year
        from cuepoint.services.tag_write_service import _dumps, bpm_text, key_text

        track = add_track(db, f"/m/a{suffix}", key="C", bpm=100.0, year=2000)
        values = {"key": "Am", "genre": "Techno", "label": "Lab", "year": 2021}
        for field, value in values.items():
            meta.set_override(track, field, value)
        meta.set_override(track, "bpm", 124.5)
        assert unsaved_fields(db, track) == {"key", "genre", "label", "year", "bpm"}

        texts = {
            "key": key_text("Am", key_format)[0],
            "genre": "Techno",
            "label": "Lab",
            "year": _normalize_year("2021"),
            "bpm": bpm_text(124.5),
        }
        for field, text in texts.items():
            row = _dumps(predicted_value(tag_format, field, text))
            write_row(db, track, field, new_value_json=row)

        assert unsaved_fields(db, track) == set()

    def test_the_same_rows_recorded_as_skips_also_save(self, db, meta):
        from cuepoint.data.tag_fields import predicted_value
        from cuepoint.services.tag_write_service import _dumps, bpm_text

        track = add_track(db, "/m/a.flac", bpm=100.0)
        meta.set_override(track, "bpm", 124.98)
        row = _dumps(predicted_value("flac", "bpm", bpm_text(124.98)))
        write_row(db, track, "bpm", "skipped", new_value_json=row)
        assert unsaved_fields(db, track) == set()

    def test_a_row_whose_value_is_json_null_is_unsaved(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre", new_value_json="null")
        assert unsaved_fields(db, track) == {"genre"}

    def test_a_row_with_no_value_at_all_is_unsaved(self, db, meta):
        track = add_track(db, genre="House")
        meta.set_override(track, "genre", "Techno")
        write_row(db, track, "genre")
        assert unsaved_fields(db, track) == {"genre"}
