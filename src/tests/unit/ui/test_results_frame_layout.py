"""Tests for results frame layout (Rollout Phase C)."""

from cuepoint.ui.widgets.results_frame_layout import (
    FRAME_MAX_WIDTH_RATIO,
    FRAME_MIN_HEIGHT,
    FRAME_MIN_WIDTH,
    clamp_frame_height,
    clamp_frame_width,
    get_frame_max_width,
)


def test_frame_max_width_is_80_percent_of_viewport():
    assert get_frame_max_width(1000) == 800
    assert get_frame_max_width(1000) == int(1000 * FRAME_MAX_WIDTH_RATIO)


def test_clamp_frame_width_respects_min_and_max():
    assert clamp_frame_width(100, 1000) == FRAME_MIN_WIDTH
    assert clamp_frame_width(5000, 1000) == 800


def test_clamp_frame_height_respects_bounds():
    assert clamp_frame_height(100) == FRAME_MIN_HEIGHT
    assert clamp_frame_height(5000) == 4000
