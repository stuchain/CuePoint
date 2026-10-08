"""``quoted`` puts a value in a message without escaping it (REPORT-02 follow-up)."""

from __future__ import annotations

from pathlib import PurePosixPath, PureWindowsPath

import pytest

from cuepoint.reporting.scrub import ScrubContext, scrub_text
from cuepoint.utils.quoting import quoted

pytestmark = pytest.mark.unit


class TestQuoted:
    def test_a_windows_path_keeps_single_backslashes(self):
        # Regression: ``!r`` gave 'C:\\Users\\anna\\list.txt' in a message the user reads.
        path = PureWindowsPath(r"C:\Users\anna\set lists\list.txt")
        assert quoted(path) == r"'C:\Users\anna\set lists\list.txt'"
        assert quoted(str(path)) == r"'C:\Users\anna\set lists\list.txt'"

    def test_a_path_object_is_its_text(self):
        # A pure POSIX path, so Windows does not turn the slashes round.
        assert quoted(PurePosixPath("/music/a.flac")) == "'/music/a.flac'"

    def test_an_apostrophe_takes_double_quotes(self):
        assert quoted(r"C:\Music\Lovin' You.mp3") == r'''"C:\Music\Lovin' You.mp3"'''

    def test_both_quotes_fall_back_to_repr(self):
        value = """it's "this" one"""
        assert quoted(value) == repr(value)

    @pytest.mark.parametrize("value", ["two\nlines", "a\ttab", "nul\x00"])
    def test_a_control_character_falls_back_to_repr(self, value):
        assert quoted(value) == repr(value)

    def test_not_a_string_is_its_text(self):
        assert quoted(42) == "'42'"

    def test_the_scrubber_still_hides_the_quoted_path(self):
        ctx = ScrubContext(home=r"C:\Users\anna", user_name="anna")
        path = PureWindowsPath(r"C:\Users\anna\Music\Friday.txt")
        message = f"The set list could not be written to {quoted(path)}"
        assert scrub_text(message, ctx) == (
            r"The set list could not be written to '<home>\<dir>\<file>.txt'"
        )
