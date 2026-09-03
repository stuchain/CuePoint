#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Unit tests for the persistent library track and its identity rules.

Identity is the mechanism that decides whether a user's tags, ratings and
collection membership survive a Rekordbox re-import, so DEC-002's rules get
explicit coverage: Rekordbox TrackID first, normalized path as a fallback, and
a re-link flag whenever the fallback is what matched.
"""

from __future__ import annotations

import pytest

from cuepoint.models.library_track import (
    IdentityMatch,
    LibraryTrack,
    normalize_path,
    resolve_identity,
)


def _track(track_id: str = "1", path: str = "/music/a.mp3", **kwargs) -> LibraryTrack:
    kwargs.setdefault("title", "Title")
    kwargs.setdefault("artist", "Artist")
    return LibraryTrack(rekordbox_track_id=track_id, file_path=path, **kwargs)


@pytest.mark.unit
class TestNormalizePath:
    def test_empty_inputs_yield_empty(self):
        assert normalize_path(None) == ""
        assert normalize_path("") == ""
        assert normalize_path("   ") == ""

    def test_backslashes_become_forward_slashes(self):
        assert normalize_path(r"C:\Music\Track.mp3") == "c:/music/track.mp3"

    def test_case_is_folded(self):
        assert normalize_path("/Music/Track.MP3") == normalize_path("/music/track.mp3")

    def test_windows_and_posix_forms_of_same_path_agree(self):
        """The same file written either way must compare equal."""
        assert normalize_path(r"D:\DJ\Sets\track.aiff") == normalize_path(
            "D:/DJ/Sets/track.aiff"
        )

    def test_redundant_segments_collapsed(self):
        assert normalize_path("/music//sub/./track.mp3") == "/music/sub/track.mp3"

    def test_trailing_separator_ignored(self):
        assert normalize_path("/music/folder/") == normalize_path("/music/folder")

    def test_root_is_preserved(self):
        assert normalize_path("/") == "/"

    def test_unicode_paths(self):
        assert normalize_path("/Müsik/Träck.mp3") == "/müsik/träck.mp3"

    def test_distinct_paths_stay_distinct(self):
        assert normalize_path("/music/a.mp3") != normalize_path("/music/b.mp3")


@pytest.mark.unit
class TestLibraryTrack:
    def test_requires_rekordbox_track_id(self):
        with pytest.raises(ValueError, match="rekordbox_track_id"):
            LibraryTrack(rekordbox_track_id="", title="T", artist="A")
        with pytest.raises(ValueError, match="rekordbox_track_id"):
            LibraryTrack(rekordbox_track_id="   ", title="T", artist="A")

    def test_track_id_is_stripped(self):
        assert _track(track_id="  42  ").rekordbox_track_id == "42"

    def test_normalized_path_is_derived(self):
        assert _track(path=r"C:\Music\A.mp3").normalized_path == "c:/music/a.mp3"

    def test_original_path_is_preserved_verbatim(self):
        """The user must always be able to see the path Rekordbox gave."""
        raw = r"C:\Music\A.mp3"
        assert _track(path=raw).file_path == raw

    def test_caller_supplied_normalized_path_is_overridden(self):
        """Derived, so it can never drift out of step with file_path."""
        track = LibraryTrack(
            rekordbox_track_id="1",
            title="T",
            artist="A",
            file_path="/music/a.mp3",
            normalized_path="/nonsense",
        )
        assert track.normalized_path == "/music/a.mp3"

    def test_bpm_coerced_to_float(self):
        assert _track(bpm="128").bpm == 128.0

    @pytest.mark.parametrize("bad", [0, -1, 301])
    def test_bpm_out_of_range_rejected(self, bad):
        with pytest.raises(ValueError, match="bpm"):
            _track(bpm=bad)

    def test_year_coerced_to_int(self):
        assert _track(year="2021").year == 2021

    def test_optional_fields_default_to_none(self):
        track = _track()
        assert track.id is None
        assert track.remixer is None
        assert track.bpm is None

    def test_dec034_fields_default_to_none(self):
        """Unknown, not zero — Rekordbox omits these attributes freely."""
        track = _track()
        assert track.rating is None
        assert track.play_count is None
        assert track.colour is None
        assert track.date_added is None
        assert track.comment is None
        assert track.total_time is None
        assert track.bitrate is None

    @pytest.mark.parametrize("stars", [0, 1, 2, 3, 4, 5])
    def test_rating_accepts_every_star_count(self, stars):
        assert _track(rating=stars).rating == stars

    @pytest.mark.parametrize("raw", [51, 102, 153, 204, 255, -1, 6])
    def test_rating_rejects_rekordbox_raw_values(self, raw):
        """The DEC-034 trap: Rekordbox stores 0/51/.../255, CuePoint stores 0-5.

        Converting belongs to the parser (LIBRARY-02). This guard is what makes
        forgetting it a failure rather than a library of five-star tracks.
        """
        with pytest.raises(ValueError, match="rating"):
            _track(rating=raw)

    def test_numeric_dec034_fields_coerced_to_int(self):
        track = _track(rating="3", play_count="17", total_time="421", bitrate="320")
        assert (track.rating, track.play_count, track.total_time, track.bitrate) == (
            3,
            17,
            421,
            320,
        )

    def test_touch_updates_timestamp(self):
        track = _track()
        original = track.updated_at
        track.updated_at = "2000-01-01T00:00:00+00:00"
        track.touch()
        assert track.updated_at != "2000-01-01T00:00:00+00:00"
        assert track.created_at <= track.updated_at or original

    def test_to_dict_round_trips_through_from_row(self):
        track = _track(
            track_id="7",
            path="/music/x.flac",
            title="Song",
            artist="Someone",
            remixer="Remixer",
            album="Album",
            label="Label",
            genre="House",
            key="8A",
            bpm=124.5,
            year=2022,
            duration_seconds=380,
            rating=5,
            play_count=9,
            colour="0xFF007F",
            date_added="2024-03-01",
            comment="peak time",
            total_time=380,
            bitrate=320,
        )
        restored = LibraryTrack.from_row(track.to_dict())

        assert restored.to_dict() == track.to_dict()

    def test_from_row_tolerates_missing_optional_columns(self):
        restored = LibraryTrack.from_row(
            {"rekordbox_track_id": "9", "title": "T", "artist": "A"}
        )
        assert restored.rekordbox_track_id == "9"
        assert restored.file_path == ""
        assert restored.normalized_path == ""


@pytest.mark.unit
class TestResolveIdentity:
    """DEC-002: TrackID first, normalized path as fallback, re-links flagged."""

    @staticmethod
    def _finders(by_id=None, by_path=None):
        by_id = by_id or {}
        by_path = by_path or {}
        return (lambda tid: by_id.get(tid), lambda p: by_path.get(p))

    def test_matches_on_rekordbox_id(self):
        existing = _track(track_id="1", path="/music/a.mp3")
        find_id, find_path = self._finders(by_id={"1": existing})

        match = resolve_identity("1", "/music/a.mp3", find_id, find_path)

        assert isinstance(match, IdentityMatch)
        assert match.track is existing
        assert match.matched_by == "rekordbox_id"
        assert match.relinked is False

    def test_same_id_different_path_is_still_the_same_track(self):
        """A moved file keeps its identity when the TrackID is unchanged."""
        existing = _track(track_id="1", path="/old/a.mp3")
        find_id, find_path = self._finders(by_id={"1": existing})

        match = resolve_identity("1", "/new/location/a.mp3", find_id, find_path)

        assert match is not None
        assert match.matched_by == "rekordbox_id"
        assert match.relinked is False

    def test_different_id_same_path_relinks(self):
        """Rekordbox renumbered the track; the file is the same one."""
        existing = _track(track_id="1", path="/music/a.mp3")
        find_id, find_path = self._finders(by_path={"/music/a.mp3": existing})

        match = resolve_identity("999", "/music/a.mp3", find_id, find_path)

        assert match is not None
        assert match.track is existing
        assert match.matched_by == "path"
        assert match.relinked is True, "a renumbered track must be reported, not silent"

    def test_path_fallback_matches_across_separator_styles(self):
        existing = _track(track_id="1", path="/music/a.mp3")
        find_id, find_path = self._finders(by_path={"c:/music/a.mp3": existing})

        match = resolve_identity("999", r"C:\Music\A.mp3", find_id, find_path)

        assert match is not None
        assert match.matched_by == "path"

    def test_path_match_with_unchanged_id_is_not_a_relink(self):
        existing = _track(track_id="1", path="/music/a.mp3")
        find_id, find_path = self._finders(by_path={"/music/a.mp3": existing})

        match = resolve_identity("1", "/music/a.mp3", find_id, find_path)

        assert match is not None
        assert match.matched_by == "path"
        assert match.relinked is False

    def test_rekordbox_id_takes_precedence_over_path(self):
        """Otherwise a shared path could hijack a track that matched by ID."""
        by_id_track = _track(track_id="1", path="/music/a.mp3")
        by_path_track = _track(track_id="2", path="/music/a.mp3")
        find_id, find_path = self._finders(
            by_id={"1": by_id_track}, by_path={"/music/a.mp3": by_path_track}
        )

        match = resolve_identity("1", "/music/a.mp3", find_id, find_path)

        assert match is not None
        assert match.track is by_id_track
        assert match.matched_by == "rekordbox_id"

    def test_unknown_track_returns_none(self):
        find_id, find_path = self._finders()
        assert resolve_identity("1", "/music/a.mp3", find_id, find_path) is None

    def test_empty_path_cannot_fall_back(self):
        existing = _track(track_id="1", path="")
        find_id, find_path = self._finders(by_path={"": existing})

        assert resolve_identity("999", "", find_id, find_path) is None
        assert resolve_identity("999", None, find_id, find_path) is None

    def test_blank_id_still_allows_path_fallback(self):
        existing = _track(track_id="1", path="/music/a.mp3")
        find_id, find_path = self._finders(by_path={"/music/a.mp3": existing})

        match = resolve_identity("", "/music/a.mp3", find_id, find_path)

        assert match is not None
        assert match.matched_by == "path"
        assert match.relinked is True
