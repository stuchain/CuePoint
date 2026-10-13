#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Regression: a library's analysis ran on the engine's own CPU (C19g).

The engine answers the app's requests (the library grid, the player, the
waveforms on screen) from threads of one Python process, and the analysis ran
in that process too: the thread that supervises each ``mpv``, the parse of its
envelope, the reduction to the overview and the detail, and the encoding.
Python runs one thread at a time, so a run over a large library took turns
with every request, and the app stuttered for as long as it ran.

The fix moves that work to a worker process; the engine keeps only the store
writes. This test pins that the work left: the same eight six-minute files,
analysed through the same service, cost the engine's own process under 0.3 of
the CPU time with the worker that they do analysed in-process.

Why CPU time and not latency. How long a run takes depends on how many cores
the machine has free, and CI shares them; a latency bound is either too loose
to catch a regression or flaky. The CPU time of *this* process
(:func:`time.process_time`, which does not count children) is the engine's
share of the work and is deterministic: it falls when the work leaves the
process and does not otherwise.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import List

import pytest

from cuepoint.data import audio_decode as ad
from cuepoint.services.analysis_worker_client import WorkerComputer
from cuepoint.services.waveform_computer import InProcessComputer, WaveformComputer
from cuepoint.services.waveform_service import WaveformService
from tests.fixtures.stub_decoder import write_stub
from tests.fixtures.waveform_library import WaveformLibrary

pytestmark = [
    pytest.mark.unit,
    pytest.mark.skipif(
        sys.platform == "win32", reason="the stub decoder is a script run by path"
    ),
]

#: Six minutes at the envelope's 150 Hz.
SIX_MINUTES = 54_000
FILES = 8
#: The engine's CPU with the worker, as a share of its CPU without.
BUDGET = 0.3


def _engine_cpu(
    library: WaveformLibrary, stub: Path, computer: WaveformComputer, names: List[str]
) -> float:
    """CPU seconds this process spends analysing ``names`` through ``computer``."""
    service = WaveformService(
        library.files, library.store, decoder=lambda: stub, computer=computer
    )
    # One file first: imports, the child's start and the store's first write
    # are paid once and are not the work being measured.
    warmup = service.analyse(library.id("warmup.flac"), force=True, detail=True)
    assert warmup.outcome == "ready", warmup
    started = time.process_time()
    for name in names:
        outcome = service.analyse(library.id(name), force=True, detail=True)
        assert outcome.outcome == "ready", outcome
    return time.process_time() - started


def test_the_engine_spends_a_fraction_of_the_cpu_when_the_worker_analyses(
    tmp_path, monkeypatch, record_property
):
    monkeypatch.setenv("STUB_MODE", "good")
    monkeypatch.setenv("STUB_FRAMES", str(SIX_MINUTES))
    monkeypatch.setenv("STUB_EXPECTED", ad.EXPECTED_OUTPUT)
    stub = write_stub(tmp_path / "stub-mpv")
    library = WaveformLibrary(tmp_path / "library")
    names = [f"track-{n}.flac" for n in range(FILES)]
    for name in ["warmup.flac", *names]:
        library.add(name)
    worker = WorkerComputer()
    try:
        in_process = _engine_cpu(library, stub, InProcessComputer(), names)
        with_worker = _engine_cpu(library, stub, worker, names)
    finally:
        worker.close()
        library.close()
    record_property("engine_cpu_in_process_seconds", round(in_process, 3))
    record_property("engine_cpu_with_worker_seconds", round(with_worker, 3))
    print(
        f"\nengine CPU over {FILES} files: in-process {in_process:.3f}s,"
        f" worker {with_worker:.3f}s ({with_worker / in_process:.1%})"
    )
    assert in_process > 0.05, "too little work to measure; the stub did not decode"
    assert with_worker < BUDGET * in_process, (in_process, with_worker)
