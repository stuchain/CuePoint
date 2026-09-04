# Performance and Scalability

Guide to performance tuning and expected behavior for large libraries.

## Overview

CuePoint is designed to handle large Rekordbox libraries (10k+ tracks) while maintaining responsive UI and predictable performance. Use this guide to understand expected throughput, memory usage, and tuning options.

## The library

Measured, not estimated. The numbers below come from
`python scripts/bench_library.py`, which generates a collection, imports it,
refreshes it and prints this table. Run it yourself if you want the numbers for
your machine — these are from a Windows 11 desktop, Python 3.12, on an SSD.

**50,000 tracks, 250 playlists, 175,000 playlist entries** (a 20 MB export):

| Operation | Time | Peak memory |
| --- | --- | --- |
| Import | 10.9 s | 52 MB |
| Re-import the same file | 13.9 s | 112 MB |
| **Check for changes, nothing changed** | **under 10 ms** | negligible |
| Check for changes, something changed | 12.1 s | 69 MB |
| Apply a refresh | 14.0 s | 112 MB |

The resulting library file is about 20 MB.

**Checking an unchanged collection is instant on purpose.** Reading a
50,000-track export to conclude that nothing happened takes 11 seconds — as long
as importing it — and re-checking an untouched file is the common case. CuePoint
compares the export's modified time and size against what it recorded at import
and answers from that, so the Library page can tell you where you stand without
a wait. It only ever answers "nothing changed" this way; anything that might
have changed is read in full.

Memory is the peak Python allocation for a single pass, roughly 1 KB per track
for an import. Both the parse and the comparison stream the file rather than
loading it, so a bigger collection costs proportionally more, not
catastrophically more.

## Browsing the library

The queries behind the Library table run on every scroll, sort and playlist
selection, so these are milliseconds rather than seconds. Same machine, same
50,000-track library, same script.

| What you did | Time |
| --- | --- |
| Open the library | 1.4 ms |
| Scroll to the very end | 5.1 ms |
| Sort by any other column | 16–19 ms |
| Type a search term | 19 ms (24 ms for the count) |
| Select a playlist | 1.9 ms |
| Select a folder of playlists | 48 ms |

Sorting the library by artist is faster than sorting it by anything else
because one database index covers exactly that order. That index is also what
keeps scrolling to the end of a 50,000-track library instant: without it the
same request takes **717 ms** instead of 5 ms, because the database has to sort
the whole library to find the last hundred rows.

It costs about 1.8 MB of database file and roughly 1% of import time
(10.29 s → 10.40 s measured), which is why it exists and why six other indexes
that were tried alongside it do not: they changed no measured time and cost ten
times as much.

A folder is the slowest selection because it gathers every playlist beneath it
and counts each track once, however many of those playlists it appears in.

## Filtering the library

Filters and the lists of choices behind them, on the same 50,000-track library:

| What you did | Time |
| --- | --- |
| Apply a filter | 13 ms |
| Add two more rules to it | 12 ms |
| Open the genre, label or rating list | 7–12 ms |
| Open the artist list (900 artists) | 12 ms |
| Re-open a list while other filters are on | 35 ms |
| Read the BPM range | 16 ms |

The lists of choices — every genre in your library and how many tracks each has
— are the expensive part, because answering means visiting every track. Seven
database indexes make that ten times faster: opening the genre list went from
117 ms to 11 ms, the label list from 119 ms to 12 ms, and the rating list from
65 ms to 7 ms.

They cost 4.9 MB of database file and about 5% of an import time
(10.40 s → 10.92 s). Artist, album and remixer are deliberately left out of
them: those lists are long tails rather than a handful of choices, an index
each would be far larger, and they still answer inside the same budget.

Re-opening a list while other filters are on is the slowest of these, and
deliberately so: with a filter in play CuePoint reads the library directly
instead of through those indexes, which is five times faster than the
alternative (35 ms rather than 178 ms).

## Memory while browsing

The numbers above are the engine's. This one is the window's, measured in the
packaged app with `CUEPOINT_E2E_MEMORY=1 npx playwright test e2e/libraryBrowse.spec.ts
-g memory` from `apps/desktop-electron/`, which imports a 50,000-track
collection and scrolls the length of it twice.

| | Renderer working set |
| --- | --- |
| Library open, before scrolling | 105 MB |
| After scrolling through all 50,000 tracks | 159 MB |
| After a second pass over the same tracks | 160 MB |

**The second pass is the number that matters.** Browsing the whole library
costs about 54 MB the first time — buffers, fonts and compositing the window
warms up on any long scroll — and about 1 MB every time after that. Nothing
accumulates, because nothing is kept: 29 row elements were in the page at the
end of a 50,000-row scroll, and the rows behind them are fetched a window at a
time and dropped when they are far enough behind.

## Performance Budgets

| Metric | Target | Notes |
| --- | --- | --- |
| Startup to ready | < 2s | Modern machine |
| XML parse (10k tracks) | < 5s | Single-threaded |
| Query generation (10k) | < 3s | Per-track |
| Candidate search (10k) | < 20m | Network-bound |
| Export (10k tracks) | < 60s | Batched writes |
| UI updates | < 200ms | Throttled to avoid stutter |

## Benchmark Targets

| Dataset | Target | Use Case |
| --- | --- | --- |
| 1k tracks | < 5 min | Baseline |
| 5k tracks | < 15 min | Typical |
| 10k tracks | < 30 min | Stress |

Run benchmarks with:

```bash
python scripts/bench.py --dataset 1k
python scripts/bench.py --dataset all --save scripts/benchmarks/results.json
python scripts/bench.py --dataset 1k --profile          # cProfile, top 20 slowest
python scripts/bench.py --dataset 1k --compare-baseline # Fail if regression > 20%
python scripts/bench.py --dataset 1k --update-baseline # Create/update baseline.json
```

### CLI Performance Flags (Design 6.63)

| Flag | Description |
| --- | --- |
| `--max-workers N` | Override max parallel track workers |
| `--max-queries-per-track N` | Override query limit per track |
| `--benchmark` | Collect and save performance metrics to `performance_report.json` in output dir |

Example:

```bash
cuepoint --xml collection.xml --playlist "My Playlist" --benchmark --max-workers 4
```

## Configuration

### Performance Settings

| Setting | Default | Description |
| --- | --- | --- |
| `performance.max_workers` | 8 | Max parallel track workers |
| `performance.max_queries_per_track` | 6 | Query limit per track |
| `performance.cache_max_mb` | 500 | HTTP cache size limit |
| `performance.runtime_max_minutes` | 120 | Abort after 2 hours |
| `performance.progress_throttle_ms` | 200 | UI update interval |
| `performance.eta_update_every_tracks` | 50 | ETA update frequency |

### Legacy Settings (still supported)

| Setting | Default | Description |
| --- | --- | --- |
| `TRACK_WORKERS` | 12 | Parallel workers (capped by max_workers) |
| `CANDIDATE_WORKERS` | 15 | Candidate fetch threads |
| `PER_TRACK_TIME_BUDGET_SEC` | 45 | Per-track timeout |
| `MAX_QUERIES_PER_TRACK` | 40 | Query cap |

## Adaptive Concurrency

Worker count is capped by `performance.max_workers` to avoid overloading low-end systems. Default is 8 workers. For high-end machines, increase `TRACK_WORKERS` in config; it will be capped by `max_workers`.

## Performance Guardrails

- **Runtime limit**: Run aborts after `runtime_max_minutes` (default 120 min). Error code: P001.
- **Memory limit**: Run aborts if process memory exceeds 2GB. Error code: P002.
- **Per-track timeout**: Each track stops after `PER_TRACK_TIME_BUDGET_SEC` (default 45s).

## ETA and Progress

- **ETA**: Estimated time remaining based on average time per track. Updates every 50 tracks.
- **Throttling**: Progress UI updates every 200ms to avoid stutter.
- **Display**: "Estimating..." during warmup. ETA shown in status bar after first tracks complete.

## Cache Metrics

- **Cache hit rate**: Target > 60% for repeated runs.
- **Cache size**: Default 500MB. Configurable via `performance.cache_max_mb`.
- **Eviction**: LRU eviction when size limit reached.

## Incremental Processing

Process only new tracks by reusing a previous run's output:

```bash
python main.py --xml collection.xml --playlist "My Playlist" --incremental /path/to/previous_main.csv
```

- Skips tracks already in the previous CSV (matched by playlist index, title, artist).
- Appends new results to the existing file.
- Useful when you add tracks to a playlist and want to avoid re-processing everything.

## Profiling

Run benchmarks with cProfile to capture hot paths (Design 6.19):

```bash
python scripts/bench.py --dataset 1k --profile
```

This saves the top 20 slowest functions to `scripts/benchmarks/profile_1k.txt`.

## Tuning Tips

1. **Reduce concurrency** if memory is high: lower `TRACK_WORKERS` or `max_workers`.
2. **Increase cache** for repeated runs: raise `cache_max_mb`.
3. **Reduce queries** for speed: lower `MAX_QUERIES_PER_TRACK` (may reduce match quality).
4. **Large library warning**: If estimated time > 60 min, consider running in smaller batches.

## Error Codes

| Code | Meaning | Action |
| --- | --- | --- |
| P001 | Runtime budget exceeded | Run stopped after 2 hours. Split into smaller batches. |
| P002 | Memory budget exceeded | Lower concurrency or process fewer tracks. |
