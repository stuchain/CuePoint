"""The tag-write bench (HARDEN-04): small enough to run on every build.

The real run (1,000 files) is by hand; this holds that it measures both paths,
leaves the writer as it found it, and fails nothing it should not.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

from cuepoint.data import tag_save, tag_writer

pytestmark = pytest.mark.unit

_SCRIPT = Path(__file__).resolve().parents[4] / "scripts" / "bench_tag_write.py"


def _load():
    spec = importlib.util.spec_from_file_location("bench_tag_write", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


bench = _load()


def test_it_times_both_paths_and_restores_the_writer():
    report = bench.run(files=6, audio_mb=0)

    assert report["files"] == 6
    for path in ("in_place", "via_copy"):
        assert report[path]["files"] == 6
        assert report[path]["failed"] == 0
        assert report[path]["total_seconds"] >= 0
    assert tag_writer.save_via_copy is tag_save.save_via_copy


def test_it_prints_json(capsys):
    assert bench.main(["--files", "4", "--json"]) == 0
    printed = json.loads(capsys.readouterr().out)
    assert printed["via_copy"]["files"] == 4
