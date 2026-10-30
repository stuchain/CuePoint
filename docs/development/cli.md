# The command-line tool

`python main.py` (or the packaged executable) matches one Rekordbox playlist, or several, against
Beatport and writes the results as CSV or Excel. The desktop app does not use this file-based flow:
it imports the collection once and matches library tracks from
[Clean](../user-guide/clean.md) (DEC-071), through the same `process_track`
(`services/match_service.py`, DEC-065).

```bash
python main.py --xml collection.xml --playlist "My Playlist"
python main.py --xml collection.xml --playlist "My Playlist" --fast --output-dir out/
python main.py migrate --from 1 --to 2 --directory out/      # CSV schema migration
```

## Arguments

| Group | Flags |
| --- | --- |
| Input | `--xml PATH`, `--playlist NAME`, `--provider beatport` (the default) |
| Output | `--out BASE`, `--output-dir DIR`, `--run-summary-json PATH`, `--review-only` (only low-confidence tracks) |
| Presets | `--fast`, `--turbo`, `--exhaustive`, `--myargs`: each sets several of the options below |
| Performance | `--max-workers N`, `--max-queries-per-track N`, `--benchmark` (stage timings to the output folder) |
| Reliability | `--resume`, `--no-resume`, `--checkpoint-every N`, `--max-retries N`, `--incremental CSV` |
| Determinism | `--seed N` |
| Logging | `--verbose`, `--trace`, `--debug` |
| Config | `--config FILE.yaml` |
| Integrity | `--verify-outputs` (with `--output-dir`), `--no-checksums`, `--no-audit-log` |
| Preflight | `--no-preflight`, `--preflight-only` (alias `--dry-run`), `--preflight-report PATH` |
| Exit at once | `--show-privacy`, `--show-terms`, `--telemetry-enable`, `--telemetry-disable`, `--export-support-bundle`, `--maintenance-report` |

**Order of settings:** the defaults, then a preset, then `--config`, then single flags. The
desktop app's **Settings** page has no presets; its values are read and written through
`engine/config_api.py`.

## What a run does

1. **Preflight** (off by default; on with `product.preflight_enabled`, always with
   `--preflight-only`): the XML exists, is readable and has the playlist with tracks; the settings
   are valid; the network answers (`product.preflight_network_check`). Errors stop the run with exit
   code 1, warnings are logged. `data/rekordbox.py:inspect_rekordbox_xml`, `models/preflight.py`,
   `ProcessorService.run_preflight`.
2. **Processing** (`services/processor_service.py`): parse the XML, then for each track, on a thread
   pool, generate queries, search Beatport, score the candidates and keep a `TrackResult`. Progress
   is throttled to one update every 200 ms; guardrails cancel a run past its time or memory limit
   (`P001`, `P002`).
3. **Checkpoint and resume** (`services/checkpoint_service.py`): progress is saved every N tracks,
   keyed by a hash of the XML, and `--resume` continues from the next track. `--incremental CSV` is
   different: it skips tracks already in that CSV (playlist index, title, artist), with no
   checkpoint file.
4. **Output** (`services/output_writer.py`): the main CSV (one row per track), optional candidates
   and queries CSVs, and Excel through `openpyxl`. Files carry `# schema_version=` and `# run_id=`
   comment lines.

## Integrity of the output

`services/integrity_service.py` gives each run a run id (`utils/run_context.py`), writes a SHA-256
`.sha256` beside each main file, appends an audit log (compressed past a size), keeps up to three
backups of a file it overwrites, refuses output paths with `..`, and escapes cells that start with
`=`, `+`, `-` or `@` so a spreadsheet does not run them. `--verify-outputs` checks the columns and
checksums of a folder written earlier. `migrate` (`services/schema_migration.py`) rewrites old CSVs
to a newer schema; see [the migration guide](../schema/migration-guide.md).

## Code

| Piece | File |
| --- | --- |
| Entry point, arguments, presets | `src/main.py` |
| The run | `src/cuepoint/cli/cli_processor.py` |
| Services wired together | `src/cuepoint/services/bootstrap.py` |
| Config | `services/config_service.py`, `models/config.py`, `models/config_models.py` |
| Retries and the circuit breaker | `services/reliability_retry.py`, `services/circuit_breaker.py` |
| Stage timings for `--benchmark` | `utils/run_performance_collector.py` |

How a track is matched (queries, search, scoring, guards) is in
[Architecture](architecture.md#how-a-track-is-matched) and
[Match rules and scoring](match-rules-and-scoring.md).
