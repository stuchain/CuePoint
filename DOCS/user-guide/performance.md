# Performance and Scalability

Guide to performance tuning and expected behavior for large libraries.

## Overview

CuePoint is designed to handle large Rekordbox libraries (10k+ tracks) while maintaining responsive UI and predictable performance. Use this guide to understand expected throughput, memory usage, and tuning options.

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
