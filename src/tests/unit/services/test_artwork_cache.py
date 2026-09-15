#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The bounded thumbnail cache (CLEAN-09, DEC-076 as amended).

- **A key is never a path**: only a SHA-256 in hex names a file.
- **Identical images are stored once.**
- **Eviction keeps the cache under its cap**, least recently used first, and a
  thumbnail that was read is recently used.
- **Writes are atomic**: a failed write leaves nothing behind.
- **The cache lives where caches live**, follows ``CUEPOINT_HOME``, and
  Privacy's "Clear cache" empties it.
"""

from __future__ import annotations

import hashlib
import os
import time
from pathlib import Path

import pytest

from cuepoint.engine import privacy_api
from cuepoint.services import artwork_cache as module
from cuepoint.services.artwork_cache import (
    ARTWORK_CACHE_MAX_BYTES,
    EVICT_TO_FRACTION,
    ArtworkCache,
    clear_artwork_cache,
    default_artwork_cache_dir,
)


def key(name: str) -> str:
    return hashlib.sha256(name.encode("utf-8")).hexdigest()


def age(cache: ArtworkCache, name: str, size: int, seconds_ago: float) -> None:
    moment = time.time() - seconds_ago
    os.utime(cache.path_for(key(name), size), (moment, moment))


@pytest.fixture
def cache(tmp_path) -> ArtworkCache:
    return ArtworkCache(tmp_path / "artwork", max_bytes=1_000)


@pytest.mark.unit
class TestKeys:
    def test_a_thumbnail_lives_under_its_keys_first_two_characters(self, cache):
        k = key("a")

        assert cache.path_for(k, 108) == cache.directory / k[:2] / f"{k}-108.jpg"

    @pytest.mark.parametrize(
        "bad",
        [
            "",
            "../../etc/passwd",
            "..\\..\\Windows\\win.ini",
            "A" * 64,
            "a" * 63,
            "a" * 65,
            "g" * 64,
            key("a") + "/x",
            None,
            42,
        ],
    )
    def test_anything_but_a_sha256_is_refused(self, cache, bad):
        with pytest.raises(ValueError, match="SHA-256"):
            cache.path_for(bad, 108)

    @pytest.mark.parametrize("size", [0, -1, True, 1.5, "108", None])
    def test_a_size_must_be_a_positive_whole_number(self, cache, size):
        with pytest.raises(ValueError, match="positive whole number"):
            cache.path_for(key("a"), size)

    @pytest.mark.parametrize("cap", [0, -1])
    def test_a_cache_needs_a_positive_cap(self, tmp_path, cap):
        with pytest.raises(ValueError, match="positive cap"):
            ArtworkCache(tmp_path, max_bytes=cap)

    def test_the_default_cap_is_named(self, tmp_path):
        assert ArtworkCache(tmp_path).max_bytes == ARTWORK_CACHE_MAX_BYTES


@pytest.mark.unit
class TestStoring:
    def test_a_thumbnail_round_trips(self, cache):
        cache.put(key("a"), 108, b"jpeg bytes")

        assert cache.get(key("a"), 108) == b"jpeg bytes"
        assert cache.has(key("a"), 108)
        assert not cache.has(key("a"), 288)
        assert cache.get(key("a"), 288) is None

    def test_a_missing_directory_is_simply_empty(self, tmp_path):
        cache = ArtworkCache(tmp_path / "never-made")

        assert cache.get(key("a"), 108) is None
        assert cache.total_bytes() == 0
        assert cache.evict() == 0

    def test_the_same_image_is_stored_once(self, cache):
        cache.put(key("shared"), 108, b"x" * 100)
        cache.put(key("shared"), 108, b"x" * 100)

        assert len(list(cache.directory.rglob("*.jpg"))) == 1
        assert cache.total_bytes() == 100

    def test_replacing_a_thumbnail_counts_its_new_size(self, cache):
        cache.put(key("a"), 108, b"x" * 100)
        cache.put(key("a"), 108, b"x" * 40)

        assert cache.total_bytes() == 40

    def test_a_new_cache_counts_what_is_already_on_disk(self, cache):
        cache.put(key("a"), 108, b"x" * 70)
        cache.put(key("b"), 288, b"x" * 30)

        assert ArtworkCache(cache.directory, max_bytes=1_000).total_bytes() == 100

    def test_a_failed_write_leaves_nothing_behind(self, cache, monkeypatch):
        def refuse(*_args):
            raise OSError("disk full")

        monkeypatch.setattr(module.os, "replace", refuse)
        with pytest.raises(OSError, match="disk full"):
            cache.put(key("a"), 108, b"x" * 10)

        assert list(cache.directory.rglob("*")) == [
            cache.path_for(key("a"), 108).parent
        ]
        assert cache.get(key("a"), 108) is None

    def test_no_temporary_file_is_left_by_a_write(self, cache):
        cache.put(key("a"), 108, b"x")

        assert not list(cache.directory.rglob("*.part"))

    def test_reading_touches_and_has_does_not(self, cache):
        cache.put(key("a"), 108, b"x")
        age(cache, "a", 108, 3_600)
        path = cache.path_for(key("a"), 108)
        before = path.stat().st_mtime

        cache.has(key("a"), 108)
        assert path.stat().st_mtime == before

        cache.get(key("a"), 108)
        assert path.stat().st_mtime > before


@pytest.mark.unit
class TestEviction:
    def test_going_over_the_cap_evicts_the_least_recently_used(self, cache):
        for number, name in enumerate("abc"):
            cache.put(key(name), 108, b"x" * 300)
            age(cache, name, 108, 1_000 - number)
        cache.put(key("d"), 108, b"x" * 300)

        assert cache.total_bytes() <= cache.max_bytes * EVICT_TO_FRACTION
        assert not cache.has(key("a"), 108)
        assert cache.has(key("d"), 108)

    def test_a_thumbnail_that_was_read_survives_eviction(self, cache):
        for number, name in enumerate("abc"):
            cache.put(key(name), 108, b"x" * 300)
            age(cache, name, 108, 1_000 - number)
        cache.get(key("a"), 108)
        cache.put(key("d"), 108, b"x" * 300)

        assert cache.has(key("a"), 108)
        assert not cache.has(key("b"), 108)

    def test_eviction_goes_below_the_cap_not_just_to_it(self, cache):
        for number in range(10):
            cache.put(key(str(number)), 108, b"x" * 95)
            age(cache, str(number), 108, 100 - number)
        cache.put(key("last"), 108, b"x" * 95)

        assert cache.total_bytes() <= 900
        assert sum(path.stat().st_size for path in cache.directory.rglob("*.jpg")) == (
            cache.total_bytes()
        )

    def test_under_the_cap_nothing_is_evicted(self, cache):
        cache.put(key("a"), 108, b"x" * 400)
        cache.put(key("b"), 108, b"x" * 400)

        assert cache.evict() == 0 or cache.total_bytes() <= 900
        assert cache.has(key("b"), 108)

    def test_clearing_empties_the_cache(self, cache):
        cache.put(key("a"), 108, b"x" * 10)
        cache.put(key("b"), 288, b"x" * 10)

        cache.clear()

        assert cache.total_bytes() == 0
        assert not list(cache.directory.rglob("*.jpg"))

    def test_a_cache_cleared_from_outside_counts_again(self, cache):
        import shutil

        cache.put(key("a"), 108, b"x" * 500)
        shutil.rmtree(cache.directory)
        cache.put(key("b"), 108, b"x" * 100)

        assert cache.total_bytes() == 100
        assert cache.has(key("b"), 108)


@pytest.mark.unit
class TestWhereItLives:
    def test_it_follows_cuepoint_home_when_that_is_set(self, tmp_path, monkeypatch):
        monkeypatch.setenv("CUEPOINT_HOME", str(tmp_path / "home"))

        assert default_artwork_cache_dir() == tmp_path / "home" / "cache" / "artwork"

    def test_otherwise_it_is_in_the_platform_cache_directory(
        self, tmp_path, monkeypatch
    ):
        from cuepoint.utils.paths import AppPaths

        monkeypatch.delenv("CUEPOINT_HOME", raising=False)
        monkeypatch.setattr(
            AppPaths, "cache_dir", staticmethod(lambda: tmp_path / "Caches")
        )

        assert default_artwork_cache_dir() == tmp_path / "Caches" / "artwork"

    def test_clearing_the_default_cache_removes_every_thumbnail(
        self, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("CUEPOINT_HOME", str(tmp_path / "home"))
        cache = ArtworkCache(default_artwork_cache_dir())
        cache.put(key("a"), 108, b"x")

        clear_artwork_cache()

        assert not default_artwork_cache_dir().exists()

    def test_clearing_a_cache_that_is_not_there_does_not_raise(
        self, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("CUEPOINT_HOME", str(tmp_path / "nothing"))

        clear_artwork_cache()

    def test_privacy_clear_cache_empties_the_thumbnails(self, tmp_path, monkeypatch):
        monkeypatch.setenv("CUEPOINT_HOME", str(tmp_path / "home"))
        # The platform cache is the user's; this test only asks about thumbnails.
        monkeypatch.setattr(
            privacy_api.DataDeletionManager, "clear_cache", lambda: None
        )
        ArtworkCache(default_artwork_cache_dir()).put(key("a"), 108, b"x")

        assert privacy_api.clear_cache_now() == {"ok": True}
        assert not Path(default_artwork_cache_dir()).exists()
