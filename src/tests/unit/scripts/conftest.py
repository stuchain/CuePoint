"""Fixtures for the script tests."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _bench_leg(monkeypatch):
    """Hold every bench to the Linux leg's budgets, whatever machine runs the tests.

    A bench reads its budgets for the leg it runs on (``scripts/budget_check.py``), and the
    Intel Mac's are 2.5 times the others'. A test that checks a budget's value must not
    depend on which runner it is on; the tests of the legs themselves set their own.
    """
    monkeypatch.setenv("CUEPOINT_BENCH_LEG", "linux-x64")
