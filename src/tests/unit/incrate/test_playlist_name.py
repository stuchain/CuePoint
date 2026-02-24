"""Unit tests for playlist_name.default_playlist_name (Phase 4)."""

from datetime import date

import pytest

from cuepoint.incrate.playlist_name import default_playlist_name


class TestShortFormat:
    def test_short_format(self):
        assert default_playlist_name("short", date(2025, 2, 26)) == "feb26"

    def test_short_january(self):
        assert default_playlist_name("short", date(2025, 1, 15)) == "jan15"


class TestIsoFormat:
    def test_iso_format(self):
        assert default_playlist_name("iso", date(2025, 2, 26)) == "2025-02-26"


class TestDefaultUsesToday:
    def test_default_uses_today(self):
        result = default_playlist_name("short", reference_date=None)
        expected = default_playlist_name("short", date.today())
        assert result == expected
