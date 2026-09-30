#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""``whole_number`` takes any integer, however large (found in WAVE-02).

It checked exactness by comparing the number with ``float(value)``, which is
exact only below 2**53. A file's modified time in nanoseconds (about 1.8e18)
is far above that, so a stored waveform's ``mtime_ns`` was refused as "not a
whole number". Nothing had passed a value that large before, which is what
makes it easy to bring back.
"""

from __future__ import annotations

import pytest

from cuepoint.models.row_values import whole_number


@pytest.mark.unit
class TestWholeNumber:
    @pytest.mark.parametrize(
        "value",
        [2**53 + 1, 1_790_751_109_773_417_677, -(2**63), 2**63 - 1, 10**30],
    )
    def test_an_integer_beyond_a_floats_precision_is_whole(self, value):
        assert whole_number(value, "n") == value

    @pytest.mark.parametrize("value, expected", [(3.0, 3), ("7", 7), (-2, -2)])
    def test_what_it_took_before_it_still_takes(self, value, expected):
        assert whole_number(value, "n") == expected

    @pytest.mark.parametrize("value", [True, 2.5, "2.5", None, "x", float("nan")])
    def test_what_it_refused_before_it_still_refuses(self, value):
        with pytest.raises(ValueError):
            whole_number(value, "n")
