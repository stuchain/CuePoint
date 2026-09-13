#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The matcher's input for a library track (CLEAN-03, DEC-065).

Three things are worth a test each, because each fails quietly:

1. **Every field arrives.** A field the adapter forgets is a field the stored
   question (``input_json``) silently lacks.
2. **Title and artist are the CLI's.** ``process_track`` searches and scores on
   those two alone; if Clean built them differently from ``main.py --xml``, the
   same export would match differently in the two, and nobody would see why.
   The CLI's rule is run on the same inputs and compared.
3. **Imported values, never overrides.** A key applied from an earlier match
   must not become evidence for the next one. Proved against a database holding
   an override for every field the layer has.
"""

from __future__ import annotations

from datetime import datetime

import pytest

from cuepoint.data.rekordbox import RBTrack
from cuepoint.models.compat import track_from_rbtrack
from cuepoint.models.library_track import LibraryTrack
from cuepoint.models.track import Track
from cuepoint.persistence.track_repository import TrackRepository
from cuepoint.services.database_service import DatabaseService
from cuepoint.services.match_input import (
    EARLIEST_YEAR,
    library_track_to_track,
    plausible_year,
)
from cuepoint.services.migration_runner import MigrationRunner

NOW = "2026-09-13T12:00:00+00:00"


def stored(**fields) -> LibraryTrack:
    values: dict = dict(
        id=42,
        rekordbox_track_id="9001",
        title="Strobe (Original Mix)",
        artist="deadmau5",
        file_path="D:/Music/deadmau5 - Strobe.aiff",
        album="For Lack of a Better Name",
        label="mau5trap",
        genre="Progressive House",
        key="Ebm",
        bpm=128.0,
        year=2009,
        duration_seconds=634,
        remixer="",
        rating=5,
        comment="warm-up closer",
    )
    values.update(fields)
    return LibraryTrack(**values)


class TestEveryField:
    def test_every_field_the_matcher_input_has_is_mapped(self):
        track = library_track_to_track(stored())

        assert track == Track(
            title="Strobe (Original Mix)",
            artist="deadmau5",
            album="For Lack of a Better Name",
            duration=634.0,
            bpm=128.0,
            key="Ebm",
            year=2009,
            genre="Progressive House",
            label="mau5trap",
            file_path="D:/Music/deadmau5 - Strobe.aiff",
            track_id="42",
        )

    def test_the_track_id_is_the_library_id_not_rekordboxs(self):
        assert library_track_to_track(stored(id=7)).track_id == "7"

    def test_the_duration_is_seconds_as_a_number(self):
        assert library_track_to_track(stored(duration_seconds=1)).duration == 1.0
        assert isinstance(library_track_to_track(stored()).duration, float)

    @pytest.mark.parametrize(
        "name", ["album", "label", "genre", "key", "bpm", "year", "duration_seconds"]
    )
    def test_a_missing_value_stays_missing(self, name):
        track = library_track_to_track(stored(**{name: None}))
        mapped = "duration" if name == "duration_seconds" else name
        assert getattr(track, mapped) is None

    def test_a_track_with_no_path_has_none_rather_than_an_empty_one(self):
        assert library_track_to_track(stored(file_path="")).file_path is None

    def test_a_negative_duration_is_dropped_rather_than_refusing_the_track(self):
        assert library_track_to_track(stored(duration_seconds=-3)).duration is None

    def test_it_is_the_same_type_the_processor_takes(self):
        assert type(library_track_to_track(stored())) is Track


class TestTheCLIsTitleAndArtist:
    @pytest.mark.parametrize(
        "title, artist",
        [
            ("Strobe (Original Mix)", "deadmau5"),
            ("  padded title  ", "  padded artist  "),
            ("Eric Prydz - Opus (Four Tet Remix)", ""),
            ("Eric Prydz & Four Tet - Opus", "   "),
            ("A Title With No Artist Anywhere", ""),
            ("Ame - Rej", None),
        ],
    )
    def test_the_same_title_and_artist_as_the_cli_builds(self, title, artist):
        cli = track_from_rbtrack(
            RBTrack(track_id="1", title=title, artists=artist or "")
        )
        clean = library_track_to_track(stored(title=title, artist=artist or ""))

        assert (clean.title, clean.artist) == (cli.title, cli.artist)

    def test_an_artist_is_taken_from_the_title_when_there_is_none(self):
        track = library_track_to_track(stored(title="Ame - Rej", artist=""))
        assert track.artist == "Ame"

    def test_with_nothing_to_go_on_the_artist_is_the_clis_placeholder(self):
        track = library_track_to_track(stored(title="Untitled Sketch", artist=""))
        assert track.artist == "Unknown Artist"


class TestWhatCannotBeAsked:
    @pytest.mark.parametrize("title", ["", "   "])
    def test_a_track_with_no_title_is_refused(self, title):
        with pytest.raises(ValueError, match="no title"):
            library_track_to_track(stored(title=title))

    def test_a_track_that_was_never_stored_is_refused(self):
        with pytest.raises(ValueError, match="no id"):
            library_track_to_track(stored(id=None))


class TestTheYear:
    def test_the_bounds_are_the_ones_track_applies(self):
        next_year = datetime.now().year + 1
        for year, accepted in (
            (EARLIEST_YEAR - 1, False),
            (EARLIEST_YEAR, True),
            (next_year, True),
            (next_year + 1, False),
        ):
            try:
                Track(title="t", artist="a", year=year)
                track_accepts = True
            except ValueError:
                track_accepts = False
            assert track_accepts is accepted, year
            assert (plausible_year(year) == year) is accepted, year

    @pytest.mark.parametrize("year", [1, 1899, 2999])
    def test_a_year_track_would_refuse_is_dropped_not_fatal(self, year):
        assert library_track_to_track(stored(year=year)).year is None

    def test_no_year_is_no_year(self):
        assert plausible_year(None) is None


class TestImportedValuesOnly:
    def test_overrides_in_cuepoints_layer_are_not_what_is_asked(self, tmp_path):
        db = DatabaseService(db_path=tmp_path / "cuepoint.db")
        MigrationRunner(db).migrate()
        try:
            added = TrackRepository(db).add(
                stored(
                    id=None, key="Am", bpm=124.0, genre="House", label="L", year=2001
                )
            )
            with db.transaction() as conn:
                conn.execute(
                    "INSERT INTO track_metadata"
                    " (track_id, key, bpm, genre, label, year, created_at, updated_at)"
                    " VALUES (?, 'Bm', 130.0, 'Techno', 'Other', 2020, ?, ?)",
                    (added.id, NOW, NOW),
                )

            track = library_track_to_track(TrackRepository(db).get(int(added.id)))

            assert (track.key, track.bpm, track.genre, track.label, track.year) == (
                "Am",
                124.0,
                "House",
                "L",
                2001,
            )
        finally:
            db.close_all()
