"""Tests for sticky column helpers (Rollout Phase B)."""

from cuepoint.ui.widgets.results_column_layout import sticky_left_offset


def test_sticky_left_offset_sums_prior_column_widths():
    widths = [36, 48, 140, 120]
    assert sticky_left_offset(widths, 0) == 0
    assert sticky_left_offset(widths, 1) == 36
    assert sticky_left_offset(widths, 2) == 84
