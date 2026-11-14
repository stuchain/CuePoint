#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Finding missing files in a folder (DEC-073): where the file is now, nothing more.

The walk runs over a real temporary tree. Two same-named files are told apart by
their real length, with tiny generated WAVs.
"""

from __future__ import annotations

import os
import unicodedata
import wave
from pathlib import Path
from typing import List

import pytest

from cuepoint.models.library_track import normalize_path
from cuepoint.services import file_find_service
from cuepoint.services.file_find_service import (
    FileFindResult,
    WantedFile,
    file_name_key,
    find_files,
)


def wav(path: Path, seconds: int) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(1)
        out.setframerate(100)
        out.writeframes(b"\x80" * (100 * seconds))
    return path


def touch(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x")
    return path


def find(folder: Path, *wanted: WantedFile, **kwargs) -> FileFindResult:
    return find_files(str(folder), list(wanted), **kwargs)


@pytest.mark.unit
class TestFindingFiles:
    def test_one_file_with_the_name_is_the_answer(self, tmp_path):
        target = touch(tmp_path / "deep" / "er" / "Iron Harbor.WAV")

        result = find(tmp_path, WantedFile(1, "/Users/dj/Music/iron harbor.wav"))

        assert result.found == [{"track_id": 1, "path": str(target)}]
        assert result.ambiguous == [] and result.not_found == []
        assert result.looked == 1 and not result.truncated

    def test_a_windows_path_is_read_by_its_last_segment(self, tmp_path):
        target = touch(tmp_path / "a.mp3")

        result = find(tmp_path, WantedFile(1, "E:\\Music\\Old\\A.mp3"))

        assert result.found[0]["path"] == str(target)

    def test_a_file_that_is_another_library_tracks_is_not_found(self, tmp_path):
        taken = touch(tmp_path / "x" / "Low Lagoon.wav")
        owners = {normalize_path(str(taken)): [99]}

        result = find(
            tmp_path,
            WantedFile(7, "/m/Low Lagoon.wav", None),
            path_owners=lambda paths: {p: owners[p] for p in paths if p in owners},
        )

        assert result.found == []
        assert result.not_found == [7]

    def test_a_taken_file_leaves_the_free_one_as_the_only_candidate(self, tmp_path):
        taken = touch(tmp_path / "x" / "Low Lagoon.wav")
        free = touch(tmp_path / "y" / "Low Lagoon.wav")
        owners = {normalize_path(str(taken)): [99]}

        result = find(
            tmp_path,
            WantedFile(7, "/m/Low Lagoon.wav", None),
            path_owners=lambda paths: {p: owners[p] for p in paths if p in owners},
        )

        assert result.found == [{"track_id": 7, "path": str(free)}]

    def test_a_file_the_wanted_track_holds_itself_is_still_found(self, tmp_path):
        own = touch(tmp_path / "x" / "Low Lagoon.wav")
        owners = {normalize_path(str(own)): [7]}

        result = find(
            tmp_path,
            WantedFile(7, "/m/Low Lagoon.wav", None),
            path_owners=lambda paths: {p: owners[p] for p in paths if p in owners},
        )

        assert result.found == [{"track_id": 7, "path": str(own)}]

    def test_same_name_twice_is_settled_by_length(self, tmp_path):
        wav(tmp_path / "x" / "Low Lagoon.wav", 5)
        right = wav(tmp_path / "y" / "Low Lagoon.wav", 20)

        result = find(tmp_path, WantedFile(7, "/m/Low Lagoon.wav", 21))

        assert result.found == [{"track_id": 7, "path": str(right)}]

    def test_same_name_twice_with_no_length_to_tell_them_is_ambiguous(self, tmp_path):
        wav(tmp_path / "x" / "Low Lagoon.wav", 5)
        wav(tmp_path / "y" / "Low Lagoon.wav", 20)

        no_length = find(tmp_path, WantedFile(7, "/m/Low Lagoon.wav", None))
        wrong_length = find(tmp_path, WantedFile(7, "/m/Low Lagoon.wav", 100))

        for result in (no_length, wrong_length):
            assert result.found == []
            assert result.ambiguous == [{"track_id": 7, "count": 2}]
            assert result.not_found == []

    def test_two_files_both_close_in_length_stay_ambiguous(self, tmp_path):
        wav(tmp_path / "x" / "T.wav", 20)
        wav(tmp_path / "y" / "T.wav", 21)

        result = find(tmp_path, WantedFile(1, "/m/T.wav", 20))

        assert result.ambiguous == [{"track_id": 1, "count": 2}]

    def test_a_name_that_is_not_there_is_not_found(self, tmp_path):
        touch(tmp_path / "Other.mp3")

        result = find(tmp_path, WantedFile(3, "/m/Missing.mp3"))

        assert result.not_found == [3] and result.found == []

    def test_only_audio_files_count(self, tmp_path):
        touch(tmp_path / "Song.txt")

        result = find(tmp_path, WantedFile(3, "/m/Song.txt"))

        assert result.not_found == [3]

    def test_each_wanted_track_is_answered_once(self, tmp_path):
        one = touch(tmp_path / "One.mp3")

        result = find(
            tmp_path, WantedFile(1, "/m/One.mp3"), WantedFile(2, "/m/Two.mp3")
        )

        assert result.found == [{"track_id": 1, "path": str(one)}]
        assert result.not_found == [2]

    def test_hidden_folders_are_not_entered(self, tmp_path):
        touch(tmp_path / ".Trash" / "Gone.mp3")
        touch(tmp_path / "$RECYCLE.BIN" / "Gone.mp3")

        result = find(tmp_path, WantedFile(1, "/m/Gone.mp3"))

        assert result.not_found == [1]

    def test_a_symlinked_folder_is_not_followed(self, tmp_path):
        outside = tmp_path / "outside"
        touch(outside / "Gone.mp3")
        root = tmp_path / "root"
        root.mkdir()
        try:
            os.symlink(outside, root / "link", target_is_directory=True)
            os.symlink(root, root / "loop", target_is_directory=True)
        except (OSError, NotImplementedError):
            pytest.skip("symlinks are not available here")

        result = find(root, WantedFile(1, "/m/Gone.mp3"))

        assert result.not_found == [1]
        assert result.looked == 0

    def test_cancelling_stops_between_folders(self, tmp_path):
        touch(tmp_path / "a" / "One.mp3")
        touch(tmp_path / "b" / "Two.mp3")
        asked: List[int] = []

        def cancel() -> bool:
            asked.append(1)
            return len(asked) > 1

        result = find(tmp_path, WantedFile(1, "/m/One.mp3"), should_cancel=cancel)

        assert result.cancelled
        assert result.not_found == [1]

    def test_it_stops_and_says_so_at_the_cap(self, tmp_path):
        for number in range(5):
            touch(tmp_path / f"f{number}.mp3")

        result = find(tmp_path, WantedFile(1, "/m/nope.mp3"), max_files=3)

        assert result.truncated and result.looked == 3

    def test_it_reports_the_folders_it_has_scanned(self, tmp_path):
        touch(tmp_path / "a" / "One.mp3")
        ticks: List[tuple] = []

        find(
            tmp_path,
            WantedFile(1, "/m/One.mp3"),
            on_progress=lambda done, known: ticks.append((done, known)),
        )

        assert ticks[-1] == (2, 2)

    def test_it_writes_nothing(self, tmp_path):
        touch(tmp_path / "One.mp3")
        before = sorted(os.listdir(tmp_path))

        find(tmp_path, WantedFile(1, "/m/One.mp3"))

        assert sorted(os.listdir(tmp_path)) == before

    def test_file_name_key_casefolds(self):
        assert file_name_key("C:\\Music\\ÄÖ.MP3") == "äö.mp3"


@pytest.mark.unit
class TestSharedAndLookAlikeNames:
    def test_one_file_is_never_given_to_two_tracks(self, tmp_path):
        touch(tmp_path / "Same.mp3")

        result = find(
            tmp_path, WantedFile(1, "/a/Same.mp3"), WantedFile(2, "/b/Same.mp3")
        )

        assert result.found == []
        assert result.ambiguous == [
            {"track_id": 1, "count": 1},
            {"track_id": 2, "count": 1},
        ]

    def test_two_tracks_with_one_name_are_each_given_theirs_by_length(self, tmp_path):
        short = wav(tmp_path / "x" / "Same.wav", 5)
        long = wav(tmp_path / "y" / "Same.wav", 20)

        result = find(
            tmp_path,
            WantedFile(1, "/a/Same.wav", 5),
            WantedFile(2, "/b/Same.wav", 20),
        )

        assert result.found == [
            {"track_id": 1, "path": str(short)},
            {"track_id": 2, "path": str(long)},
        ]

    def test_two_tracks_of_one_length_do_not_share_the_one_file(self, tmp_path):
        wav(tmp_path / "Same.wav", 5)

        result = find(
            tmp_path,
            WantedFile(1, "/a/Same.wav", 5),
            WantedFile(2, "/b/Same.wav", 5),
        )

        assert result.found == [] and len(result.ambiguous) == 2

    def test_a_lone_file_is_found_whatever_its_length(self, tmp_path):
        target = wav(tmp_path / "Same.wav", 5)

        result = find(tmp_path, WantedFile(1, "/a/Same.wav", 300))

        assert result.found == [{"track_id": 1, "path": str(target)}]
        assert result.not_found == [] and result.ambiguous == []

    def test_a_lone_file_wanted_by_two_tracks_is_settled_by_length(self, tmp_path):
        target = wav(tmp_path / "Same.wav", 5)

        result = find(
            tmp_path,
            WantedFile(1, "/a/Same.wav", 300),
            WantedFile(2, "/b/Same.wav", 5),
        )

        assert result.found == [{"track_id": 2, "path": str(target)}]
        assert [entry["track_id"] for entry in result.ambiguous] == [1]

    def test_a_lone_file_of_the_right_length_is_found(self, tmp_path):
        target = wav(tmp_path / "Same.wav", 5)

        result = find(tmp_path, WantedFile(1, "/a/Same.wav", 6))

        assert result.found == [{"track_id": 1, "path": str(target)}]

    def test_a_name_a_mac_spells_with_combining_accents_matches(self, tmp_path):
        decomposed = unicodedata.normalize("NFD", "Café Del Mar.mp3")
        target = touch(tmp_path / decomposed)

        result = find(
            tmp_path, WantedFile(1, unicodedata.normalize("NFC", "/m/Café del mar.mp3"))
        )

        assert result.found == [{"track_id": 1, "path": str(target)}]

    def test_a_folder_reached_twice_is_read_once(self, tmp_path, monkeypatch):
        touch(tmp_path / "a" / "One.mp3")
        touch(tmp_path / "b" / "One.mp3")
        monkeypatch.setattr(
            file_find_service,
            "_directory_identity",
            lambda path: None if path == str(tmp_path) else (1, 1),
        )

        result = find(tmp_path, WantedFile(1, "/m/One.mp3"))

        # The second of the two folders is the same one (a bind mount or junction).
        assert result.looked == 1
        assert len(result.found) == 1

    def test_a_junction_is_not_entered(self, tmp_path, monkeypatch):
        touch(tmp_path / "linked" / "One.mp3")
        monkeypatch.setattr(
            file_find_service, "_is_link_to_elsewhere", lambda entry: True
        )

        result = find(tmp_path, WantedFile(1, "/m/One.mp3"))

        assert result.not_found == [1]

    def test_cancelling_is_polled_while_lengths_are_read(self, tmp_path):
        wav(tmp_path / "x" / "Same.wav", 5)
        wav(tmp_path / "y" / "Same.wav", 20)
        calls: List[int] = []

        result = find(
            tmp_path,
            WantedFile(1, "/a/Same.wav", 5),
            WantedFile(2, "/b/Same.wav", 20),
            should_cancel=lambda: len(calls.append(1) or calls) > 2,
        )

        assert result.cancelled
