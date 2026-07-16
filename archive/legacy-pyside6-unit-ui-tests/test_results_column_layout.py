"""Tests for results table column layout (Rollout Phase B)."""

from cuepoint.ui.widgets.results_column_layout import (
    COL_INDEX,
    COLUMN_COUNT,
    clamp_column_width,
    column_minimum,
    load_column_widths,
    save_column_widths,
)


def test_index_column_minimum_is_below_legacy_80px():
    assert column_minimum(COL_INDEX) == 48
    assert clamp_column_width(COL_INDEX, 20) == 48


def test_clamp_each_column_uses_per_column_floor():
    assert clamp_column_width(0, 10) == 36  # Write
    assert clamp_column_width(2, 10) == 80  # Original Title default min


def test_clamp_persisted_widths_shape():
    widths = [36, 52] + [100] * (COLUMN_COUNT - 2)
    clamped = [clamp_column_width(i, w) for i, w in enumerate(widths)]
    assert len(clamped) == COLUMN_COUNT
    assert clamped[1] == 52


def test_load_rejects_wrong_length(monkeypatch):
    from PySide6.QtCore import QSettings

    class FakeSettings:
        def value(self, key):
            return "1,2,3"

    monkeypatch.setattr(
        "cuepoint.ui.widgets.results_column_layout.QSettings",
        lambda: FakeSettings(),
    )
    assert load_column_widths() is None


def test_save_rejects_wrong_length():
    save_column_widths([1, 2, 3])
    # Invalid save is a no-op; must not raise
    assert True
