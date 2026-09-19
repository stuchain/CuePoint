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
| Open the rating list | 7 ms |
| Open the genre, key or label list | 35–43 ms |
| Open the artist list (900 artists) | 12 ms |
| Re-open a list while other filters are on | 35 ms |
| Read the BPM range | 23 ms |

The lists of choices — every genre in your library and how many tracks each has
— are the expensive part, because answering means visiting every track. Seven
database indexes make that ten times faster: opening the genre list went from
117 ms to 11 ms, the label list from 119 ms to 12 ms, and the rating list from
65 ms to 7 ms.

They cost 4.9 MB of database file and about 5% of an import time
(10.40 s → 10.92 s). Artist, album and remixer are deliberately left out of
them: those lists are long tails rather than a handful of choices, an index
each would be far larger, and they still answer inside the same budget.

The genre, key and label lists count the value you see, which is your own
correction where you have made one. That means reading two tables rather than
one, measured with 10,000 corrected tracks in the library: 35–43 ms rather than
11–13 ms. The tracks you have not corrected are still counted through the
indexes above, and only the corrections are counted separately. Counting both
together in one pass took 59–68 ms. Filtering and sorting by those five fields
cost the same kind of difference: a first page sorted by BPM takes 25 ms rather
than 14.

With CuePoint's Clean facts in the table — 30,000 tracks matched and 10,000
corrected — a window of 100 rows takes 3.5 ms, of which reading where each
correction came from is about half a millisecond. Sorting the first page by
match state or file status takes 36–39 ms. Sorting it by match score took
155 ms, because each score was read from the stored Beatport candidates one
track at a time; since CLEAN-14 the score is kept beside the match, and it takes
35 ms like the others — see [Clean](#clean).

Re-opening a list while other filters are on is the slowest of these, and
deliberately so: with a filter in play CuePoint reads the library directly
instead of through those indexes, which is five times faster than the
alternative (35 ms rather than 178 ms).

## Clean

Measured with `python scripts/bench_clean.py` on the same machine, on a
50,000-track library carrying everything Clean adds: **30,000 matched tracks
with 40 Beatport candidates each (1.2 million candidates), 8,000 of your
decisions, 10,000 of your own values, 2,000 missing files, 1,500 possible
duplicate groups, and artwork state for every track.** Forty candidates is
what a live match stored per track when CLEAN-02 measured it.

| What you did | Time |
| --- | --- |
| Open the review queue (12,000 tracks need review) | 15 ms |
| Scroll to the end of it | 33 ms |
| Sort it by score | 43 ms |
| Open Health, every count | 313 ms |
| One Health count, followed into the Library | 10–30 ms (no artwork: 155 ms) |
| Sort the Library by BPM, key, match, score or file status | 35–47 ms |
| Scroll to the end of the Library sorted by BPM | 131 ms |
| Check every file (48,000 present, 2,000 missing) | 8.6 s |
| Look for duplicates | 2.3 s |
| Apply Beatport's values to 5,000 tracks | 3.2 s |
| Revert that (25,000 changes) | 3.4 s |

The library file is **299 MB** at this size, almost all of it the kept
candidates: about 250 bytes each. A library that has not been matched is about
20 MB. Compacting it gains little (293 MB), because nothing is ever deleted
from it in normal use.

**Scrolling deep into a sorted library became five times faster** while this
was measured. A window far down a library sorted by anything but artist took
0.6–0.75 s, because the database sorted whole rows — twenty columns and a
path each — to find a hundred of them. It now sorts only the tracks' ids and
what they are sorted by, then reads the hundred rows: 131 ms for BPM, 55 ms
for title. Sorting by artist still uses its index and takes 3 ms.

**No artwork is the slowest count** because it asks, for all 45,000 tracks
without a picture of their own, whether an accepted Beatport match would give
them one. Health is read once when you open it.

The file check and the duplicate scan run in the background after every
import and refresh, with a progress bar and **Stop**; the apply and its revert
run in the background too.

## Your own Collections, tags and ratings

Everything CuePoint adds on top of Rekordbox — Collections, Smart Collections,
tags, ratings, favorites and notes — is measured on the same library, with the
organization a heavy user would build on top of it: **200 Collections in a tree
of 8 folders, 40 tags across 199,940 tag assignments, and one Collection holding
5,000 tracks.** Same machine, same script.

| What you did | Time |
| --- | --- |
| Open a 5,000-track Collection | 9 ms |
| Filter by "is in this Collection" | 4 ms |
| Filter by a tag | 13 ms |
| Filter by two tags | 11 ms |
| Open the tag list to choose from | 60 ms |
| Draw the Collections tree | 1 ms |
| Open the tag manager | 15 ms |
| Drag a track to a new place in a 5,000-track Collection | 9 ms |

Building all of that in the first place — 200 Collections, 40 tags and 199,940
assignments — takes 13 seconds, which is the only number here you would ever
wait for, and it stands in for months of a real person's filing.

**The tag list is the slow one, and it is slow for the same reason the genre
list is**: answering "how many tracks carry each tag" means visiting every
assignment, and there are two hundred thousand of them. It is the one number
here you might notice, and it only happens when you open the list.

**Opening a Collection was sixty times slower before this was measured.** On the
same library, a 2,000-track Collection took 183 ms to show its first page and
now takes 3: the database had been re-reading the whole Collection once for
every track in it while working out the order, and it reads it once now. The
cost grew with the square of the Collection's size, so the 5,000-track case in
the table above was worse again.

This is what a measurement is for. Nothing about the feature looked wrong, and a
25-track Collection — which is what every test used — was instant either way.

### Changing a lot of tracks at once

| What you did | Time |
| --- | --- |
| Favorite every track in a 50,000-track library | 11.4 s |
| Check a refresh that deletes tracks 72 Collections are using | 11.1 s |
| Apply that refresh | 14.0 s |

A change over everything a search matches runs in the background with a progress
bar and a Cancel button, so the 11 seconds above are 11 seconds you can keep
working through. CuePoint never sends fifty thousand track numbers anywhere: it
sends the question, and the answer is worked out once, in the database.

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
