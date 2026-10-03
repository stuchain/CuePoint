# ADR-009: Waveforms are decoded by the player's mpv, and FFmpeg does the reduction

## Status

Accepted (WAVE-01, 2026-09-30). Records DEC-113 and DEC-123 as implemented, with
the measurements they were decided on. Linux was measured against the
distribution's `mpv` 0.37 (FFmpeg 6.1.1). The pinned Windows and macOS builds are
checked in desktop CI by `fetch_player_sidecar.py --check-analysis`; their timings
with `scripts/bench_decoder.py` are owed. Amended by WAVE-03 (2026-10-03): the
graph ends in the output's format, which the pinned Windows build needed, and
`ANALYSIS_VERSION` is 2.

## Context

Phase 11 draws a waveform for every track, computed by CuePoint from the audio
(DEC-113), and analyses the whole library in the background (DEC-116). That
needs a decoder in the engine, and the engine had none:
- **No audio stack:** the Python engine has no FFmpeg and no `numpy`, and its
  only audio library, `mutagen`, reads tags.
- **One decoder shipped:** the player's `mpv` (DEC-049). It is already fetched,
  verified by checksum, licence-checked and packaged per OS.
- **Only Electron knows where:** Electron main resolves that binary
  (`resolvePlayerBinary`).
- **Engine size matters:** the engine ships as one file that unpacks at every
  launch.

Three questions had to be answered by measurement rather than taste:
1. how samples leave `mpv`;
2. where the heavy arithmetic runs;
3. how to know the output is what was asked for.

Four behaviours of `mpv` found while answering them shaped the design. Each was
reproduced in this repository's tests:

| Behaviour | Consequence |
| --- | --- |
| `--o` (encode mode) pads its output with silence to a frame boundary: 4.46 s written for a 3.10 s file. | Every mark on a waveform would land late. |
| `--ao=pcm` writes exactly the decoded length, as fast as it decodes. | The pipeline uses it. |
| Info messages go to standard output. | With samples on standard output, a message corrupts them. |
| A filter graph that fails to configure is dropped, and playback continues unfiltered with exit code 0. | Unfiltered stereo read as four bands is a waveform of nonsense, with no error. |
| A four-channel `join` in the `4.0` layout comes out reordered; `quad` keeps its order. | A reversed order draws every band wrong, silently. |
| `--no-config` still loads the built-in scripts and would resume a `watch_later` position. | A file could be analysed from the middle. |

## Decision

**One `mpv` child per file, with FFmpeg's filters doing all the arithmetic, and
the engine reading back a small envelope** (DEC-123). The code is
`src/cuepoint/data/audio_decode.py`.

- **The filter graph**, in order:
  1. **Downmix:** to mono at unit gain (`rematrix_maxval=1`; FFmpeg's default
     adds 3 dB to correlated stereo), at 22,050 Hz.
  2. **Split** into the full band and three bands at 200 Hz and 2 kHz. Each
     edge is two cascaded two-pole filters, so fourth order.
  3. **Join** the four as one `quad` stream: full, low, mid, high.
  4. **Square** each sample, by multiplying the stream by itself (`amultiply`).
  5. **Resample** to 150 Hz. The resampler's low-pass averages the squares
     into mean squares.

  The engine then takes square roots, so the envelope is RMS amplitude, where a
  full-scale sine reads 0.707. Ringing below zero, and anything not finite,
  reads as silence.
- **Transport:**
  - **macOS and Linux:** a pipe, through `--ao-pcm-file=/dev/stdout`.
  - **Windows** has no such path, so the samples go through a file in a private
    temporary folder, removed as soon as they are read. That folder also holds
    the log on every platform. A folder left by a killed engine is swept after
    an hour.
- **Proof of format:** `--terminal=no` keeps standard output for samples, and
  `--log-file` records what the decode negotiated. The log must show
  `AO: [pcm] 150Hz quad 4ch float`. Any other output, or a dropped filter, is
  `decoder_missing`: the decoder cannot analyse at all, so no file is blamed and
  no wrong waveform is stored.
- **Isolation from the user's own `mpv`:** these are turned off:
  - configuration, scripts, `youtube-dl` and the on-screen controller;
  - resuming and saving positions;
  - input bindings, video, subtitles and cover art.

  The path goes last, after `--`, and must be absolute. Only the extensions the
  manifest's decoders cover are opened, so a playlist file is never expanded.
- **The child:**
  - **Priority:** nice +10 on macOS and Linux; `BELOW_NORMAL_PRIORITY_CLASS`
    with no window on Windows.
  - **Cap:** 300 s of wall clock, then killed as `timeout`.
  - **Cancel:** a caller's cancel kills it.
  - **Ends with the engine:** every live child is registered and killed when the
    engine stops. That happens at an ordinary exit through `atexit`, and when its
    app has gone through the engine's own exit, which bypasses `atexit`. A child
    whose engine is killed outright dies within about 2 s on the pipe transport,
    of a broken pipe. On Windows, Electron already ends the engine's whole
    process tree.
- **What a caller is told:**

  | Outcome | Meaning |
  | --- | --- |
  | An envelope | Carries the decoder's error count, so a truncated download draws what decoded. |
  | `FileGone` | The file is not there now; not a failure. |
  | `DecodeFailed` | `undecodable` (the decoder logged why), `no_audio` (nothing decoded, or a failed load with no error, such as an empty WAV) or `timeout`. |
  | `DecoderUnavailable` | `decoder_missing`. |
  | `DecodeCancelled` | The caller cancelled, or the engine is stopping. |
- **How the engine finds the decoder:** Electron main passes the `mpv` it
  resolved for the player as `CUEPOINT_DECODER_PATH`, and removes an inherited
  value when it has none. Linux without `CUEPOINT_MPV_PATH`, the CLI and a
  hand-started engine have no decoder, and analysis is unavailable.
- **`numpy` is not added,** and neither is a second decoder.

### Measured (Linux x86_64, 4 cores, `mpv` 0.37 / FFmpeg 6.1.1)

A 6-minute track, median of three, from `scripts/bench_decoder.py`, which was
run three times. The ranges are across those runs.

| Format | Chosen: wall time | Chosen: child's peak memory | Alternative: wall time | Alternative: the engine's own CPU |
| --- | --- | --- | --- | --- |
| WAV | 1.52–1.60 s | 93 MB | 2.49–3.52 s | 1.48–2.61 s |
| FLAC | 1.02–1.08 s | 67 MB | 2.11–3.22 s | 1.36–2.80 s |
| AIFF | 1.55–1.63 s | 92 MB | 2.55–3.65 s | 1.48–2.77 s |
| ALAC (m4a) | 1.43–1.64 s | 67 MB | 2.57–3.90 s | 1.36–2.77 s |
| AAC (m4a) | 1.72–1.83 s | 94 MB | 2.80–3.89 s | 1.49–2.60 s |
| MP3 | 1.77–1.82 s | 89 MB | 2.84–3.85 s | 1.48–2.59 s |

- **The alternative** decodes the same four full-rate bands through a pipe,
  127 MB per track, and reduces them in the engine.
- **The Library's search p95 over 10,000 tracks, with four analyses running:**

  | Design | Search p95, against idle |
  | --- | --- |
  | Chosen | 0.98×, 1.14× and 1.25× (budget 1.5×) |
  | Alternative | 3.68×, 2.31× and 3.63× |

  The alternative's cost is the engine's own CPU, spent while it holds the
  interpreter lock.
- **Squaring rather than `aeval=abs()`** measured at 1.02 s against 2.31 s for
  FLAC, and 1.78 s against 2.94 s for MP3.
- **At this rate,** a 50,000-track library takes about 15 to 25 hours on one
  worker on this machine, and about half that on two.
- **Envelope length against each fixture's own length:** within one envelope
  sample for WAV, FLAC, AIFF, ALAC and MP3.
- **Band separation on `bands.flac`:** at least 23.7 dB between a section's
  own band and the others. The check requires 12 dB.

## Consequences

- **Every build proves its own decoder.** `--check-analysis` runs in desktop CI
  on the pinned Windows and macOS binaries: exact length, band separation, and
  channel order proven with tones. A build whose FFmpeg cannot run the graph
  fails there, not in a user's library.
- **The manifest names every option the pipeline uses,** and a test holds the
  list to the arguments the module actually passes. The smoke test then proves
  the pinned build has each one.
- **The engine is never busy decoding.** Its threads wait on a child. The heavy
  work runs at lowered priority in a process the OS schedules behind the
  engine and the player.
- **One pass per file costs one child's start-up,** about 0.1 s. That is small
  beside the decode, and it buys isolation: a decoder crash is one file's
  failure, not the engine's.
- **`ANALYSIS_VERSION` names what an envelope means.** Any change to the rates,
  crossovers, filter order, squaring or layout changes it. WAVE-02 stores it
  with every waveform, and the library is analysed again over time.
- **Linux has waveforms only with a named `mpv`,** as it has playback.

## Amendment (WAVE-03, 2026-10-03): the pinned Windows build, and the engine's share

WAVE-03's acceptance ran the pipeline on the pinned Windows build for the first time
outside CI, and found two defects that CI had been reporting as failures since WAVE-01.

- **The pinned Windows `mpv` (0.41-dev, FFmpeg 8) remixed the bands.** The graph ended
  in planar float, and `mpv` converted it to the interleaved float its output takes.
  That conversion mixed the fourth channel into the first two, at −3 dB, as a centre
  channel is downmixed. The high band read silent, and its tone appeared in the full
  and low bands. Inside FFmpeg every stage was right; the log showed `quad` throughout.
  - **The graph now ends in the output's own format,**
    `aformat=sample_fmts=flt:channel_layouts=quad`, so `mpv` converts nothing.
  - On a build that was right the values are the same.
  - `ANALYSIS_VERSION` is 2 regardless, so no waveform a remixing build stored can
    count again. Phase 11 has not shipped, so this costs nobody a re-analysis.
  - `--check-analysis` passes on the pinned Windows build: the bands are at least
    23.7 dB apart, as on Linux.
- **The pipe transport was offered on Windows,** where `/dev/stdout` does not exist,
  and a decode through it failed as the file's fault (`undecodable`).
  `platform_transports()` names the transports a platform has. `decode_envelope`
  refuses any other as a programming error, before any file can be blamed.
- **The engine's share of the work is halved.** The parse took the square root of
  216,000 values a track in a Python loop: about 60 ms holding the interpreter's lock.
  With two workers that cost the Library search 1.5× its idle p95 on Windows.
  - It now runs at C level (`max(0.0, v)` then `sqrt`, through `map`), about 27 ms a
    track, and is bit-identical to the per-value rule, NaN and infinity included.
  - Moving the root into FFmpeg (`aeval` at 150 Hz) was measured and declined: it was
    not bit-identical on the pinned build.
- **On Windows the engine asks for a 1 ms timer** (`server.fine_timer_resolution`). A
  thread that gives up the lock for SQLite waits on a timed condition, and Windows
  times those waits at 15.6 ms by default. Every engine request therefore paid for
  any background computation in 15.6 ms steps. With both changes, search p95 with
  the analysis running measured 1.35× and 1.38× idle on Windows, against the 1.5×
  budget, where it had measured 1.52× and 1.54×.

## Signals to revisit

- **A pinned build changes behaviour:** `--check-analysis` fails on a new pin,
  for example because the log's output line changes wording or `quad` is
  reordered. Re-measure before re-pinning, and adjust `EXPECTED_OUTPUT` or the
  layout, bumping `ANALYSIS_VERSION`.
- **Search slows:** the engine's search p95 with analyses running exceeds 1.5×
  idle on a supported platform. Lower the worker count before changing the
  design.
- **Phase 12 needs samples:** it measures loudness, tempo or key and needs raw
  samples in the engine. It then brings its own case for `numpy`, measured
  against the engine's start-up, as DEC-123 requires.
- **A detail view arrives:** the overview's 150 Hz envelope is too coarse for a
  zoomed view (DEC-115). A second, denser pass would be added beside this one,
  not instead of it.
