# ADR-013: Waveform analysis runs in a worker process

## Status

Accepted (C19g, 2026-10-13). Records DEC-284. Amends ADR-009 (where the decode is supervised and
reduced) and ADR-012 (the detail fill uses the same worker). numpy stays out.

## Context

Stelios reported slow page switching on his Windows PC while the library was being analysed (C19).
`mpv` already decodes in a child (DEC-123), but everything around it ran inside the engine's Python
process and shared its GIL with every API request: for each file a `_watch` poll thread and two
`_Drain` threads reading about 864 KB through a pipe, then `parse_envelope` (about 18 ms for a
six-minute track), `reduce` (4 ms), and for a detail fill `reduce_detail` and `encode_detail`
(18 ms). On Linux this cost the Library search 1.15× at p95; Windows, with coarser waits and
slower process handling, was never measured at this commit.

numpy would shorten the reductions only, adds about 30 MB and start-up time, goes against DEC-123,
and would leave the `mpv` supervision threads in the engine.

## Decision

- **A seam.** `WaveformService.analyse` asks a `WaveformComputer` (`services/waveform_computer.py`)
  for one file's result: the encoded overview, the encoded detail, the loudness, the duration, the
  decode errors, or why there is none. Store writes stay in the engine. `InProcessComputer` is the
  old code, kept for tests, the CLI and as the fallback.
- **The worker.** `services/analysis_worker_client.py` (`WorkerComputer`) starts one child,
  `cuepoint-engine --analysis-worker` when frozen or `python -m cuepoint.engine --analysis-worker`
  from source, lazily on the first file, and keeps it while files keep coming; it exits after 120 s
  idle. The child (`engine/analysis_worker.py`) runs `InProcessComputer` with the real decoder, one
  thread per request, so the run's 1-2 workers and the detail fill share it. It never imports the
  engine's server.
- **Protocol.** JSON lines on stdin and stdout (`services/analysis_protocol.py`): a hello carrying
  the protocol, analysis, loudness and detail versions (a mismatch is a start failure), requests,
  cancels, and results with base64 blobs. stderr carries the child's log; warnings are logged again
  in the engine at their own level.
- **Failures.** A child that cannot start, says the wrong hello, or dies is replaced once; after a
  second failure the engine analyses in-process for the rest of its life. Analysis never becomes
  unavailable because of the worker.
- **Lifetime.** The child ends on stdin EOF, which also comes when the engine is killed, and ends its
  own `mpv` children first. `terminate_children()` also ends it, and while the engine is stopping no
  new child starts. It runs at lowered priority, set by itself on macOS and Linux and by its creation
  flags on Windows, where it also joins the engine's kill-on-close job (a PyInstaller onefile child
  may escape the job; stdin EOF is the guarantee).
- **On only in the engine process.** `python -m cuepoint.engine` and the frozen sidecar turn it on;
  tests that start the engine in a thread stay in-process. `CUEPOINT_ANALYSIS_WORKER=0` or `1`
  forces it.

## Consequences

- The engine's own CPU for eight six-minute files fell from 0.49 s to 0.01 s
  (`test_regression_analysis_off_the_engine.py`). The bytes are identical, so no library is analysed
  again (`ANALYSIS_VERSION` unchanged).
- A second Python process, about 40-60 MB while it lives. A cold start adds about 0.1 s from source
  before the first file; frozen, longer (measured by the release check).
- PyInstaller 6 onefile children reuse the parent's unpacked folder unless
  `PYINSTALLER_RESET_ENVIRONMENT` is set, so there is no second unpack; the release check proves it.

## When superseded

- If the frozen start time or memory of the worker matters more than the engine's responsiveness
  (for example a start over 3 s on a supported machine, measured by the release check).
- If analysis moves to a native decoder that does its own reduction.
