# CuePoint v1.0.0 — Phase 11: Waveforms, Detailed Step Specifications

Status: **Specified 2026-09-29. WAVE-01 and WAVE-02 are implemented (2026-09-30), WAVE-03 (2026-10-03), WAVE-04, WAVE-05 and WAVE-06 (2026-10-05); WAVE-07 is not.** The seven steps below replace the
roadmap's placeholder inventory (WAVE-01…WAVE-07), keeping its count. Per the process, no
implementation happens from this document: each step needs an explicit "Implement WAVE-NN"
instruction, scoped to exactly that step, and its outcome is recorded under the step afterwards.
There are no open points. Measurements taken while writing it are recorded in cross-cutting fact 3,
and each is a starting point that WAVE-01 re-measures on the pinned binaries.

Depends on Phases 1–10 (`PHASE1_FOUNDATION.md` … `PHASE10_PREPARE.md`), all implemented. Decision
Rounds 1–13 apply (`DECISIONS.md`, DEC-001…DEC-123). Phase 11's own decisions are DEC-113…DEC-123,
alongside DEC-049 (the bundled `mpv`), DEC-050 (the engine is not told about playback), DEC-052 (what
the bar holds), DEC-073 (the file check), DEC-076 (artwork, the precedent for derived data), DEC-077
(the export patches the XML), DEC-107 (planned times), DEC-111 (the lanes) and DEC-112 (Prepare's
rows).

**The gate, decided rather than waived.** The roadmap says this phase starts "only after Player is
solid". Phase 5's code is complete; its acceptance is not: a notarization submission, the rows that
need a real audio interface, the row that needs somebody to listen, and the DEC-055 amendment. The
user decided that Phase 11 starts now, with those still owed and recorded (DEC-119). Nothing here
changes how the player plays. The bar's seek control gains a picture, and its seeking logic stays
PLAYER-06's.

## What this phase is

A DJ reads a track's shape before hearing it: where the breakdown is, how long the intro runs, where
the drop lands. Rekordbox draws that shape. CuePoint so far has not: it plays whole tracks through a
bar with a plain slider (DEC-052), and PREP-11's lanes draw a Set's tempo and key but nothing inside a
track.

This phase draws each track's waveform:
- **Computed by CuePoint** from the audio file, through the decoder CuePoint already ships (DEC-113).
- **Shown in four places:** the player bar, where it becomes the seek control; the Inspector; a Library
  column; and a transition strip on the Prepare page (DEC-114, DEC-120).
- **An overview only:** the whole track at once, with the playhead moving across it (DEC-115).
- **For the whole library, automatically.** Analysis runs in the background at low priority, can be
  paused, and continues after a restart (DEC-116).
- **In three frequency bands or one colour,** chosen in Settings (DEC-117).
- **With the track's cue points and beat grid on it,** imported read-only from the Rekordbox XML
  (DEC-118).

**What this phase is not.**
- **No zoomed, scrolling detail view** (DEC-115).
- **No editing:** no cues or beat grid are edited or written anywhere (DEC-118). The export still
  patches the XML and never writes a mark (DEC-077).
- **No Rekordbox analysis files:** it reads none of Rekordbox's own (ANLZ) data (DEC-113).
- **No audio measurements:** no loudness, BPM or key; those are Phase 12's (DEC-121).
- **No change to playback:** it does not tell the engine when something is playing (DEC-050).
- **No change to row counts:** it does not change the player bar's height or any page's row count as
  that page opens.
- **It writes no audio file,** and it never writes the source XML.

## What the earlier phases already built

Read this table before writing any of it again.

| Already exists | Where |
| --- | --- |
| The pinned `mpv`, fetched, verified, licensed, packaged per OS | `scripts/fetch_player_sidecar.py`, `scripts/player_sidecar_manifest.json` (PLAYER-01, DEC-049) |
| Where `mpv` is, in development and packaged, with `CUEPOINT_MPV_PATH` honoured everywhere | `electron/playerLaunch.ts::resolvePlayerBinary` |
| The format check on the pinned binary, run by desktop CI on Windows and macOS | `fetch_player_sidecar.py --check-formats`, `.github/workflows/desktop-electron.yml` |
| Committed audio fixtures, made by the bundled `mpv` | `src/tests/fixtures/audio/`, `scripts/make_audio_fixtures.py` |
| The engine's spawn and its environment | `electron/engineSupervisor.ts::launch` |
| A process tree that ends with its parent | `electron/processTree.ts`, `engine/parent_watch.py` (EXPORT-07) |
| Jobs: one per type, persisted, cooperative cancel, SSE progress | `engine/jobs.py::JobStore`, `jobs` (m0003), `engine/job_events.py` |
| Follow-ups that are never lost or started twice | `engine/follow_ups.py::FollowUps` (CLEAN-07) |
| The chain import or refresh → file check → artwork scan | `engine/file_check_jobs.py`, `engine/artwork_jobs.py` (DEC-073, DEC-076) |
| Which files are present at their current path | `track_files`, `persistence/file_status_repository.py` (CLEAN-07) |
| Derived per-track data outside the backup, with a precedent for its rules | `services/artwork_cache.py`, DEC-076's amendment |
| "Clear cache" and "clear cache on exit" | `engine/privacy_api.py::clear_cache_now`, `components/PrivacyDialog.tsx` |
| The XML reader, streaming `COLLECTION/TRACK` elements | `data/rekordbox.py::iter_collection_tracks`, `_library_track_from_element` |
| The refresh: preview a diff, then apply it | `engine/library_refresh.py`, `models/refresh_diff.py` (LIBRARY-10, DEC-032) |
| The recorded source and its staleness (size and modified time) | `models/library_source.py`, `persistence/library_source_repository.py` (DEC-035) |
| The export that patches the source and never writes a mark | `data/rekordbox_export.py` (DEC-077) |
| The player bar: seek slider, drag preview, one seek on release | `components/player/PlayerBar.tsx` (PLAYER-06) |
| The Inspector, its header and artwork box | `screens/library/TrackDetailPanel.tsx`, `TrackArtwork.tsx` |
| Library columns, hidden by default where declared | `screens/library/libraryColumns.tsx` |
| Prepare's "View ▾" menu, the lanes and their remembered state | `screens/prepare/PrepareScreen.tsx`, `prepareLayoutState.ts`, `SetLanes.tsx` (PREP-11) |
| Pixel drawing laid out in whole pixels by a pure function | `screens/prepare/prepareLanes.ts` (PREP-11) |
| Five themes and custom themes derived from eight colours | `tokens/themes/*.css`, `tokens/themeDerivation.ts` |
| The status strip's job labels | `components/shell/useActiveJob.ts` |
| Library-wide jobs offered on the Clean page's Health view | `screens/clean/HealthView.tsx` |
| The launch backup, taken before any migration runs | `services/backup_service.py::backup_on_launch` (FOUNDATION-11) |
| Activity events | `activity_events`, `IActivityService.record_event` |

## Decisions this phase implements

| Decision | What it requires here |
| --- | --- |
| DEC-113 | Waveforms computed by CuePoint through the bundled `mpv`; no Rekordbox analysis files; no new decoder. |
| DEC-114 | Waveforms in the player bar (as the seek control), the Inspector, a Library column and Prepare. |
| DEC-115 | A whole-track overview with a playhead; no zoomed detail view. |
| DEC-116 | The whole library analysed automatically after import, at low priority, pausable, resuming after a restart. |
| DEC-117 | Three bands and a full-band amplitude stored; colour or single colour chosen in Settings. |
| DEC-118 | Cue points and beat grids imported from the XML on import and refresh, drawn read-only. |
| DEC-119 | Phase 11 starts with Phase 5's manual acceptance owed and recorded. |
| DEC-120 | Prepare shows a transition strip: the selected entry beside the next one. |
| DEC-121 | Waveforms only; loudness and other measurements wait for Phase 12. |
| DEC-122 | Waveform data lives in its own store beside the library, outside backups and "Clear cache", keyed by file. |
| DEC-123 | The engine decodes through the `mpv` Electron names to it; FFmpeg's filters split the bands; no `numpy`. |

## Sequencing

WAVE-01 proves the decoder pipeline on the pinned binaries before anything is built on it. Every later
step depends on the decoder being able to produce bands of the exact length, in the proven order, at a
measured rate. WAVE-02 builds the store and the analysis of one file. WAVE-03 turns that into the
library job. WAVE-04 imports cues and beat grids; it depends on nothing above and can be built in
parallel with WAVE-02 and WAVE-03. WAVE-05 puts waveforms on the wire and draws them. WAVE-06 places
them in the bar, the Inspector and the Library. WAVE-07 draws Prepare's strip and closes the phase.

**Nothing is retired in this phase.** Every intermediate build keeps working. Until WAVE-06 the bar
keeps its slider, and afterwards the slider is still what a keyboard and a screen reader use.

## Before starting any step — nine cross-cutting facts

### 1. The desktop contract is six files

Every new endpoint goes through six files, gated by `desktopContract.test.ts`:
- `engine/*_api.py` + `server.py`
- `engineClient.ts`
- **`engineSupervisor.ts`**
- `main.ts`
- `preload.cjs` (the runtime preload; `preload.ts` is still a placeholder)
- `cuepointBridge.types.ts`

The supervisor forwards method by method and nothing type-checks it. `server.py` speaks only `do_GET`
and `do_POST`, and mutations are POSTs to action paths. Methods answer `{ value, refusal }`
(DISCOVER-09).

### 2. The engine has no decoder; Electron knows where one is

The Python engine has no FFmpeg, no `numpy` and no audio library but `mutagen`, which reads tags. The
only decoder CuePoint ships is the player's `mpv`, and only Electron main knows where it is:
`resolvePlayerBinary` answers the environment override, the bundled sidecar or the development fetch.
So Electron passes that path to the engine as `CUEPOINT_DECODER_PATH` when it spawns it (DEC-123).

- **On Linux, CuePoint bundles no `mpv`** (PLAYER-01). A Linux user without `CUEPOINT_MPV_PATH` has no
  player and so no waveforms. Analysis is then *unavailable*, and the app says why once, in words,
  never as an error.
- **The CLI and a bare engine have no decoder** unless the variable is set.

### 3. What `mpv` does to audio, measured while writing this

Measured on this container's `mpv` 0.37 (FFmpeg 6.1.1), four cores. WAVE-01 measures the pinned
binaries on Windows and macOS again, and those numbers replace these.

- **Encode mode pads its output.** `--o=file --of=f32le` wrote 4.46 s of samples for a 3.10 s file at
  11,025 Hz, and 65,536 bytes for a 0.25 s one, padded with silence to a frame boundary. A waveform
  stretched over that length would place every mark late. `make_audio_fixtures.py` uses encode mode
  only to write fixtures, where the padding is harmless.
- **`--ao=pcm` is exact.** The same 3.10 s file gave 3.100045 s, one sample over, in 0.12 s of wall
  time. It writes as fast as it can decode, not in real time.
- **`--ao-pcm-file=-` is not standard output.** It wrote a file named `-`. `/dev/stdout` works on Linux
  and macOS, but Windows has no such path, so how the samples leave `mpv` is WAVE-01's to settle.
- **FFmpeg's filters split the bands inside `mpv`.** `--af=lavfi=[…]` with a low-pass, a band-pass and
  a high-pass joined into four channels works.
  - `amerge` fails with "No channel layout for input 1"; `join` with a declared layout succeeds.
  - **The channel order was not kept.** With the full band first in the graph, the full band came out
    second. The order must be proven with band-limited tones, never assumed.
- **Timings for a 6-minute FLAC:**

  | What `mpv` produced | Wall time |
  | --- | --- |
  | Decoded to 22,050 Hz mono | 0.63 s |
  | Split into four channels | 1.06 s |
  | Split, rectified and reduced to a 150 Hz envelope, all inside FFmpeg | 2.19 s |

  - Reducing the full-rate four-channel stream in the engine with the standard library, using C-level
    `max`/`min` over slices, took 1.18 s more, on the engine's own CPU.
  - At 50,000 tracks and two workers, this machine would take about fifteen hours. The work is
    CPU-bound locally and disk-bound on a network share.

### 4. Waveforms are derived data that take hours to rebuild

- **Why they can't live in the cache folder.** Artwork thumbnails (DEC-076) are regenerable, outside
  the backup, and live in the platform cache folder, which "Clear cache" and the Privacy dialog's
  "clear cache on exit" empty. Waveforms are regenerable too, but rebuilding them takes hours. With
  "clear cache on exit" set, a library in the cache folder would be re-analysed after every launch,
  forever. So waveforms live in their own database beside the library (DEC-122), and "Clear cache"
  leaves them.
- **Why they aren't in the library's database.** That file is what every launch backup copies, and
  250 MB of rebuildable data would multiply the size of every backup.

### 5. The engine is not told when something is playing

DEC-050 keeps playback in Electron main, and the engine never learns a track is playing. So the
analysis cannot pause itself when playback starts without reversing that decision. What keeps it
from delaying playback:
- **Lowered OS priority:** each decoder child runs at nice +10 on macOS and Linux, and in
  `BELOW_NORMAL_PRIORITY_CLASS` on Windows.
- **A bounded worker count.**
- **A separate decoder process:** the player's `mpv` is another process at normal priority.

WAVE-03's acceptance plays through the player while the analysis runs, and checks the player's log for
underruns.

### 6. Files are opened only where the file check found them

A scan opens only files that the last file check found present at the track's current path
(CLEAN-07), as the artwork scan already does. A file that has vanished since is skipped, never recorded
as a failure: a disconnected drive is not a broken file. Analysis joins the existing chain: import or
refresh, then the file check, then the artwork scan and the waveform analysis. It writes nothing but
its own store and, if WAVE-01 needs one, a temporary file in CuePoint's own folder. CLEAN-10's
file-write boundary test gains the store's module as a writer of CuePoint's own data, not of user files.

### 7. Nothing in this phase changes a page's rows as it opens, or the bar's height

PREP-10 measured seven whole rows at the default window and scale (eight on Linux), and four with the
player's bar (five on Linux). `prepare.spec.ts` holds each count, one below the Linux measurement.
- **The bar:** the waveform replaces the slider's picture inside the seek region's existing height.
- **The Library column:** hidden by default, as artwork is.
- **Prepare's strip:** opened from "View ▾", as the lanes are, and closed the first time the page
  opens.

Each step that touches one of these re-runs the row checks.

### 8. The renderer has never drawn on a canvas

PREP-11's lanes are SVG rectangles, which suits a few hundred columns. A waveform is 1,200 columns in
four bands, and the Library may show forty of them at once. So this phase adds the renderer's first
`<canvas>`.
- **Sized in device pixels,** with smoothing off and heights snapped to the `--scale` grid.
- **Laid out by a pure function,** in the manner of `prepareLanes.ts`. jsdom has no canvas, so unit
  tests test the layout, and the painter stays too thin to hide a decision. End-to-end tests check the
  painted pixels in Electron.
- **Colours come from theme tokens,** with a value in all five themes and a derivation for custom
  themes.

### 9. Cues and beat grids change what the importer reads, not what the export writes

DEC-077 rested on the fact that nothing in `src/` parsed `POSITION_MARK` or `TEMPO`. After WAVE-04 the
importer reads both. The rule that fact supported stands: the export still patches the source and
never writes a mark, and a test holds its output byte-identical before and after this phase.

---

## WAVE-01 — The Decoder Pipeline, Proven ✅ IMPLEMENTED 2026-09-30

**Objective**: Prove, on the pinned `mpv` for each shipped OS, a pipeline that decodes a local file
into a four-band envelope of exact length, and record it in ADR-009.

**User-visible result**: None.

**Dependencies**: None.

**Existing code reused**:
- The manifest and `fetch_player_sidecar.py`'s format check.
- `make_audio_fixtures.py`.
- `resolvePlayerBinary`.
- `processTree.ts`'s kill semantics.

**Design**:

- **The pipeline.** One `mpv` invocation per file:
  - **Isolated:** `--no-config --load-scripts=no --ytdl=no --vid=no --sub=no --audio-display=no
    --msg-level=all=error`.
  - **Output:** `--ao=pcm --ao-pcm-waveheader=no --audio-format=float`, with `--af=lavfi=[…]` doing
    everything below inside FFmpeg:
    1. **Downmix and resample:** to mono at 22,050 Hz.
    2. **Split** into four streams:
       - the full band;
       - **low:** below 200 Hz;
       - **mid:** 200 Hz to 2 kHz;
       - **high:** above 2 kHz.

       Each band is fourth order: two cascaded two-pole filters.
    3. **Join** the four with a declared four-channel layout.
    4. **Rectify:** take each sample's absolute value.
    5. **Resample** to the envelope rate, 150 Hz to start.
  - **The path goes last, after `--`,** so a file whose name begins with `-` is never read as an option.
    It is a local path, never a URL.
  - **Only extensions the manifest's decoders cover** are opened. A playlist file is never handed to
    `mpv`, which would expand it.
- **Named constants, in one module.** `data/audio_decode.py` holds:
  - the crossover frequencies;
  - the decode and envelope rates;
  - the channel order, as `mpv` delivers it;
  - `ANALYSIS_VERSION = 1`;
  - the filter graph, built as a string from those constants.

  Changing any value that changes the output bumps `ANALYSIS_VERSION` (WAVE-02).
- **Where the samples go.** The envelope for a 6-minute track is about 0.86 MB, so a pipe is not
  needed for size. The spike picks the first of these that works on all three OSes, and ADR-009
  records why:
  1. `/dev/stdout` on macOS and Linux, with a named pipe on Windows made by the standard library's
     `_winapi.CreateNamedPipe`.
  2. A temporary file in CuePoint's own temporary folder, removed in a `finally`.
- **Where the reduction happens.** The design reduces inside FFmpeg (step 4 and 5 above). That keeps
  large sample streams off the engine's CPU and out of the pipe, and lets the child's lowered priority
  cover all of the work. The alternative, a full-rate stream reduced by the engine, is measured beside
  it, and ADR-009 records both. The choice is made on two numbers:
  - per-track wall time;
  - the p95 latency of `GET /api/v1/library/search` while four files are being analysed.

  `numpy` is not added in either case (DEC-123).
- **The child process:**
  - **Lowered priority:** nice +10 on macOS and Linux, set with `os.setpriority` straight after
    spawn; `BELOW_NORMAL_PRIORITY_CLASS | CREATE_NO_WINDOW` on Windows.
  - **Killed with the engine:** the engine's parent watch also ends its children.
  - **Wall-clock cap:** 300 s per file, then killed with reason `timeout`.
  - **Cancel** kills the child and removes any temporary file.
- **Failure vocabulary**, decided here and stored by WAVE-02:

  | Reason | Meaning |
  | --- | --- |
  | `undecodable` | `mpv` exits non-zero on an existing file |
  | `no_audio` | no audio stream, or zero samples |
  | `timeout` | the file hit the wall-clock cap |
  | `decoder_missing` | the decoder path does not run; the whole analysis is unavailable, not the file |

  A file that does not exist at open time is not a failure (fact 6).
- **The engine is told where the decoder is.** `engineSupervisor.ts` sets `CUEPOINT_DECODER_PATH` from
  `resolvePlayerBinary` when there is one. `engineLaunch`'s tests and a new test hold that it is set
  for a bundled, an environment and a development `mpv`, and absent when there is none.
- **The manifest and the CI check.**
  - `required_options` gains `ao-pcm-file`, `ao-pcm-waveheader` and `af`.
  - A new `--check-analysis` runs the pipeline on the fixtures with the fetched binary. It asserts
    exact length, band separation and channel order.
  - The desktop CI job runs it on Windows and macOS beside `--check-formats`.
- **Fixtures.** `make_audio_fixtures.py` gains `bands.flac`: six seconds of mono, two seconds each of
  60 Hz, 1 kHz and 6 kHz. It is written by the bundled `mpv`, like the others, and committed; it is
  under 100 KB. Its sections prove which channel is which band. The existing five fixtures prove every
  shipped format decodes to the right length.

**Tests**:
- Pure tests of the filter-graph builder and the argument list:
  - `--` comes before the path;
  - `--no-config` is present;
  - no option comes from the path.
- On a real decoder (skipped where none exists, run by desktop CI on Windows and macOS):
  - each fixture's envelope length matches its duration within one envelope sample;
  - `bands.flac`'s three sections each peak in their own band, at least 12 dB above the other two;
  - a truncated file, a zero-byte file, a text file with an audio extension, a Unicode path and a path
    beginning with `-` each give the stated outcome;
  - cancel mid-decode leaves no child process and no temporary file;
  - the timeout kills a stalled child. This uses a stub decoder that sleeps.

**Acceptance criteria / DoD**:
- `--check-analysis` passes on the pinned Windows and macOS binaries in CI, and locally against a
  system `mpv` on Linux.
- ADR-009 records the pipeline, the transport chosen and why, the reduction chosen and why, and the
  measurements.
- Measured per format and recorded: per-track wall time for a 6-minute file, the engine's search p95
  with four analyses running against its idle value, and the child's peak memory.
- `python -m pytest src/tests` clean; `ruff`, `mypy` clean.

**Risks**: Medium.
- **The pinned binaries are not the build measured here.** The macOS build carries a different
  FFmpeg, and DEC-055's amendment already found one difference between the platforms. That is why the
  check runs in CI.
- **A reversed channel order** would draw every band wrong without failing, so the tone test is the
  guard.

**Complexity**: **M**

**Outcome**: Implemented (2026-09-30). `data/audio_decode.py` decodes any shipped format into a
four-band RMS envelope of exact length, through the player's `mpv`, with FFmpeg doing every
calculation. ADR-009 records the pipeline, the design it beat, and the measurements. Nothing reaches
a user yet: WAVE-02 is the first caller.

**What was built.**

- **`data/audio_decode.py`,** in the strict mypy gate. It holds:
  - the named constants, `ANALYSIS_VERSION = 1` among them;
  - the filter graph and the argument list;
  - the log reader and the envelope parser;
  - `decode_envelope()`;
  - the registry of live children, which `terminate_children()` ends.

  Its outcomes are an `Envelope` or one of `FileGone`, `DecodeFailed` (`undecodable`, `no_audio`,
  `timeout`), `DecoderUnavailable` (`decoder_missing`) and `DecodeCancelled`.
- **The engine is told where the decoder is.** `engineEnvironment()` in `engineSupervisor.ts` builds
  the engine's whole environment. `withDecoderPath()` in `playerLaunch.ts` sets `CUEPOINT_DECODER_PATH`
  to the `mpv` the player resolves, or removes an inherited one when there is none. `main.ts` passes
  the same resolution the player uses, re-run at each launch.
- **Children end with the engine.** At an ordinary exit an `atexit` hook ends them. When its app has
  gone, the engine leaves through `os._exit`, which skips `atexit`, so `server._exit_now()` ends them
  first, and still exits if that fails. A decode the engine ended reads as `DecodeCancelled`, never as
  a file's failure.
- **The manifest and the release check.**
  - `required_options` gains the seventeen options the pipeline passes. A test holds that list to the
    arguments the module actually builds, and `ao` was the one it found missing.
  - `fetch_player_sidecar.py --check-analysis` runs the pipeline over every transport the platform
    uses. On `bands.flac` it checks the length against the file's own FLAC header, read with the
    standard library, and requires 12 dB of separation per section. It also decodes every format
    fixture.
  - `--mpv PATH` checks a named binary, which is how Linux runs it.
  - Desktop CI runs the check on Windows and macOS beside `--check-formats`, and runs the new tests
    with the pinned binaries.
- **The fixture.** `bands.flac` (70.5 KB, mono, 22,050 Hz) holds 60 Hz, 1 kHz and 6 kHz, two seconds
  each. `make_audio_fixtures.py` writes it, and gains `--mpv` for a build with no pinned binary. FLAC is
  lossless, so the encoder's build does not change the samples.
- **The measurement.** `scripts/bench_decoder.py` measures:
  - each format's time and the child's own peak memory;
  - the design not chosen;
  - the Library search's p95 with four analyses running, against a budget of 1.5× idle.
- **Tests.**
  - `test_audio_decode.py`: 93 unit tests. A stub decoder, a script that does what each test asks,
    makes the timeout, cancel, shutdown, exit and priority deterministic.
  - `test_audio_decode_binary.py`: 33 tests against a real decoder, skipped where there is none. Two
    of them give a real `mpv` a graph it drops, and require `decoder_missing` rather than a waveform.
  - Nine analysis-check tests in the fetch script's suite, and the fixture script's and bench's own.
  - `engineEnvironment.test.ts`: 10 tests.
  - Two engine-exit tests.
  - **Eight deliberate breakages, each caught:** a `4.0` layout, the default downmix gain, messages on
    standard output, no format proof, normal priority, no `atexit` clean-up, resumed positions, and
    an exit that leaves children. The first four are caught by real audio as well as by the unit
    tests. The format proof was at first caught only by the stub; the two dropped-graph tests were
    added so a real decoder catches it too.

**Measured** (Linux x86_64, 4 cores, the distribution's `mpv` 0.37 / FFmpeg 6.1.1; three runs):

| Measure | Result |
| --- | --- |
| A 6-minute track | 1.0–1.8 s by format (FLAC fastest, MP3 slowest) |
| The child's peak memory | 67–94 MB |
| Search p95 over 10,000 tracks, four analyses running | 0.98×, 1.14× and 1.25× idle, against a budget of 1.5× |
| The design not chosen (engine-side reduction) | 2.1–3.9 s, 1.4–2.8 s of the engine's own CPU per track, search p95 2.3–3.7× idle |
| Envelope length against each fixture's own | within one envelope sample |
| `bands.flac`'s bands | at least 23.7 dB apart |

Timings of the pinned Windows and macOS builds are owed; their correctness is checked in CI.

**Where the specification was wrong, and what was done instead.** Each was settled the most durable
way and is recorded here and in ADR-009.

1. **The envelope is squared, not rectified.** The specification rectified with an absolute value.
   `aeval=abs()` is an expression evaluated per sample and cost more than the whole decode. Squaring
   with `amultiply` measured twice as fast: 1.02 s against 2.31 s for FLAC. With the engine's square
   root it gives RMS, the standard measure of how loud a passage is, and separates the bands more
   cleanly. The values stay linear amplitude, as WAVE-02 expects.
2. **The order is fixed by the layout, not recorded as found.** The specification had a constant for
   "the channel order, as `mpv` delivers it". A `4.0` layout came out reordered (low, mid, full, high);
   `quad` comes out exactly as joined. A fixed order that CI proves with tones is stronger than an order
   remembered per build.
3. **The downmix is normalised.** FFmpeg's default mono downmix adds 3 dB to correlated stereo, so a
   full-scale track would read above 1.0. `rematrix_maxval=1` makes it unit gain, and a test holds the
   fixtures' tone at its expected RMS.
4. **`mpv` writes info messages to standard output, and exits 0 when it drops a filter.** Found by
   testing: a message corrupted the piped samples, and a graph that failed to configure played on
   unfiltered, as a waveform of nonsense. So `--terminal=no` keeps standard output for samples, and
   `--log-file` records what was negotiated. The log must show exactly `AO: [pcm] 150Hz quad 4ch
   float`, or the decoder is `decoder_missing` and no file is blamed. The specification had assumed
   the exit code and standard error would say.
5. **`--no-config` is not isolation enough.** The built-in scripts still load, and a `watch_later`
   position would start a file part-way through. Resuming, saving, scripts, `youtube-dl`, the
   controller, input bindings, subtitles and cover art are all turned off.
6. **The transport differs by platform, as allowed.** macOS and Linux use a pipe, and a child whose
   engine is killed dies within about 2 s of a broken pipe. Windows writes a file in a private
   temporary folder, which also holds the log on every platform. A named pipe was not needed, and a
   folder a killed engine leaves is swept after an hour.
7. **Two outcomes the vocabulary had to place.**
   - An empty WAV fails to load without logging an error. A failed load that says nothing found
     nothing to decode, so it is `no_audio`, not `undecodable`.
   - A truncated file decodes part-way with exit 0. It is an envelope of what decoded, carrying the
     decoder's error count. Refusing it would also refuse every real file with one damaged frame.
8. **The engine's exit had to end the children itself.** The specification said the parent watch
   would, but the engine leaves through `os._exit`, which skips the `atexit` clean-up. `_exit_now()`
   ends them first, in a `try` whose `finally` still exits.
9. **The fixture runs 6.06 s, not 6.** Encode mode padded it, the trap fact 3 records. The checks read
   its length from its own header and leave a margin at each section's edge, so nothing depends on the
   round number.


---

## WAVE-02 — The Waveform Store and One File's Analysis ✅ IMPLEMENTED 2026-09-30

**Objective**: Analyse one file into a stored waveform, and answer any track's waveform state from the
store.

**User-visible result**: None.

**Dependencies**: WAVE-01.

**Existing code reused**:
- WAVE-01's decoder.
- The file check's current-path rule (`file_status_repository.py`).
- `utils/paths.py` for CuePoint's home.
- The database service's WAL and connection conventions.

**Design**:

- **The shape of a waveform.** `core/waveform.py` is pure:
  - **Columns:** 1,200 per track, whatever its length. That is Rekordbox's colour preview width, and
    wider than the bar at the default window.
  - **What a value is:** each column holds four bytes, the full band then low, mid and high. Each is
    the highest envelope value over the column's span. The envelope's values are linear amplitude, not
    decibels.
  - **Stored as `round(255 × √v)`, clamped.** The square root spends the byte's resolution where a
    quiet passage needs it, and drawing undoes nothing: heights are drawn from the stored byte.
  - **No per-track normalisation.** A quiet master looks quiet, as it does in Rekordbox.
  - **Duration:** in milliseconds, from the envelope's own sample count.
  - **Short tracks:** a track shorter than 1,200 envelope samples repeats values rather than inventing
    detail.
  - **`downsample(data, width)`** answers any width from 16 to 1,200 by taking the maximum over each
    new column's span. It is what the Library column asks for.
- **The encoded form.**
  - **A 12-byte header:** the magic `CPWF`, a format version byte, a band-count byte, columns as a
    `u16`, and the duration in milliseconds as a `u32`.
  - **The body:** the column bytes, compressed with `zlib` at level 6.
  - **Checked on decode:** a header, length or checksum that does not add up is a refusal, never a
    partly drawn waveform.
- **The store is its own SQLite file** (DEC-122): `waveforms.db` in CuePoint's home, beside
  `cuepoint.db`, and so under `CUEPOINT_HOME` when that is set.

  ```sql
  CREATE TABLE meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
  );
  CREATE TABLE waveforms (
      path             TEXT    PRIMARY KEY,
      size_bytes       INTEGER NOT NULL CHECK (size_bytes >= 0),
      mtime_ns         INTEGER NOT NULL,
      analysis_version INTEGER NOT NULL CHECK (analysis_version > 0),
      state            TEXT    NOT NULL CHECK (state IN ('ready', 'failed')),
      reason           TEXT,
      duration_ms      INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
      data             BLOB,
      analysed_at      TEXT    NOT NULL,
      CHECK ((state = 'ready') = (data IS NOT NULL AND duration_ms IS NOT NULL)),
      CHECK ((state = 'failed') = (reason IS NOT NULL))
  ) WITHOUT ROWID;
  ```

  - **Keyed by the file's path, not the track's id.** A restored backup or a fresh import that gives
    tracks new ids keeps every waveform. A file moved in Rekordbox is a new path, and is analysed
    again.
  - **Case variants are distinct keys.** On a case-insensitive filesystem the same file under two
    spellings is analysed twice, which is harmless.
  - **The path is the one the file check records** for the track's current location, from one shared
    function.
- **A cache, not a record: its schema is rebuilt, never migrated.**
  - `meta.schema_version` names the schema. A store whose version this build does not know is
    renamed aside and a new one created.
  - A store SQLite cannot open, a corrupt one, is treated the same way and recorded once in the log.
  - A later build's schema change therefore costs a re-analysis, never a migration to get wrong.
  - It is not in DEC-009's launch backup, the support bundle or "Clear cache" (DEC-122).
- **When a stored row counts.** A row answers for a file when its `path` matches and its
  `analysis_version` is current.
  - The analysis job (WAVE-03) also compares `size_bytes` and `mtime_ns` with a fresh `stat`.
  - A display never calls `stat`. It shows what the store holds for the current version, and the next
    analysis replaces a changed file's row.
  - A `failed` row with the same size, modified time and version is never retried. A changed file or a
    new version is a new question, as with DEC-076's refused pictures.
- **`services/waveform_service.py`:**
  - **`analyse(track_id)`:**
    1. Resolve the current path.
    2. `stat` it. A file that is missing now returns `not_found` and writes nothing.
    3. Decode (WAVE-01), reduce, encode.
    4. Write the row, `ready` or `failed`, in one statement.

    It never raises for a file's content, only for a store it cannot write.
  - **`states(track_ids)`** answers each track's state from the library database and the store,
    without touching a file:

    | State | Meaning |
    | --- | --- |
    | `ready` | a current row |
    | `failed` | a failed current row, with its reason |
    | `missing` | the file check found the file missing |
    | `unchecked` | never checked |
    | `waiting` | present, and no current row |
    | `unavailable` | no decoder |

    `paused` is not a state of a track: it is the analysis's, and WAVE-05 reads the two together.
  - **`waveform(track_id, width)`** answers the decoded, downsampled bytes, or the state that
    explains why there are none.
- **Both databases, chunked.** A batch of up to 200 ids reads the tracks' paths from the library
  database in one query. It then reads the store in one `IN` query.

**Tests**:
- **Core, pure:**
  - a synthetic envelope reduces to the expected columns;
  - the maximum rule holds across column boundaries;
  - companding round-trips within one step;
  - downsampling to every width from 16 to 1,200 never loses a peak;
  - encode and decode round-trip;
  - a truncated, re-versioned or corrupted blob is refused;
  - a 2-second track and a 4-hour track both give 1,200 columns.
- **The store:**
  - a fresh store has the schema;
  - an unknown `schema_version` is set aside and rebuilt;
  - a corrupt file is set aside and rebuilt;
  - each `CHECK` refuses what it should;
  - a restored library database with new track ids finds its waveforms by path.
- **The service:**
  - with an injected decoder, each outcome of WAVE-01's vocabulary is stored as stated;
  - a file missing at open writes nothing;
  - a changed size or modified time makes a row not count for the job;
  - `states()` never opens or `stat`s a file, which a test proves with a filesystem that raises;
  - one real-decoder test per shipped format, skipped where no decoder exists.

**Acceptance criteria / DoD**:
- The store holds 50,000 synthetic waveforms, and its size is measured and recorded, against a budget
  of 250 MB.
- A batch of 200 states at width 120 takes under 50 ms, and one waveform at 1,200 under 20 ms, on the
  50,000-waveform store. Both are measured and recorded.
- `python -m pytest src/tests` clean; `ruff`, `mypy` clean; `core/waveform.py` joins the strict mypy
  gate.

**Risks**: Low to medium.
- **Two databases can disagree.** A track can outlive its file's row, and a row can outlive its track.
  Neither is wrong: a row with no track is dead weight until "Delete waveform data", and a track with
  no row is `waiting`. WAVE-03's job prunes rows whose path no track has, at the end of a run that
  covered the whole library.

**Complexity**: **M**

**Outcome**: Implemented (2026-09-30). One file analyses into a stored waveform, and any track's
waveform state, or its picture at any width from 16 to 1,200, is answered from the library database
and `waveforms.db` without touching a file. ADR-010 records the store and the measurements its layout
was chosen on. Nothing reaches a user yet: WAVE-03 is the first caller.

**What was built.**

- **`core/waveform.py`,** pure and in the strict mypy gate:
  - `reduce()`: an envelope to 1,200 columns of four bytes, each the maximum of its span, companded as
    `round(255 × √v)`;
  - `downsample()`: to any width from 16 to 1,200, never losing a peak;
  - `encode()` and `decode()`: the 12-byte header and the compressed body. `decode()` refuses a short,
    foreign, re-versioned, mis-sized, corrupted or over-long blob whole.

  `FORMAT_VERSION` names the rules, and a test pins a digest of a fixed envelope's picture to it.
- **`persistence/waveform_store.py`:** `waveforms.db` beside the library database.
  - Connections are one per thread, in WAL mode. The file is opened on first use, never at startup.
  - `summaries()` reads without the picture; `get_many()` and `get()` read with it.
  - `put()` writes a row, `ready` or `failed`, in one statement; `delete()` and `count()` complete it.
  - A store in another schema, unreadable, or foreign is set aside with its WAL sidecars, and one
    set-aside copy is kept. Corruption found in use leaves a marker, and the next launch sets the
    store aside. A lock is never mistaken for corruption.
- **`models/waveform.py`:** the stored row, with and without its picture; a track's `WaveformState`;
  an `AnalysisOutcome`; and a `WaveformAnswer`.
- **`services/waveform_service.py`,** behind `IWaveformService`, wired in `bootstrap.py` with one
  store per process:
  - `analyse(track_id)` answers every outcome of WAVE-01's vocabulary. It raises only for a store it
    cannot write.
  - `states(track_ids)`, `waveforms(track_ids, width)` and `waveform(track_id, width)` answer.

  A batch of up to 200 tracks costs one library query and one store query.
- **`FileStatusRepository.current_files()`:** the one shared read of a track's current path and the
  check made at that path. The store is keyed by the path it answers.
- **`scripts/bench_waveform_store.py`:** the acceptance's measurements, with a worst-case mode.
- **Tests:**

  | File | Tests | Covers |
  | --- | --- | --- |
  | `test_waveform.py` | 64 | The core, including every width from 16 to 1,200 against the maximum rule, and lanes of 0 beside 255 |
  | `test_waveform_store.py` | 55 | Schema, each `CHECK`, the page size, setting aside, corruption at launch and in use, a lock, and the three places the store must not be |
  | `test_waveform_models.py` | 35 | The row and state types |
  | `test_waveform_service.py` | 50 | Every outcome with an injected decoder; the file check's rule; when a row counts; states under a filesystem that raises on every look; the query count per 200; a restored library with new ids |
  | `test_waveform_service_binary.py` | 8 | Every shipped format through a real `mpv`, the band order on `bands.flac`, and a broken file. Desktop CI runs it with the pinned builds |
  | `test_current_files.py` | 3 | The shared path read |
  | `test_bench_waveform_store.py` | 6 | The bench's budgets and model, run end to end at a small size |
  | `test_row_values_whole_number.py` | 14 | The shared validator's fix (precision 12) |

  The file-write boundary test also lists the store as a writer of CuePoint's own data only, and holds
  it to reaching no writer of user files. A filesystem test holds it to files named after itself.

**Measured** (Linux x86_64, SQLite 3.45.1, `scripts/bench_waveform_store.py`, 50,000 waveforms, two
runs; each timing is over 30 random batches after a warm-up):

| Measure | Result | Budget |
| --- | --- | --- |
| The store, synthetic pictures (mean 3.94 KB) | 240.7 MB in both runs | 250 MB |
| The store, music-sized pictures (mean 2.9 KB, the layout measurement) | 172 MB | 250 MB |
| The store, pictures `zlib` cannot compress (`--worst-case`) | 278.1 MB | reported, not budgeted |
| 200 states | p95 3.4 and 4.8 ms | 50 ms |
| 200 pictures at width 120 | p95 37.5 and 23.9 ms | 50 ms |
| One picture at 1,200 columns | p95 0.16 ms | 20 ms |

- **The synthetic pictures are deliberately pessimistic.** They model a dance track's sections and
  beat, with noise in every band, which compresses worse than the music modelled. Tracks synthesised
  as audio and analysed through the real decoder gave pictures of 2.3–2.9 KB.
- **The first run missed the size budget,** at 251.6 MB with 4 KB pages. Precision 2 records the fix.
- **The worst case fits within 12%** even when nothing compresses.

**Where the specification was wrong, and what was done instead.** Each was settled the most durable
way and is recorded here and in ADR-010.

1. **An ordinary table, not `WITHOUT ROWID`.** Measured at 50,000 rows of about 3.5 KB, the ordinary
   table with a unique `path` was 10% smaller (210 MB against 234 MB) and read 200 rows three times as
   fast (1.1 ms against 3.6 ms). A `WITHOUT ROWID` row keeps only about 1 KB in its page and spills
   the rest to an overflow page of its own.
2. **Pages of 16 KB, not SQLite's 4 KB.** The first run at 50,000 measured 251.6 MB against the
   250 MB budget, with 197 MB of pictures. At 4 KB a page holds one picture, and a row just over its
   local limit takes a second page, so 28% to 46% of the file was waste. At 16 KB the waste is 18% to
   19%, and reads measured the same. 8 KB was worse for pictures just under 4 KB, and 32 KB saved a
   further 5% for twice the bytes read per row. Only a new store takes the size.
3. **The picture is the last column.** The specification put `analysed_at` after `data`. SQLite reads
   a row's columns in order, so a state would have walked the picture's overflow pages to reach it.
4. **The body stores each band in turn.** The four bands of one column were stored together in the
   specification. Stored band by band, the body is 11% smaller on tracks measured through the real
   decoder, since neighbouring values within a band are alike. `decode()` returns the specified
   column layout, so nothing else sees the difference.
5. **Downsampling had to be rewritten to meet the budget.** A loop per span took 0.23 ms per picture,
   and 200 pictures at width 120 measured 66 ms at p95 against 50 ms. The maximum is now taken over
   all of a picture's bytes at once: each byte gets a 16-bit lane of one Python integer, and a
   lane-wise maximum is a few big-integer operations. That is about 50 µs at width 120, with no
   `numpy`. A test compares every width against the maximum rule, and another sets lanes of 0 beside
   255, where a borrow between lanes would show.
6. **The store follows the library database, not only `CUEPOINT_HOME`.** It sits beside `cuepoint.db`
   wherever `database.path` puts that, so a test or a second profile never shares a store with the
   user's.
7. **Corruption found in use waits for the next launch.** The specification set a corrupt store aside
   on sight. Found by a read while other threads hold connections, it cannot be: Windows refuses to
   rename an open file. That call fails, a marker is written beside the store, and the next launch
   sets it aside before opening. The WAL sidecars go aside with it, so the copy kept is whole, and
   only the newest copy is kept.
8. **`missing` carries a reason.** The file check has more answers than the state table:
   - `missing`;
   - `unreadable`;
   - `root_unavailable`;
   - and, for a track Rekordbox gave no location, never checked at all.

   All four are `missing`, with the reason, rather than new states or a false `unchecked`.
9. **A stored picture answers first.** A track whose drive is unplugged, or whose decoder has gone,
   still shows the picture made from its file. Without one, the file check says why, and
   `unavailable` replaces only `waiting`.
10. **`analyse()` holds fact 6 itself.** A file the check did not find present at the current path
    is never opened (`not_present`, with the reason), whoever calls. A row that already counts for
    the file's size and modified time is `current`, and the file is not decoded again. So a request
    for a track already analysed costs a `stat`, as WAVE-03 needs.
11. **A picture that does not decode is deleted.** Its row goes, and the next analysis makes it again,
    rather than the refusal repeating at every display.
12. **A bug in a shared validator.** `row_values.whole_number()` tested exactness through `float()`,
    which refuses any integer above 2⁵³. That includes a modified time in nanoseconds. It now takes an
    `int` as it is, and a unit test that failed on the old code pins it.


---

## WAVE-03 — The Library Analysis Job ✅ IMPLEMENTED 2026-10-03

**Objective**: Analyse the whole library automatically, in the background, at low priority. The job
can be paused and resumed, continues after a restart, and steps aside for anything that rewrites the
library.

**User-visible result**:
- **The status strip** says "Analysing waveforms", with a count, while the job runs.
- **The Clean page's Health view** offers "Analyse waveforms", with Pause and Resume.

**Dependencies**: WAVE-02.

**Existing code reused**:
- `JobStore`, `FollowUps` and the file check's follow-up to the artwork scan.
- The artwork scan's conflict list.
- The config service, for one persisted setting.
- `useActiveJob.ts` and `HealthView.tsx`.

**Design**:

- **One job type, `waveform_analysis`, that drains a queue.** The job does not fix its work list when
  it starts. It asks for the next chunk of work until there is none. A chunk is 200 tracks that are
  present at their current path and have no row that counts. So a track imported while the job runs is
  analysed in the same run, and a follow-up requested while it runs is already satisfied.
- **Order:**
  1. Requested tracks first (below).
  2. Then entries of Sets.
  3. Then Collections.
  4. Then the rest, newest first.

  The tracks a user is preparing get their waveforms first.
- **Workers:** `min(2, max(1, cpu_count // 4))`. One on a four-core laptop, two on eight or more.
  WAVE-01's measurements confirm or amend this, and the number is recorded.
- **Staleness:** the job `stat`s each candidate inside a worker, under the per-file cap, so a network
  share that hangs on `stat` costs one worker one file. A row whose size or modified time differs is
  analysed again. A file that has gone is skipped and counted as "not found now".
- **When it starts:**
  - **After every whole-library file check,** beside the artwork scan, through `FollowUps`.
  - **At engine start, 30 seconds after the engine is healthy,** when all three hold:
    - the analysis is not paused;
    - a decoder exists;
    - the last check found present tracks with no row that counts.

    This is what "continues after a restart" means. It reverses nothing in DEC-073: that decision
    declined *checking* at launch. This reads only what the last check found present, and a missing
    file costs a skip.
  - **When the user resumes it.**
- **It steps aside.** An import, a refresh apply or a file check is a library rewrite or decides which
  files may be opened.
  - When one starts, a running analysis is cancelled cooperatively. It finishes the files in flight,
    commits, and ends as `cancelled`, with the reason `stepped_aside`.
  - The check that follows every such job requests the analysis again.
  - None of those jobs ever waits for the analysis, which may have hours left to run. The rule is the
    same one-way rule as the file check's and the artwork scan's.
- **Pause and resume** (DEC-116):
  - **Pause:** records `waveforms.analysis_paused = true` in the engine's settings and cancels a
    running job with the reason `paused`.
  - **Resume:** clears the setting and starts the job.
  - **Survives a restart:** the setting persists, so a paused analysis stays paused.
  - **Requests still run while paused.** A track the user is looking at is one file, and pausing is
    about background load.
- **Requested tracks** (`request(track_ids)`, called by WAVE-06):
  - They are put at the front of an in-memory queue of at most 200. A repeat moves to the front; beyond
    the cap, the oldest is dropped.
  - If no job is running, a request starts one that analyses only the requested tracks. This is
    ordinary when the analysis is paused or done.
  - A requested track that already has a counting row costs nothing.
- **Progress:**
  - **Reported:** analysed, failed, "not found now" and remaining, where remaining is the present
    tracks without a counting row, recounted each chunk.
  - **Rate:** per hour, over the last ten minutes.
  - **Throttled:** reported at most every 0.5 s.
  - **Strip:** reads "Analysing waveforms · 1,234 of 50,000", with the rate in its title.
- **Activity:** one event per run, never per track. A run that ends records what it did: "Analysed 1,234
  waveforms; 3 files could not be read", and whether it finished, paused or stepped aside.
- **Pruning:** a run that drains the whole library deletes store rows whose path no track has. A
  requests-only run never prunes.
- **What stops it:** Cancel in the strip is Pause. There is no third state. A cancel that the store
  did not ask for would leave a job the next start resumes anyway, so it is named for what it does.

**Tests**:
- **With an injected decoder:**
  - the drain loop analyses tracks added mid-run;
  - order is requests, Sets, Collections, then the newest;
  - an import starting mid-run makes the job step aside, and the check after it requests it again;
  - pause persists across a store restart, and a new engine does not start the job;
  - resume starts it;
  - a request while paused analyses exactly the requested tracks;
  - the queue cap drops the oldest;
  - a failed file is not retried until its size changes;
  - pruning happens only after a whole drain;
  - exactly one activity event per run;
  - start at launch happens only in the three stated conditions.
- **With a real decoder:** the fixtures analyse in a real run.
- **Electron:** the child processes end when the engine is killed.

**Acceptance criteria / DoD**:
- A synthetic 5,000-track library of fixture copies analyses end to end. The rate is measured and
  extrapolated to 50,000 per platform, and recorded.
- While the job runs, the player plays a three-track queue with no underrun in `mpv`'s log.
- The engine's search p95 stays within 1.5× of its idle value.
- `python -m pytest src/tests` clean; `ruff`, `mypy` clean.

**Risks**: Medium.
- **A job that runs for hours** meets every other job. The step-aside rule is what keeps it from
  blocking one, and its tests are the guard.
- **Laptop fans and battery** are the cost the user accepted (DEC-116). Low priority and one worker
  on four cores keep it modest.

**Complexity**: **L**

**Outcome**: Implemented (2026-10-03). The whole library is analysed in the background, at low
priority, after every file check and at launch, in the order the specification gives. It steps
aside for every job that rewrites the library or its files, comes back when the last of them ends,
and can be paused from the status strip and the Health view, across restarts. A requested track
jumps the queue at once, even while paused. WAVE-03's acceptance also found two defects in WAVE-01's
pipeline on the pinned Windows build, and both are fixed here (below).

**What was built.**

- **`services/waveform_analysis_service.py`,** in the strict mypy gate. It holds what a run does:
  - **the plan:** every present track against the store, counted, with what to analyse next;
  - **the drain:** workers ask for one file at a time. A requested track comes first, then the
    library's work, 200 files at a time, counted again between, leaving out every path the run has
    taken;
  - **verify:** after a whole-library check, every analysed file is `stat`ed;
  - **pruning:** once a whole-library run has drained;
  - **the rate:** files an hour over the last ten minutes;
  - **progress:** at most every half second;
  - **one activity event per run** (`waveforms.analysed`).
- **`persistence/waveform_work_repository.py`:** the present files in order (Sets' entries, then
  Collections', then the newest by Rekordbox's date added and then the newest import), and every
  track's path, for pruning.
- **The store's work index,** `waveforms_work`, and `current_files()`, `paths()` and
  `delete_paths()`. ADR-010's amendment records them.
- **`engine/waveform_jobs.py`,** in the strict mypy gate: one `AnalysisCoordinator` per job store.
  - **Starting:** after a whole-library check (with `verify`), when a job it gave way to ends, at
    launch 30 s after the engine serves, on Resume, and on a request.
  - **Stepping aside:** for an import, a refresh apply, a file check, a tag write and a tag restore.
  - **Pause:** `waveforms.analysis_paused` in `config.yaml`. The strip's Stop, and any cancel of
    this job, is a Pause.
  - **The request queue:** 200 at most, the oldest dropped, a repeat moved to the front.
- **`JobStore.add_listeners`:** told when any job starts and when any job has ended. The analysis
  observes the store, so no job it gives way to needs to know it exists.
- **Three routes,** `engine/waveforms_api.py`, through all six contract files as
  `window.cuepoint.waveforms`: the analysis's state, Pause and Resume. Each answers
  `{ value, refusal }`.
- **The renderer:**
  - **The strip** reads "Analysing waveforms · 1,234 of 50,000", gives the rate and the time left
    in its title, and its button reads Pause.
  - **The Health view** gains "Waveforms analysed": the state in words, and Pause, Resume or
    "Analyse waveforms".
  - `components/waveform/` gains the words and the `useWaveformAnalysis` hook, for WAVE-05's
    Settings panel to reuse.
- **`scripts/bench_waveform_analysis.py`:** the acceptance on the real job, the real decoder and an
  imported library: throughput, the rate on 6-minute tracks extrapolated, the search p95, and
  (`--play`) a queue played on the audio device with its log read for underruns.
- **The user guide's** Clean and The Window pages, and the changelog.

**Tests.**

| File | Tests | Covers |
| --- | --- | --- |
| `test_waveform_analysis_service.py` | 51 | The plan, the drain (tracks added mid-run, refills, two workers at once), the order, requests, every stop, a decoder that cannot analyse, a store that cannot be written, failed and gone files, verify, pruning, progress, the rate, the worker count and Activity |
| `test_waveform_jobs.py` | 41 | Starting after a check and beside each job it gives way to; the step-aside and the check after an import bringing it back; a failed import bringing it back; pause stopping a run, persisting across a new engine and its settings, and refusing when unsaveable; resume; Stop as Pause; requests while paused and mid-run; the queue cap; the three launch conditions; one event per run; the decoder refusing; the status |
| `test_waveforms_api.py` | 11 | Each route's shape, pause and resume over HTTP, the cancel route pausing, refusals, the token |
| `test_waveforms_contract.py` | 4 | The client's types against the engine's real answers |
| `test_job_listeners.py` | 6 | The listeners' timing, outcomes and isolation |
| `test_waveform_work_repository.py` | 10 | What is work, and the order |
| `test_waveform_store.py` | +8 | The index, an old store gaining it, the reads and the prune |
| `test_waveforms_config.py` | 5 | The setting's round trip and an old config |
| `test_waveform_analysis_binary.py` | 2 | Every shipped format through a real job and a real `mpv`, and a second run that decodes nothing |
| `test_audio_decode.py` | +8 | The graph's end, the version, the transports, the parse against the per-value rule |
| `test_bench_waveform_analysis.py` | 13 | The budgets, the underrun reading, and a whole run at a small size |
| `waveformAnalysis.spec.ts` (Electron end to end) | 1 | In the real app with the bundled `mpv`: an import of 301 real files followed, without a click, by the check and the analysis; the strip counting it; its Pause; a relaunch keeping the pause and the analysed files; Health's Resume finishing with 300 analysed and one unreadable; the runs' Activity |
| `engineChildren.integration.test.ts` | 1 | A real decoder ends when the app stops the engine. It fails when only the engine is killed |
| `desktopContract.test.ts` | +19 | The three methods across the six files |
| `useActiveJob.test.ts`, `StatusStrip.test.tsx` | +13 | The label, the title, Pause |
| `analysisWords.test.ts`, `useWaveformAnalysis.test.ts`, `HealthView.test.tsx` | 26 | The words, the hook, the Health view's row |

**Measured** (Windows 11 x86_64, 16 cores, the pinned `mpv` 0.41-dev / FFmpeg 8; two workers, the
job's default here; `scripts/bench_waveform_analysis.py --play`, two runs on a quiet machine):

| Measure | Run 1 | Run 2 | Budget |
| --- | --- | --- | --- |
| 5,000 fixture copies, end to end | all 5,000 in 430 s | all 5,000 in 386 s | every file analysed |
| 48 six-minute tracks | 20.7 s, 8,332 an hour | 20.5 s, 8,434 an hour | — |
| 50,000 six-minute tracks, extrapolated | about 6.0 hours | about 5.9 hours | recorded |
| Library search p95 over 10,000 tracks, analysing / idle | 38.5 / 28.0 ms, 1.38× | 38.1 / 28.2 ms, 1.35× | 1.5× |
| A three-track queue on the audio device (WASAPI) during the run | 0 underruns | 0 underruns | 0 |

- **Before the engine's share was cut,** the same search measured 1.52× and 1.54× (item 11 below).
- **The work list at 50,000 present tracks:** a refill of 200 takes 285 ms and a count 264 ms. The
  store's index read alone is 77 ms, and the index adds 5.3 MB to the store. A refill comes once
  per 200 files, about every 85 s; the status route counts at most every 5 s.
- **The workers:** `min(2, max(1, cpu_count // 4))` stands. Two on this machine meet the search
  budget, and one would double the hours.
- **Owed:** the same run on macOS, and on Linux with a named `mpv`. The playback check needs an
  audio device, so CI does not run it.

**Where the specification was wrong, and what was done instead.** Each was settled the most durable
way.

1. **Three of WAVE-05's routes are built here.** WAVE-03's own result is Pause and Resume in the
   Health view, which needs the analysis's state, Pause and Resume on the wire. WAVE-05 adds the
   waveforms themselves, requests and "Delete waveform data" to the same module and namespace. The
   strip's label and Pause, also listed under WAVE-05, are here for the same reason.
2. **It steps aside for tag writes and restores too.** They rewrite the files it reads, and on
   Windows a file `mpv` holds open is one a tag write may fail to replace. A tag preview only reads,
   so the analysis does not give way to it.
3. **It comes back when any job it gave way to ends, however it ended.** The specification had the
   check that follows a rewrite bring it back. But a failed import starts no check, and a tag write
   is followed by none, so either would have left it stopped until the next launch. Each such job
   ends through the job store's listener. The start is refused while another of them runs, so the
   last to end is the one that starts it.
4. **Staleness is found in two passes.** The file check records each file's size but not its
   modified time.
   - The work list counts a row only at the size the check found, so a file rewritten at another
     size is analysed again without any `stat`.
   - The run that follows a whole-library check also `stat`s every analysed file, which finds a
     file rewritten at the same size. Other runs do not, so a launch does not `stat` a whole network
     library.
5. **A request jumps the queue at once,** not at the next chunk. Workers take one file at a time
   and ask for a request before each, so a requested track waits for the files already decoding,
   about a second.
6. **A start asked for during a run is kept until a later count satisfies it.** A run counts the
   library again before every 200 files. A start that arrives after the run's last count, such as a
   check finishing as the run ends, starts the analysis again as the run ends, so it is never lost.
7. **Pruning never empties the store for an empty library.** "Rows whose path no track has" is
   every row when the library is empty, which is far likelier a new or reset database than a
   decision to throw away hours of analysis.
8. **A requests-only run that only looked records nothing.** A track that already has its waveform
   costs a `stat`, and WAVE-06's Inspector requests every track it shows. One event per such look
   would fill Activity.
9. **The strip's rate is read back from the time left,** which the engine computes as the remaining
   tracks at the rate. The job's progress shape is shared by every job, and widening it for one
   number was not worth a contract change.
10. **Two WAVE-01 defects on the pinned Windows build,** found when this step's acceptance ran
    there. Desktop CI had been failing on both since WAVE-01. ADR-009's amendment records them.
    - **The bands were remixed.** `mpv`'s own conversion from planar to interleaved float mixed the
      high band into the full and low bands, as a centre channel is downmixed. The high band read
      silent. The graph now ends in the output's own format, so `mpv` converts nothing, and
      `ANALYSIS_VERSION` is 2. `--check-analysis` passes there: the bands are at least 23.7 dB apart.
    - **The pipe transport was offered on Windows,** where it cannot work, and failed as the file's
      fault. It is now refused before any file is opened, and the tests use the transports each
      platform has.
11. **The search budget needed the engine's own work cut.** With two workers, the Library search's
    p95 measured 1.52× idle on Windows. Isolated, `mpv` cost 1.0–1.2×; the engine's Python parse of
    each envelope, about 60 ms holding the interpreter's lock, cost the rest.
    - **The parse runs at C level,** bit-identical, in about 27 ms.
    - **On Windows the engine asks for a 1 ms timer.** A thread that gives up the lock for SQLite
      waits to have it back on a timed condition that Windows times at 15.6 ms.
    - A shorter interpreter switch interval was measured and made no difference. Moving the square
      root into FFmpeg was measured and was not bit-identical.
12. **The contract test failed 74 times on Windows CI** against files that were right. A Windows
    checkout writes CRLF, and its patterns are written with `\n`. It now reads the sources with the
    line endings the repository stores.


---

## WAVE-04 — Cue Points and Beat Grids From the XML ✅ IMPLEMENTED 2026-10-05

**Objective**: Import each track's cue points and beat grid on import and refresh, read-only, and keep
the export unchanged.

**User-visible result**: The Inspector's imported record lists a track's cues, and says whether it has a
beat grid. They are drawn from WAVE-05.

**Dependencies**: None. It can be built alongside WAVE-02 and WAVE-03.

**Existing code reused**:
- `iter_collection_tracks` and `_library_track_from_element`.
- The import and refresh apply, and the refresh diff.
- The recorded source and its staleness (DEC-035).
- m0025's migration conventions.

**Design**:

- **Migration `m0026_track_marks`:**

  ```sql
  CREATE TABLE track_cues (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      kind     TEXT    NOT NULL CHECK (kind IN ('cue', 'fade_in', 'fade_out', 'load', 'loop')),
      hot_cue  INTEGER CHECK (hot_cue IS NULL OR hot_cue BETWEEN 0 AND 7),
      start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
      end_ms   INTEGER CHECK (end_ms IS NULL OR end_ms > start_ms),
      name     TEXT,
      color    TEXT CHECK (color IS NULL OR length(color) = 7),
      UNIQUE (track_id, position)
  );
  CREATE TABLE track_beat_grid (
      track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
      bpm      REAL    NOT NULL CHECK (bpm > 0),
      meter    TEXT,
      beat     INTEGER CHECK (beat IS NULL OR beat BETWEEN 1 AND 4),
      PRIMARY KEY (track_id, position)
  ) WITHOUT ROWID;
  ```

  - **Nothing is rebuilt.** The migration adds two tables and touches no existing one.
  - **Why `kind` is checked here** when PREP-01 left `warning` unchecked: the vocabulary is Rekordbox's,
    not CuePoint's. A new mark type is skipped and counted (below), never stored under a guess.
- **Reading an element.** `POSITION_MARK` and `TEMPO` are children of `COLLECTION/TRACK`, so the reader
  collects them before the element is cleared. It returns them beside the `LibraryTrack`, not inside
  it, so every existing caller is unchanged.
  - **`POSITION_MARK`:**
    - `Type` 0–4 map to `cue`, `fade_in`, `fade_out`, `load` and `loop`.
    - `Num` −1 is a memory cue (`hot_cue` NULL), and 0–7 are hot cues A–H.
    - `Start` and `End` are seconds, stored as whole milliseconds, rounded. Rekordbox writes three
      decimals.
    - `Red`, `Green` and `Blue`, when all three are present, become `#rrggbb`.
    - `Name` is kept as written.
    - **Refused:** an unknown `Type`, a missing `Start`, a negative time, or an `End` not after `Start`.
      Such a mark is skipped, and the skip is counted in the import summary, never raised.
  - **`TEMPO`:**
    - `Inizio` becomes `start_ms`, `Bpm` becomes `bpm`, `Metro` becomes `meter`, and `Battito` becomes
      `beat`.
    - Several `TEMPO` elements are a variable grid, kept in order.
    - An element with a missing or non-positive `Bpm` is skipped and counted.
- **Writing.** Import and refresh apply replace a track's marks whole, in the same transaction as the
  track's row: delete, then insert. A track removed by a refresh loses its marks by cascade.
- **The refresh diff.**
  - The diff gains one count: tracks whose cues or grid differ. Two tracks' marks are compared as the
    ordered list of their stored values.
  - The preview states it as one line: "Cues or beat grid changed on 12 tracks". It is not a per-field
    change, because the preview lists what a user might *refuse*, and marks are read-only copies of
    Rekordbox's.
  - A diff with only mark changes is still a diff to apply.
- **Libraries imported before WAVE-04.**
  - A one-time `marks_backfill` job runs at the first launch after m0026, when the recorded source's
    size and modified time still match (DEC-035). It re-reads only the marks and writes them.
  - When the source has changed or is gone, it does nothing, and marks arrive with the next refresh.
  - A setting, `library.marks_read`, records that marks have been read. It is set by an import, a
    refresh apply or the backfill. The Inspector reads it to say "Cues arrive with the next refresh"
    rather than "No cues".
- **The export is unchanged** (fact 9). It never reads these tables.
- **Models:** `models/track_marks.py` holds `TrackCue`, `BeatGridMarker` and `TrackMarks`, each with
  `from_row`.
- **Route:** `library/tracks/{id}` gains `marks`, a small summary: a count of hot cues and memory cues,
  and whether the track has a grid, with its first BPM. The full marks travel with a waveform (WAVE-05).
- **Inspector:** its imported record lists the cues, one line each, "A · 0:32.1 · Drop". A grid shows as
  "Beat grid · 128.00 BPM", or "variable" when there are several markers. The markers WAVE-06 draws are
  never the only place a mark is shown.

**Tests**:
- The migration applies to a version-25 library and changes nothing else. A fresh database's schema
  equals an upgraded one's.
- **The reader:**
  - every `Type` and `Num` maps as stated, including loops with `End`;
  - colours map to `#rrggbb`;
  - unknown and malformed marks are skipped and counted;
  - a variable grid keeps its order;
  - a track with no marks has none;
  - a 50,000-track XML with marks is read within 10 % of its time without them, measured and recorded.
- **Import and refresh:**
  - marks are written;
  - a refresh that moves a cue is counted and applied;
  - a removed track's marks cascade away;
  - a restored launch backup brings the marks back.
- **The backfill:** runs when the source matches, does nothing when it has changed, and runs once.
- **The export:** a fixture with cues and a grid exports byte-identical to its output before this
  step.

**Acceptance criteria / DoD**:
- The Inspector lists cues for a fixture library. `python -m pytest src/tests` clean; renderer and
  Electron suites clean; `ruff`, `mypy` clean.

**Risks**: Medium.
- **This is the first time CuePoint reads the part of the XML DEC-077 was written to protect.** It
  reads and never writes, and the export test is the guard.

**Complexity**: **M**

**Outcome**: Implemented (2026-10-05). An import and a refresh read every track's cue points and
beat grid from the XML, read-only, in the transaction that writes the tracks, and the Inspector
lists them. A refresh's preview counts the tracks whose marks changed in one line, and a diff of
only that is still one to apply. A library imported before this step has its marks read once from
its unchanged source at the first start. The export is byte-identical to its output before this
step, over a fixture holding every kind of mark.

**What was built.**

- **`m0026_track_marks`:** `track_cues` and `track_beat_grid`, each keyed by `(track_id, position)`
  and cascading with its track. Nothing else is touched.
- **The reader,** `data/rekordbox_marks.py`, in the strict mypy gate:
  - **One function per element type:** `read_cue` and `read_tempo` hold the full rules.
  - **An inline fast path** in `read_track_marks`, for a mark in exactly the form Rekordbox
    writes. A property test (3,500 generated marks) holds that it never reads a value the full
    rules would read differently.
  - **Times:** Rekordbox's three decimals convert exactly through a float; any other form goes
    through `Decimal`, rounded half up, so every machine agrees.
- **`data/rekordbox.py`:** `iter_collection_entries` yields each track with its marks beside it.
  `iter_collection_tracks`, which every other caller uses, reads no marks and is unchanged.
- **`models/track_marks.py`:** `TrackCue`, `BeatGridMarker` and `TrackMarks`, each with
  `from_row`, the reader's plain values, and a fingerprint of a track's marks that a refresh
  compares.
- **`persistence/track_marks_repository.py`:** a whole replacement inside the caller's transaction,
  one track's marks, every track's fingerprint (two ordered scans merged, so only digests are held),
  and `library.marks_read`.
- **`persistence/derived_indexes.py`:** the one module that runs `derived_indexes`' SQL, for the
  name index and the marks alike.
- **The import and refresh** (`services/library_import_service.py`):
  - the marks are written after the tracks, in the same transaction, with `library.marks_read`;
  - the summaries carry what was written and skipped, and so do Activity and the apply's result;
  - `RefreshDiff.marks_changed` counts kept tracks whose marks differ.
- **The backfill:** `services/marks_backfill_service.py` and `engine/marks_backfill_jobs.py`
  (`marks_backfill`), both in the strict mypy gate.
  - **When it starts:** at engine start, when the marks are unread and the source matches.
  - **How it writes:** 2,000 tracks per transaction. Each chunk first checks, in its own
    transaction, that nothing has read the marks since it began.
  - **Its record:** one Activity event. The strip reads "Reading cue points".
- **The route:** `library/tracks/{id}` gains `marks`, through `engineClient.ts` and the bridge
  types, held by the contract tests.
- **The renderer:**
  - `TrackMarksSection`: the cues in play order, Rekordbox's colour beside each, and the grid;
  - `trackMarks.ts`: the wording;
  - the preview's line, and the applied line's skipped count.
- **`scripts/bench_marks.py`:** the 50,000-track measurement below.
- **The user guide's** Library page, and the changelog.

**Tests.**

| File | Tests | Covers |
| --- | --- | --- |
| `test_rekordbox_marks.py` | 100 | Every `Type` and `Num`, loops and their `End`, colours, times to the millisecond (every millisecond to the limit, generated), every refusal counted, a variable grid's order, no marks, the inline path held equal to the full rules, the fixture through the iterator |
| `test_track_marks_models.py` | 35 | Each model refusing what its table refuses, rows, order, the fingerprint and the summary |
| `test_track_marks_schema.py` | 23 | A version-25 library upgraded with every row and table unchanged, fresh equals upgraded, every `CHECK`, the keys, the cascade |
| `test_track_marks_repository.py` | 14 | A whole replacement, other tracks untouched, batches, joining the caller's transaction, fingerprints, `library.marks_read` and its version |
| `test_library_import_marks.py` | 27 | Marks written and recorded read; summaries, Activity and the apply's result; a moved cue counted once and applied; every kind of change counted; order; a new track; a removed track's cascade; a re-linked track; cancel and failure; a library never read; a restored launch backup |
| `test_marks_backfill_service.py` | 23 | A real version-25 library upgraded: read as an import would, chunked, once; a changed, touched, missing and restored source; no source; a cancel finished at the next start; an import or a new source record meanwhile; Activity |
| `test_marks_backfill_jobs.py` | 16 | When it starts and when it waits, each ending, progress, cancel, and a real run started by the engine itself |
| `test_track_marks_api.py` | 8 | The route over HTTP and its shape against the client's types |
| `test_export_unchanged_by_marks.py` | 2 | The export of a library imported from `marks.xml`, byte for byte against its output before this step, and every mark carried |
| `test_marks_scale.py` | 5 | The bench at 5,000 tracks |
| `test_refresh_diff.py`, `test_discover_schema.py`, `test_persistence_boundary.py` | changed | The diff's shape, `derived_indexes`' one owner, the backfill's transactions |
| `trackMarks.test.ts`, `TrackMarksSection.test.tsx` | 28 | The wording, the section, its place in the Inspector, nothing to edit |
| `libraryFormat.test.ts`, `RefreshPreviewDialog.test.tsx`, `useActiveJob.test.ts` | +5 | The preview's line, a diff of only marks applied, the applied line, the strip's label |
| `desktopContract.test.ts` | +4 | The three shapes and the kinds, the same in both TypeScript copies |
| `trackMarks.spec.ts` (Electron end to end) | 1 | In the real app: `marks.xml` imported and every line in the Inspector, a refused mark absent, a refresh moving one cue counted, applied and shown |

**Measured** (Windows 11 x86_64, 16 cores; `scripts/bench_marks.py`, 50,000 tracks):

| Measure | Run 1 | Run 2 | Budget |
| --- | --- | --- | --- |
| Read, typical collection (3.3 marks a track): with marks / tracks alone | 2.375 / 1.966 s, 1.21× | 2.385 / 1.966 s, 1.21× | 1.30× (specified 1.10×) |
| Read, every track prepared (8 marks): with marks / tracks alone | 3.374 / 2.638 s, 1.28× | 3.392 / 2.648 s, 1.28× | 1.40× (specified 1.10×) |
| Import, every track prepared: with marks / marks left out | 9.55 / 6.43 s | 9.53 / 6.40 s | — |
| Refresh preview, every track prepared, one cue moved, the file read | 7.55 s, 1 track counted | 7.50 s, 1 track counted | exactly 1 |
| Backfill, every track prepared (350,000 cues, 50,000 markers) | 6.73 s | 6.60 s | read whole |

- **The import's extra three seconds** are mostly SQLite writing 400,000 rows, once, inside the
  import's transaction; a re-import writes the same rows again, as a whole replacement does.
- **Owed:** the same run on macOS and Linux.
- **The Electron suite on Windows** passes but for one check that is not this step's.
  `prepare.spec.ts` holds the Prepare page's whole rows with the lanes open at 4, a figure derived
  from Linux "until the Windows run records its own", and this Windows build shows 3. It shows 3
  with the Inspector's marks section switched off too. It is left for Phase 10's owed Windows run,
  since lowering a held row count is a layout decision (DEC-112), not a test fix.
- **`prepareJourney.spec.ts` compared the copied set list byte for byte** with the saved file. On
  Windows the clipboard holds CRLF line ends, which Chromium writes for any text put on it, so the
  test now compares the lines.

**Where the specification was wrong, and what was done instead.** Each was settled the most durable
way.

1. **The read misses its 10% by a margin no rewrite closes.** Measured with the reader at its
   fastest, marks cost 21% of reading the tracks alone in a typical collection and 28% with eight on
   every track, about half a second at 50,000 tracks. Reading a mark's attributes is most of it,
   and that is the floor of the standard library's parser; a C parser would be a new dependency for
   half a second once per import. The bench records both shapes, and its budgets sit just above
   what was measured so they catch a regression.
2. **`track_cues` has no id.** The specification gave it an `AUTOINCREMENT` id beside a unique
   `(track_id, position)`. Nothing references a cue by id, and a refresh replaces a track's marks
   whole, so the id would change every time and could never be a key. Keyed by `(track_id,
   position)` without a rowid, as the grid is, 350,000 cues write 15% faster and take a third less
   space, in the file every launch backup copies.
3. **`library.marks_read` lives in the library, not in the engine's settings.** It is a
   `derived_indexes` row, written with the marks. A restored backup, or another library, then says
   truthfully whether its own marks were read. The row carries the reader's version, so a change
   to what is read reads every library again. `derived_indexes` already had an owner, so its SQL
   moved to one module both use.
4. **The route lists every cue.** The specification gave the route counts only and sent the marks
   with the waveform (WAVE-05), but this step's Inspector lists every cue before WAVE-05 exists. A
   track has a handful of cues, so all of them travel. The grid is still summed up, with its range
   added, since a variable grid can hold hundreds of markers.
5. **"Variable" means the tempo changes.** Rekordbox can write two markers at one tempo when a grid
   is re-anchored. The specification's "several markers" would call that variable; this calls it
   by its one tempo.
6. **More is refused than the specification listed,** each because the table cannot hold it and
   nothing may be stored under a guess:
   - a `Num` outside −1 to 7, or missing;
   - a `Battito` outside 1 to 4;
   - an `End` equal to `Start` once both are whole milliseconds.

   Some values are not refusals:
   - a colour that cannot be read is left off, and the cue is kept;
   - an empty `End` or `Name` is none, as Rekordbox writes every attribute empty where unused.
7. **The skip count travels further.** It is in the refresh's summary, its Activity event and the
   applied line as well as the import's, so a refresh that skips marks says so too.
8. **A backfill that an import overtakes yields.** The specification had it run once. An import or
   refresh started beside it writes every track's marks itself, so the backfill checks before each
   chunk and ends as `superseded`, leaving the newer marks standing. Neither waits for the other.
9. **The export's guard is a committed file.** `marks_export.xml` was written by the export before
   this step's first change and is compared byte for byte. `.gitattributes` keeps a checkout from
   converting either fixture's line endings, which would otherwise fail on Windows.

---

## WAVE-05 — The Waveforms API, the Contract and the Drawing ✅ IMPLEMENTED 2026-10-05

**Objective**: Put waveforms, their marks and the analysis's state on the wire, and draw a waveform in
the pixel style.

**User-visible result**:
- **A Settings panel, "Waveforms,"** holds:
  - the analysis's state;
  - Pause or Resume;
  - the colour choice: "Three bands" or "One colour";
  - "Delete waveform data…".
- **Nothing else draws a waveform yet.**

**Dependencies**: WAVE-02, WAVE-03, WAVE-04.

**Existing code reused**:
- The six-file contract and `desktopContract.test.ts`.
- `useScale`, the theme tokens and `deriveThemeTokens`.
- `prepareLanes.ts`'s pure-layout pattern.

**Design**:

- **Routes** (`engine/waveforms_api.py`):

  | Route | Answers |
  | --- | --- |
  | `GET /api/v1/waveforms?track_ids=…&width=…&marks=0\|1` | Each track's state, and for a ready track its duration and base64 bytes at `width` (16–1,200). At most 200 ids. With `marks=1`, each track's cues and grid. |
  | `GET /api/v1/waveforms/analysis` | `running`, `paused`, `idle` or `unavailable`, with the counts, the rate and the job's id. |
  | `POST /api/v1/waveforms/analysis/pause` | The analysis's state after pausing. |
  | `POST /api/v1/waveforms/analysis/resume` | The analysis's state after resuming. |
  | `POST /api/v1/waveforms/request` | Queues at most 50 ids at the front (WAVE-03). |
  | `POST /api/v1/waveforms/delete-data` | Empties the store; the analysis starts again unless paused. |

  A track's answer while the analysis is paused carries `waiting` and the analysis's `paused`, so the
  words can say "Analysis paused" rather than "Waiting".
- **The bridge:** `window.cuepoint.waveforms` has six methods, each answering `{ value, refusal }`. The
  preload turns base64 into a `Uint8Array`, so the renderer never parses a string it did not need.
- **The analysis on the event stream.** The job's SSE progress already reaches the renderer. A
  `useWaveformAnalysis` hook reads it, so the Settings panel and the strip agree.
- **`components/waveform/`:**
  - **`waveformLayout.ts`, pure.** From the bytes, a box in CSS pixels, the scale, the device pixel
    ratio, the colour mode, the marks, the playhead and the planned in and out times, it answers:
    - a list of rectangles in device pixels, one run per band per column, heights snapped to whole
      scale pixels;
    - the cue markers' positions;
    - the grid lines;
    - the playhead's column.

    Grid lines are drawn only as densely as they stay at least six scale pixels apart: every bar, then
    every 4, 8, 16 or 32 bars, counted from the grid's first downbeat (`beat` 1).
  - **`WaveformCanvas.tsx`:**
    - one `<canvas>` sized in device pixels, smoothing off, repainted by a `ResizeObserver` and on theme
      change;
    - it paints the layout and makes no decision of its own;
    - it is `aria-hidden`, because the surrounding control or text carries the meaning.
  - **Drawing the three bands:** layered. The low band's height is drawn first in its colour, then mid
    over it, then high over that, each as its own height from the centre line, as Rekordbox's three-band
    view does. "One colour" draws the full band in the mono colour.
  - **Other features:**
    - played portions are drawn dimmer;
    - hot cues get a one-scale-pixel line in their colour with the letter above it;
    - memory cues get a neutral line;
    - loops get a tinted span;
    - the playhead is `--fg-primary`.
- **Tokens:**
  - **Colours:** `--waveform-low`, `--waveform-mid`, `--waveform-high`, `--waveform-mono`,
    `--waveform-played`, `--waveform-grid` and `--waveform-memory-cue`, in all five theme files, and
    derived by `deriveThemeTokens` for custom themes.
  - **Contrast:** a test holds each band colour at a contrast ratio of at least 3:1 against
    `--bg-panel`, in every built-in theme and in three derived ones.
- **The colour choice** is a display preference. It is stored in the renderer like the Inspector's
  state (`cuepoint-waveform-colour`, `bands` or `single`, default `bands`), read through one hook, and
  wrapped in `try`/`catch` like every other stored preference.
- **The data hook, `useWaveforms`:**
  - **Batches:** it collects the ids a frame asks for, requests them in batches of 200, and keeps up to
    2,000 answers in memory, least recently used first out, keyed by id and width.
  - **Refreshes:** when the analysis's analysed count changes it asks again for its `waiting` ids,
    at most once every 2 seconds. That is how a waveform appears while the user watches.
  - **Invalidates:** "Delete waveform data" and a finished refresh empty it.
- **Settings → Waveforms:**
  - the state in words: "Analysing · 1,234 of 50,000 · about 6 hours left", "Paused · 48,766 to go",
    "All 50,000 analysed · 3 could not be read", or "Waveforms need the player's decoder, which this
    build does not include";
  - Pause and Resume;
  - the colour choice;
  - "Delete waveform data…", with a confirmation that states the size on disk and that the whole
    library will be analysed again.
- **The strip:** `useActiveJob.ts` labels `waveform_analysis` "Analysing waveforms", and its Cancel
  reads "Pause".

**Tests**:
- **Python:**
  - each route's shape, limits and refusals: more than 200 ids, a width out of range, an unknown id;
  - pause and resume through the routes;
  - delete-data empties the store and restarts analysis unless paused.
- **The desktop contract test** holds all six files to one another and to the engine's answers, using a
  fixture produced by a Python test from a real engine (`waveforms.fixture.json`, regenerated with
  `CUEPOINT_WRITE_FIXTURES=1`).
- **The layout, pure:**
  - column count and positions at scales 1, 2 and 3 and device pixel ratios 1 and 2;
  - heights snap to scale pixels;
  - layering order;
  - one colour draws only the full band;
  - played dimming;
  - cue, loop and grid positions from milliseconds;
  - grid density thresholds;
  - a track with no grid draws no lines.
- **Components:** the Settings panel's states and actions, the confirmation's words, and the preference
  surviving a reload and a storage that throws.
- **End to end:** a waveform painted in Electron has the expected band colour in the expected columns
  for `bands.flac`, in two themes.

**Acceptance criteria / DoD**:
- Settings shows the analysis live, and Pause and Resume work across an app restart.
- Renderer (`npm test`, `npm run lint`, `npm run typecheck`), Electron and Python suites clean.

**Risks**: Low to medium.
- **The first canvas** brings a test gap jsdom cannot close. The pure layout carries every decision,
  and the end-to-end pixel check closes the rest.

**Complexity**: **L**

**Outcome**: Implemented (2026-10-05). Waveforms, their marks and the analysis's state are on the
wire through all six contract files, and the renderer draws a waveform on its first canvas, in
whole scale pixels, in three bands or one colour, in every theme. Settings → Waveforms shows the
analysis live with Pause or Resume, the colour choice, a preview on the track in the player, and
"Delete waveform data…", which says what it costs first. Nothing else draws a waveform yet: WAVE-06
places it in the bar, the Inspector and the Library.

**What was built.**

- **Three routes,** in `engine/waveforms_api.py`, beside WAVE-03's three (both in the strict mypy
  gate):
  - `GET /api/v1/waveforms`: up to 200 tracks' states and pictures at a width of 16–1,200, as
    base64, with the analysis's `paused`; with `marks=1`, every cue and every grid marker
    (`TrackMarks.drawing`, read for the whole batch in two queries by `get_many`);
  - `POST /api/v1/waveforms/request`: up to 50 ids to the front of WAVE-03's queue;
  - `POST /api/v1/waveforms/delete-data`: empties the store, and answers what went and the
    analysis after.
- **Deleting the data:**
  - `WaveformStore.clear()` deletes every row, `VACUUM`s and truncates the WAL, and deletes a
    set-aside copy; `disk_bytes()` says what the store takes, never opening it (ADR-010's
    amendment);
  - `WaveformAnalysisService.delete_data()` records it once in Activity
    (`waveforms.data_deleted`);
  - `AnalysisCoordinator.delete_data()` stops a running analysis with the new reason
    `data_deleted`, waits for its files in flight, empties the store, then starts a run unless
    paused. Nothing starts while it deletes, and queued requests survive it.
  - The analysis's status gains `store_bytes`, which the confirmation states.
- **The contract:** `getWaveforms`, `requestWaveforms` and `deleteWaveformData` through
  `engineClient.ts`, the supervisor, `main.ts`, `preload.cjs` and the bridge types, as
  `window.cuepoint.waveforms.get`, `.request` and `.deleteData`. Main decodes each picture once
  into a `Uint8Array` of exactly its bytes.
- **`components/waveform/`:**
  - `waveformLayout.ts`, pure: columns of one scale pixel, heights in whole scale pixels, the
    bands layered or one colour, the played part and the planned times dimmed, loops tinted,
    each cue's line with a hot cue's lettered flag, the grid thinned to every 1, 4, 8, 16 or 32
    bars, and the playhead;
  - `waveformPaint.ts` fills a layout from the theme's tokens, and `WaveformCanvas.tsx` sizes the
    canvas in device pixels and repaints on a resize, a pixel-ratio change, a scale change and any
    theme change, a custom theme's preview included;
  - `waveformColour.ts`: the preference (`cuepoint-waveform-colour`) through one hook;
  - `waveformCache.ts` and `useWaveforms.ts`: the shared data hook;
  - `analysisWords.ts` gains a track's state in words (WAVE-06's states), sizes, and the
    deletion's words; `useWaveformAnalysis` gains the deletion.
- **Tokens:** seven `--waveform-*` colours in all five themes, and derived for custom themes by
  `deriveThemeTokens`, each band moved towards white or black only as far as 3:1 against the
  panel needs.
- **`screens/WaveformSettingsPanel.tsx`** in Settings, after Audio. A finished refresh empties the
  renderer's waveforms.
- **The user guide's** player and Clean pages, ADR-010's amendment and the changelog.

**Tests.**

| File | Tests | Covers |
| --- | --- | --- |
| `test_waveforms_api.py` | 61 (+50) | Each route's shape over HTTP: every state, every width's byte count, a failed and a missing file's reason, the paused flag, unknown and repeated ids, 200 ids, marks with and without a reading, 15 refusals of the read, 9 of a request, more than 200 and 50; requests while paused; the deletion emptying the store and the analysis making it again, staying empty while paused, a store that cannot be emptied, the token, an unreachable library |
| `test_waveform_jobs.py` | 51 (+10) | The deletion with a run going (it waits, the run ends `data_deleted`, nothing lands after), nothing starting while it deletes, requests surviving it while paused, a store that fails, the status's size |
| `test_waveforms_fixture.py` | 4 | Writes `waveforms.fixture.json` from a real engine: every state, marks, a request, a deletion and two refusals; its picture's four sections |
| `test_waveforms_contract.py` | 6 (+2) | Every state and cue kind typed, every field of every answer declared |
| `test_waveform_store.py`, `test_waveform_analysis_service.py` | +8, +5 | The size, clearing every version, giving 90% of the space back, a set-aside copy, a reader beside it, the event once |
| `test_track_marks_repository.py`, `test_track_marks_models.py` | +4, +2 | Many tracks' marks at once, beyond one query; the drawing's shape |
| `waveformLayout.test.ts` | 67 | Column count and positions at scales 1–3 and ratios 1, 1.5 and 2; heights snapped; layering; one colour; a peak kept when narrowing; repeating when widening; played dimming; planned times; cue, loop and flag positions from milliseconds; the grid's downbeats, density thresholds, variable grids and no grid; the engine's own picture |
| `waveformPaint.test.ts`, `WaveformCanvas.test.tsx` | 3, 7 | The paint order and tokens; device-pixel size, repainting on a theme change, the remembered choice |
| `waveformCache.test.ts`, `useWaveforms.test.tsx` | 17, 5 | Batching per task and per 200, widths and marks apart, the bound, unknown ids, errors and their retry, refreshing waiting tracks when the count moves and at most every 2 s, emptying, a late answer dropped |
| `waveformColour.test.ts` | 7 | The default, a reload, every reader at once, storage that throws either way, another window |
| `waveformTokens.test.ts` | 17 | Every theme declares the tokens; each band at 3:1 in five themes and three derived ones |
| `WaveformSettingsPanel.test.tsx` | 18 | The states in words, Pause and Resume, the confirmation's words, cancel, delete and its refusal, the preview's states, the choice across a reload and through storage that throws |
| `analysisWords.test.ts`, `useWaveformAnalysis.test.ts`, `LibraryScreen.test.tsx` | +23, +2, +1 | A track's state, sizes and the deletion in words; the deletion's hook; a refresh emptying the waveforms |
| `desktopContract.test.ts` | 56 in its section | The six methods across the six files, the decode in main, every type alike in both processes and against the engine's answers in `waveforms.fixture.json` |
| `engineClient.waveforms.test.ts` | 9 | The query, the bytes copied out of Node's pool, refusals as values |
| `waveformSettings.spec.ts` (Electron end to end) | 3 | `bands.flac` analysed by the bundled `mpv` and painted: each section's topmost pixel in its band's colour in `neoDark` and `retro16`, the mono colour with "One colour", kept across a relaunch; "Delete waveform data" emptying the store and the analysis making it again; Pause in Settings kept across a relaunch, and Resume to the end |

**Run on Windows 11** (the pinned `mpv`): the Python suite (11,938 passed), the renderer (4,011),
Electron (588), and the whole end-to-end suite, 64 passed and one skipped. The one failure is
`prepare.spec.ts`'s lanes row count, 3 whole rows against the 4 held, which WAVE-04 found and showed
to be independent of this phase; it is owed to Phase 10's Windows run. A screenshot of the preview
was looked at in two themes: lows blue, mids amber, highs white, each section in its own band.

**Where the specification was wrong, and what was done instead.** Each was settled the most durable
way.

1. **Main decodes the pictures, not the preload.** Node's `Buffer` decodes base64 natively in main,
   and IPC carries a `Uint8Array` as it is, so the preload stays a list of narrow forwards and the
   renderer still never parses a string. The bytes are copied out of the `Buffer`: a small one is a
   view on Node's 8 KB pool, which IPC would carry whole for every track.
2. **An id that is no track is listed, not refused.** A batch of 200 visible rows in which one track
   was deleted a moment ago would otherwise fail for all 200. It answers under `unknown`, and the
   renderer holds it as such and stops asking.
3. **"Delete waveform data" stops the analysis first, and gives the space back.** The specification
   said it empties the store. A run going at the time would write the files it was decoding after
   the deletion, so the run stops with its own reason and is waited for. And a store emptied without
   `VACUUM` keeps its pages: it would say it was deleted and take the same disk. The confirmation
   states the size, which the status now carries (`store_bytes`). It is recorded in Activity, as
   every other deletion of user-visible data is.
4. **Settings draws a preview.** "Nothing else draws a waveform yet" holds outside Settings. A colour
   choice without a picture asks a person to imagine it, and the specification's end-to-end check
   needs a waveform painted somewhere: the preview draws the track in the player, which a person
   knows, with its cues, grid and playhead.
5. **A hot cue's letter is drawn in pixels.** A canvas's text is smoothed whatever the canvas says,
   so the letters A–H are 3 × 5 scale-pixel glyphs in the layout, in a flag of the cue's colour,
   black or white whichever reads. A hot cue Rekordbox gave no colour is Rekordbox's own green. A
   flag is drawn only where the drawing is at least 14 scale pixels tall.
6. **"Dimmer" is an overlay of the panel over the bands only.** `--waveform-played` is the panel's
   colour at 60%, painted over each played column as tall as its tallest band, so the background
   is not shaded too. The planned in and out times use the same token over the whole height.
7. **Anything above silence is at least one scale pixel tall,** so a quiet passage is a line rather
   than nothing, as Rekordbox draws it.
8. **The analysis is read, not taken from the event stream.** WAVE-03 made `useWaveformAnalysis`
   read every 2 seconds while a view shows it, as the strip discovers jobs, and Settings reuses it.
   `useWaveforms` reads the analysis only while a track it shows is waiting.
9. **Two refusals more.** `WAVEFORMS_STORE_FAILED` when the store cannot be emptied, a refusal the
   panel says in words; and 503 `WAVEFORMS_UNAVAILABLE` when the library cannot be reached, which
   is thrown, since nobody can act on it.
10. **The renderer's tests read the theme files.** Vitest stubs CSS out, which made a contrast test
    of the real files impossible; `vite.config.ts` lets the theme files through.
11. **The strip's label and Pause were WAVE-03's** already (its deviation 1).


---

## WAVE-06 — Waveforms in the Player Bar, the Inspector and the Library ✅ IMPLEMENTED 2026-10-05

**Objective**: Draw the waveform where DEC-114 places it: as the bar's seek control, in the Inspector
and in a Library column.

**User-visible result**:
- **The bar** shows the playing track's waveform, and a click or drag on it seeks.
- **The Inspector** shows the selected track's waveform with its cues and grid.
- **The Library** offers a "Waveform" column.

**Dependencies**: WAVE-05.

**Existing code reused**:
- `PlayerBar.tsx`'s scrub preview and single seek on release.
- The artwork column's pattern.
- The Inspector's header zone.

**Design**:

- **The bar's seek control.**
  - **The picture:** the waveform fills the seek region, between the two times, inside its existing
    height. The bar's height is unchanged, and an end-to-end test measures it before and after.
  - **The control:** the range input stays the control. It lies over the waveform, transparent,
    focusable, with its label and value text unchanged. The focus ring is drawn around the waveform.
    Keyboard, screen reader and pointer all go through the same element and PLAYER-06's logic: a drag
    previews, and a release seeks once.
  - **The playhead:** the played part is dimmed, and the playhead follows the position main reports.
  - **Stretched to the player's duration:** the waveform is laid across the duration the player
    reports, so a click at a column seeks to that column's time, as the slider always did. A test
    holds the waveform's own duration within one column of the player's for every fixture.
  - **With no waveform:** until the track's waveform is ready, or when it failed, the bar shows the
    slider exactly as before. A small state word sits in the region's title, never in its space, so the
    bar never shows an empty box.
  - **Requests:** a track that starts playing is requested (WAVE-03), so it jumps the queue.
- **The Inspector.**
  - **Placement:** under the header and artwork row, the Inspector's full width, two rows tall.
  - **Contents:** cues, loops and grid are drawn. When the shown track is the one playing, the playhead
    is drawn and a click seeks. Otherwise the waveform is a picture, and its title says so. Clicking it
    does not start playback, which is DEC-012's gesture and a different one.
  - **States, in words:** "Waiting for analysis", "Analysis paused", "This file could not be read
    (undecodable)", "File missing", "Not checked yet" and the decoder sentence.
  - **Requests:** a track shown in the Inspector is requested.
- **The Library column.**
  - **Declaration:** "Waveform", `hiddenByDefault: true`, not sortable, minimum 48 and default 120 CSS
    pixels. Its text for copy and export is empty.
  - **Width requested:** each visible row asks `useWaveforms` at the cell's device-pixel width, rounded
    up to a multiple of 16 so resizing does not request every width.
  - **While scrolling:** rows that scroll past without settling for 100 ms are not requested.
  - **States:** a cell without a waveform shows its state as one muted word.
  - **Not requested:** the column never requests a track, because a table showing 40 rows is not a
    user looking at 40 tracks.
- **Row counts.** The bar's height is unchanged, and the column is hidden by default. The Library's and
  Prepare's row checks re-run, and their held values stand.

**Tests**:
- **Components:**
  - the bar's range input keeps its role, label, value text and keyboard steps over the waveform;
  - a pointer drag previews and seeks once;
  - the fallback slider shows for each non-ready state;
  - a track change requests it;
  - the Inspector's states in words;
  - the Inspector seeks only for the playing track;
  - the column's width rounding;
  - the column's settle delay;
  - the column never requests.
- **End to end:**
  - playing `bands.flac` paints its waveform in the bar;
  - a click at the second section's start seeks to within one column of 2.0 s;
  - the bar's height is unchanged;
  - the Inspector shows a fixture's hot cue marker at its time;
  - with the column shown, scrolling 5,000 rows records no long task over 50 ms caused by painting,
    measured with a `PerformanceObserver`;
  - Prepare's and the Library's row counts are unchanged.

**Acceptance criteria / DoD**:
- The three surfaces work in the development build and a packaged Linux build, with `mpv` named by
  `CUEPOINT_MPV_PATH`.
- All suites clean.

**Risks**: Medium.
- **The bar is the most-used control in the app,** and PLAYER-06's seek logic has hard-won tests. This
  step changes its picture only, and those tests must pass unchanged.

**Complexity**: **M**

**Outcome**: Implemented (2026-10-05). The playing track's waveform is the bar's seek control, the
Inspector draws the selected track with its marks and seeks the playing one, and the Library offers a
"Waveform" column. PLAYER-06's tests pass unchanged, the bar is no taller, and scrolling 5,000 rows
with the column shown records no long task. Only Prepare's strip is left, which is WAVE-07's.

**What was built.**

- **The bar** (`PlayerBar.tsx`): the slider sits in a holder that takes the row's height, which the
  transport's hit targets already set. Once the playing track's waveform is ready and the player
  knows the duration, the holder draws it under the slider:
  - laid across the player's duration, the played part dimmed, the playhead at main's position or a
    drag's preview;
  - the range input over it, transparent, the picture's size, with a thumb of no width, so its whole
    width is its travel and a click at a column means that column's time;
  - its focus ring drawn around the picture (`:has(:focus-visible)`).

  Without a picture the slider is laid out exactly as before, and the region's `title` says why.
- **The Inspector** (`screens/library/TrackWaveform.tsx`): under the header, the panel's full width,
  two table rows tall, with cues, loops and grid. For the playing track it draws the playhead, lays
  the picture across the player's duration, and a click seeks once; for any other track its title
  says it is a picture, and a click does nothing. Each state in words; keyed by track, so a new
  selection never shows the last one's picture.
- **The column** (`libraryColumns.tsx`, `RowWaveform` in `libraryCells.tsx`): "Waveform", hidden by
  default, unsortable, 48 and 120 CSS pixels, empty text. One muted word without a picture, the
  sentence in its title.
- **Shared pieces** in `components/waveform/`:
  - `waveformEnvironment.ts`: one `ResizeObserver` for every box, one media query for the pixel
    ratio and one `MutationObserver` for the theme, each made with its first user and dropped with
    its last, since the column may show forty canvases; and `useWaveformBox`, a box's request width;
  - `waveformSettle.ts`: rows settle for 100 ms before they ask;
  - `useWaveformRequest.ts`: the bar's and the Inspector's request;
  - `requestWidth` rounds up to a multiple of 16; `secondsAtOffset` is the inverse of `columnAt`;
  - `analysisWords.ts` gains a state in one word and an answer's sentence;
  - `useWaveforms` gains `ask`: false reads what the cache holds without asking.
- **`useScaleFactor`** (`ScaleContext.tsx`): the scale, and the default outside a provider, so the
  bar and the Inspector draw wherever they are rendered.
- **The user guide's** player and Library pages, and the changelog.

**Tests.**

| File | Tests | Covers |
| --- | --- | --- |
| `PlayerBar.waveform.test.tsx` | 19 | The input's role, label, value text, bounds and step over the picture; a drag previews and seeks once; keyboard seeking; the request width; laid across the player's duration (590 s of picture under a 600 s player); the playhead following a drag; the slider and the title for each of six states, a failed read and a read in flight; no duration; a file outside the library; a waiting track requested, each new one, once while it plays; no request for any other state |
| `TrackWaveform.test.tsx` | 18 | The picture with its hot cue at its column; a picture only for another track, no seek and no playback on a click; the playing track's playhead and a click's time; laid across the player's duration; no seek without a duration; loading, six states and a failed read in words; a request while waiting and none when ready; its place under the header; absent without the bridge; a new selection never showing the last picture |
| `RowWaveform.test.tsx` | 16 | The declaration; one batch for every row at 64 for 120 CSS pixels; one request per 16 columns while the column widens; nothing for a row gone within 100 ms, nor for rows scrolled past; a held picture drawn at once; never a request; six words with their titles; nothing while settling or loading |
| `waveformSettle.test.ts`, `useWaveformRequest.test.ts`, `waveformEnvironment.test.tsx` | 8, 7, 5 | One timer and one task per group, cancelling, each callback once; a request only while waiting, once per showing, again for a track shown again, quiet on failure; one observer for every box, the request width, outside the provider, one media query and one theme observer for every reader |
| `waveformLayout.test.ts`, `analysisWords.test.ts`, `waveformCache.test.ts`, `WaveformSettingsPanel.test.tsx` | +5, +12, +2, +2 | Rounding to 16 at every scale and ratio; a click's time lands in its column; one word and the sentences; the cache's first read; the preview asking at its width and nothing before |
| `waveformPlaces.spec.ts` (Electron end to end) | 2 | Every shipped format lasts what the player says, within one of the bar's columns; `bands.flac` painted in the bar in its three bands; the bar's height unchanged from the plain slider; a click at 2/6 of the picture seeks to within one column of 2.0 s; the Inspector's hot cue within one column of 2.0 s, and a click there seeking the playing track; 5,000 rows scrolled with the column shown, 29 canvases painted, no long task over 50 ms, the observer proven by a task made long on purpose |

**Where the specification was wrong, and what was done instead.** Each was settled the most durable
way.

1. **A track is requested only while it waits.** The specification requests every track that starts
   playing or is shown in the Inspector. A request with no run going starts one (WAVE-03), so every
   selection of an analysed track would start a job, flash the status strip and record nothing. The
   bar and the Inspector request once their answer says the track waits, paused or not, once per
   showing.
2. **The request width is the drawing's columns, not its device pixels,** rounded up to a multiple of
   16 and kept within 16–1,200. The layout draws one column per scale pixel (WAVE-05), so a
   device-pixel width asked for two to six times what is drawn. The rounding applies to every
   surface, Settings' preview included, so dragging a column, the Inspector or the window wider asks
   again every 16 columns, and every row of the column asks at one width, in one batch.
3. **Rows settle one by one, and together.** A row asks once it has been on screen for 100 ms; rows
   mounted in one task share one timer and ask in one task, so the cache sends them as one batch. A
   picture the cache already holds is drawn at once, so scrolling back never blanks a row.
4. **The duration check allows one envelope sample.** The tone fixtures last 0.26 s, where one of the
   bar's columns is 3 ms and the waveform's own sample 6.7 ms; MP3 differs by one sample. The check
   is one column or one sample, whichever is larger; for `bands.flac`, and any real track, that is
   one column.
5. **WAVE-05's cache waited for ever after a fast analysis.** It noted the analysis's count on its
   first read and refreshed waiting tracks only when the count moved. A track requested as it is
   shown is analysed in about a second, before that read, so its count never moved and it stayed
   "Waiting". The first read after following starts now refreshes too; a regression test holds it.
6. **The bar draws the waveform and the playhead, not the marks.** The specification lists the
   Inspector's marks and not the bar's; at the bar's size a hot cue's flag would cover the picture,
   and the Inspector is a click away.
7. **The Inspector's seek is a pointer target only.** The bar's input is the keyboard's and the
   screen reader's seek control; a second "Seek" slider in the Inspector would read as a duplicate.
8. **Settings' preview is two table rows tall,** as its comment and this step's Inspector say; it was
   two hit targets.

**Row counts.** `prepare.spec.ts` was measured on this step's build and on the commit before it, on
Windows, every assertion turned into a reading. Every count is the same:

| State | Before | After | Held |
| --- | --- | --- | --- |
| Sidebar expanded / rail | 6 / 7 | 6 / 7 | 7 |
| With the player's bar, expanded / rail | 3 / 4 | 3 / 4 | 4 |
| With the lanes, expanded / rail | 3 / 4 | 3 / 4 | 4 |
| The source panel's Suggestions | 3 | 3 | 3 |

The expanded sidebar's counts sit one below the held values on Windows, as the lanes' did at WAVE-05:
the held values are Linux's figures less one, and Windows measures one lower again. That is PREP-10's
owed Windows run, not this step. The Library's specs pass unchanged.

**Acceptance.** All three surfaces work in the Windows development build, proven end to end. The
packaged Linux run with `CUEPOINT_MPV_PATH` is owed with the phase's other packaged runs:
`waveformPlaces.spec.ts` takes `CUEPOINT_E2E_EXECUTABLE` for it, as `prepare.spec.ts` does.

---

## WAVE-07 — The Transition Strip, and the Phase Comes Together

**Objective**: Draw Prepare's transition strip. Document, measure and prove the phase end to end.

**User-visible result**: Prepare's "View ▾" offers "Transition". It shows the selected entry's waveform
beside the next entry's, with their planned times. The user guide has a Waveforms page.

**Dependencies**: WAVE-06.

**Existing code reused**:
- The lanes' place, toggle and remembered state (PREP-11).
- DEC-107's planned times.
- WAVE-05's canvas.
- PREP-12's journey, bench and acceptance pattern.

**Design**:

- **The strip** (DEC-120):
  - **Placement:** it sits under the Set's header, where the lanes do.
  - **Contents:** two halves, the selected entry and the entry after it, one row of titles above them.
  - **Each half:**
    - that entry's whole waveform;
    - the planned in and out times (DEC-107) as shaded regions before the in and after the out, with
      their times as text;
    - the entry's cues.
  - **The words between them:** "Out 5:42 → In 0:16", or "untimed" for an entry without planned times.
  - **Edge cases:**
    - no entry selected: the strip says "Select an entry to see its transition";
    - the last entry selected: the second half reads "End of Set".
  - **Clicking a half** selects that entry.
  - **Requests:** both entries are requested.
- **Opened from "View ▾",** beside the lanes, and remembered the same way. It is closed the first time
  the page opens, so PREP-10's page-open row counts hold (fact 7). With it open, the Set's whole rows
  are measured and held by `prepare.spec.ts`, as the lanes' are. The strip is one row of titles plus a
  waveform two rows tall.
- **Docs.**
  - **New:** `docs/user-guide/waveforms.md`. It says what the colours mean, how long a first analysis
    takes, how to pause, where the data lives, and that cues are Rekordbox's, shown and never changed.
  - **Updated:** the player, Inspector, Library, Prepare, glossary, features, performance and the-window
    pages.
  - **Records:** ADR-009 gets its outcome; `CHANGELOG.md` under Unreleased; `AGENTS.md`'s table gains a
    Waveforms row; the roadmap.
- **Measurements:** `scripts/bench_waveforms.py` is run at 50,000 and, in a test, at 5,000 on every full
  suite. It measures:
  - the store's size;
  - a 200-id batch at width 120;
  - one waveform at 1,200;
  - the work-list query;
  - the marks read.

  Each against WAVE-02's and WAVE-04's budgets, run twice.
- **The journey**, end to end in the real app, three times in a row in a packaged Linux build with
  `CUEPOINT_MPV_PATH` set:
  1. import a fixture library with real audio and cues;
  2. the analysis runs to completion and the strip's count reaches the total;
  3. the Library column shows each waveform;
  4. the Inspector shows a hot cue at its time;
  5. play a track, and seek by clicking the waveform;
  6. pause the analysis, relaunch, and find it still paused; resume it;
  7. change a file on disk and refresh; the check is followed by a re-analysis of that file only;
  8. open a Set in Prepare with the strip, and read the transition's times;
  9. delete waveform data, and watch the library analyse again.

  The engine half runs as a Python integration test on every build.
- **Backup:** a restored launch backup brings marks back, and the waveforms are still found by path.

**Tests**: The strip's component tests: halves, words, the last entry, no selection, clicking and the
toggle's memory. The journey. The row checks with the strip open. The bench at 5,000.

**Acceptance criteria / DoD**: The phase-level acceptance below, checked point by point and recorded
under this step.

**Risks**: Low.

**Complexity**: **M**

**Outcome**: Not implemented yet.

---

## Phase-level acceptance

1. Every track whose file is present gets a waveform without anyone asking. It is computed by CuePoint
   from the audio through the bundled decoder, and no Rekordbox analysis file is read.
2. A new import is followed, without a click, by the file check and then the analysis. The status
   strip counts it down, and it can be paused and resumed from the strip, Settings and the Health view.
3. A paused analysis stays paused across a relaunch. An unpaused one resumes on its own, and continues
   where it stopped rather than from the start.
4. While the analysis runs, playback has no underrun, and the Library stays within its responsiveness
   budget.
5. An import, a refresh or a file check never waits for the analysis. The analysis steps aside and
   returns after the check.
6. A changed file is analysed again. A failed file is not retried until it changes. A missing file is
   never recorded as a failure.
7. The player bar shows the playing track's waveform, at its old height. A click or drag seeks, and
   keyboard and screen-reader seeking are unchanged.
8. The Inspector shows the selected track's waveform with its hot cues, memory cues, loops and beat
   grid, and lists the cues in words.
9. The Library's "Waveform" column, hidden by default, draws while 5,000 rows scroll without a long
   task over 50 ms.
10. Prepare's transition strip shows the selected entry beside the next, with their planned times. As
    the page opens, it keeps PREP-10's rows.
11. "Three bands" and "One colour" both draw correctly in all five themes and a custom theme, and the
    choice is remembered.
12. Cues and beat grids are imported on import and refresh, and for older libraries from their recorded
    source. The export's output is byte-identical to before.
13. Waveform data is outside the launch backup, the support bundle and "Clear cache", and is kept
    across a restored backup. "Delete waveform data" empties it and says what that costs.
14. A build without a decoder says once, in words, that waveforms need it, and nothing errors.
15. The measurements are inside budget at 50,000 tracks, twice. The journey passes three times in a
    row in a packaged build. The packaged Windows and macOS runs are recorded, or recorded as owed.

## Deferred, with reasons

- **A zoomed, scrolling detail view** (DEC-115). It needs a second, much denser resolution, scrolling
  kept in time with `mpv`'s position, and zoom controls. The overview answers the planning questions
  this app is for.
- **Editing cues or beat grids, and writing them to Rekordbox** (DEC-118, DEC-077). They are
  Rekordbox's data. Writing them back means generating the XML's most valuable part, which DEC-077
  exists to never do.
- **Reading Rekordbox's analysis files** (DEC-113). The format is undocumented, and the files exist only
  for tracks Rekordbox has analysed, at a path CuePoint does not own.
- **Loudness, BPM and key from audio** (DEC-121). These are Phase 12's. Its job can extend
  `waveform_analysis`'s decoder rather than start another.
- **Pausing analysis while music plays** (DEC-050). The engine is not told about playback, and OS
  priority is the mechanism instead.
- **A decoder for Linux.** PLAYER-01 pins none. Linux users name their own `mpv`, and get waveforms
  when they do.
- **A waveform in every Prepare row** (DEC-120). The strip was chosen. Rows can gain one later without
  changing any data.
- **Waveforms for Beatport tracks.** DEC-097 decided Discover plays no previews, and there is no file to
  analyse.
