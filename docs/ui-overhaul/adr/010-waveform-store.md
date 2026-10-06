# ADR-010: Waveforms live in their own store, keyed by file, rebuilt rather than migrated

## Status

Accepted (WAVE-02, 2026-09-30). Records DEC-122 as implemented, with the measurements its layout
was chosen on. Linux x86_64, SQLite 3.45.1. Amended by WAVE-03 (the work list's index), WAVE-05
("Delete waveform data") and WAVE-08 (loudness, in a table beside the waveforms).

## Context

WAVE-01 turns a file into an envelope. Every later step needs somewhere to keep what that costs
hours to compute across a library, and a way to answer "is there a waveform for this track, and if
not, why" for hundreds of tracks at a time without touching a file (DEC-116, DEC-122).

Four facts shaped where and how:
- **Every launch backup copies `cuepoint.db` whole** (DEC-009). Waveforms there would multiply every
  backup by the size of data a re-analysis rebuilds.
- **The cache folder is emptied** by "Clear cache" and "clear cache on exit" (DEC-076's amendment).
  With the second set, a library's waveforms would be analysed again after every launch.
- **Track ids are not stable across a restore or a fresh import;** file paths are.
- **The Library asks for a window of rows at a time,** and each row's picture is a few kilobytes that
  must be cut down to the column's width.

## Decision

**`waveforms.db`: its own SQLite file beside the library database, keyed by the file's path, and
treated as a cache.** The code is `persistence/waveform_store.py` (the store),
`core/waveform.py` (the shape and its bytes) and `services/waveform_service.py` (one file's
analysis, and states).

- **Where:** beside `cuepoint.db`, whichever path that is, so under `CUEPOINT_HOME` by default. It
  is not in the launch backup, the support bundle or "Clear cache", and tests hold all three.
- **Key:** the path exactly as the library holds it and the file check records it
  (`FileStatusRepository.current_files`, one shared read). Two spellings are two rows.
- **When a row counts:** its path and analysis version match. The analysis also compares size and
  modified time with a fresh `stat`; a display never calls `stat`.
- **A cache, not a record:**
  - `meta.schema_version` names the schema. Another version, a file SQLite cannot read, or a foreign
    database is renamed aside, with its WAL sidecars, and a new store is created. One set-aside copy
    is kept.
  - Corruption found while in use cannot be set aside under other threads' connections: Windows
    refuses to rename an open file. That call fails, a marker is written beside the store, and the
    next launch sets it aside first.
  - A lock is not corruption, and never costs the store.
- **The row:** size, modified time (nanoseconds), analysis version, `ready` or `failed` with its
  reason, the duration, when, and the picture, last.
- **The picture** (`core/waveform.py`): 1,200 columns of four bytes (full, low, mid, high), each the
  maximum of its span, companded as `round(255 × √v)`. A 12-byte header (`CPWF`, format version, band
  count, columns, duration), then the body compressed with `zlib`. The body holds each band's columns
  in turn. Anything that does not add up is refused whole; the row is deleted and analysed again.

### Measured

| Choice | Measured | Chosen |
| --- | --- | --- |
| Table layout, 50,000 rows of about 3.5 KB | `WITHOUT ROWID`: 234 MB, 200 rows in 3.6 ms. An ordinary table with a unique `path`: 210 MB, 1.1 ms | Ordinary table |
| Page size, 50,000 rows: a noisy model (3.95 KB mean) and music-sized pictures (2.9 KB mean) | 4 KB: 254 and 210 MB. 8 KB: 297 and 192 MB. 16 KB: 234 and 172 MB. 32 KB: 224 and 162 MB. Reads of 200 within 1 ms of each other | 16 KB |
| Body layout, synthetic tracks through the real decoder | Column by column: 2,605 bytes. Band by band: 2,332 bytes (−11%). Deltas: worse than either | Band by band |
| Downsampling 1,200 → 120 columns | A loop per span: 230 µs. One `map(max, …)`: 150 µs. Lane-wise maximum in one integer: 50 µs | Lane-wise |

- **Why the layout:** a `WITHOUT ROWID` row keeps at most about 1 KB in its page and spills the rest
  to an overflow page of its own. An ordinary row keeps up to 4 KB in place.
- **Why 16 KB pages:** at 4 KB a page holds one picture and a row just over its local limit takes a
  second page, wasting 28% to 46% of the file. 8 KB was worse for pictures just under 4 KB, which
  often miss fitting two to a page. 32 KB saved a further 5% for twice the bytes read per row.
- **Why the picture is the last column:** reading a state then never reads it.
- **Why a lane-wise maximum:** `numpy` is not in the engine (DEC-123). Giving each byte a 16-bit lane
  of one Python integer makes a lane-wise maximum a handful of big-integer operations, all in C.

The store at 50,000 waveforms, and the reads the acceptance times, are recorded in
`PHASE11_WAVEFORMS.md` under WAVE-02, from `scripts/bench_waveform_store.py`.

## Consequences

- **A restored backup or a new import keeps every waveform;** a moved file is analysed again.
- **A schema change costs a re-analysis, never a migration.** So there is no migration to write,
  test or get wrong for derived data.
- **Two databases can disagree,** and neither is wrong:
  - a track whose file has no row is `waiting`;
  - a row no track has is dead weight until WAVE-03's full run prunes it.
- **A stored picture answers first.** A track whose drive is unplugged, or whose decoder is gone,
  still shows the picture made from its file.
- **`FORMAT_VERSION` names the picture's rules;** `ANALYSIS_VERSION` names the envelope's. A test
  pins a digest of a fixed envelope's picture, so a rule change that forgets the version fails.

## Amendment (WAVE-03, 2026-10-03): the work list's index

The library analysis compares every present file with the store once per 200 files it
analyses. It needs each current row's path, size and state. Rows are kept in their
pages beside their pictures, so reading them means scanning the whole file.

- **`waveforms_work`** is a covering index on `(analysis_version, path, size_bytes,
  state)`. `current_files()` reads it alone, with `INDEXED BY` and a test that the
  plan says `COVERING INDEX`.
- **It is created with `IF NOT EXISTS` at every first open,** so a store made before
  it gains it without a schema version and without losing a row.
- **Pruning reads the path's own index** (`paths()`), and `delete_paths()` removes a
  run's dead rows in one transaction. A run never prunes while the library has no
  tracks: an empty library is far likelier a new or reset database than a decision
  to discard hours of analysis.

## Amendment (WAVE-05, 2026-10-05): "Delete waveform data"

"Delete waveform data" empties the store and gives its space back without
replacing the file.

- **The file stays.** Other threads hold connections to it, and Windows refuses
  to delete or rename an open file. So `clear()` deletes every row in one
  statement, then `VACUUM` rewrites the file at its new size and the WAL is
  truncated. A store emptied of 250 MB that kept its pages would say it was
  deleted and take the same disk.
- **Compacting is best effort** once the rows have gone: a reader holding the
  file delays it to the next `VACUUM`, never the deletion.
- **A copy set aside earlier is deleted too,** and counted in the size the
  confirmation states (`disk_bytes()`, which never opens the store).
- **Nothing lands after it.** The engine stops a running analysis with the
  reason `data_deleted`, waits for the files it is decoding, empties the store,
  and only then lets a run start again: unless paused, at once.

## Amendment (WAVE-08, 2026-10-05): loudness, beside each waveform

DEC-124 measures each file's loudness in the pass that draws its waveform. The reading is
kept in this store, in a table of its own.

- **`loudness`**, keyed by path as `waveforms` is: the file's size and modified time, the
  `LOUDNESS_VERSION` that measured it, the integrated loudness and the peak (each nullable),
  and the reason there is no value. `WITHOUT ROWID`: rows are some fifty bytes, so the table
  is its own primary key's index.
- **Created with `IF NOT EXISTS` at every first open,** as `waveforms_work` was: a store made
  before it gains it, keeps every waveform, and has each file measured again in the
  background. No schema version, so DEC-122's rebuild is not triggered.
- **Written with its waveform, in one transaction.** A failed analysis has none, and the
  path's stored one is deleted with it. Inside a transaction a caller already holds, as a bulk
  load does, the write is a savepoint in it instead of a `BEGIN` SQLite would refuse.
- **Read with its waveform,** joined on the path, size and modified time, so a reading of
  another version of the file is never shown; its own version is the service's to judge.
  The work list joins on the path and size alone, which `waveforms_work` holds, so it still
  reads the index and one primary-key lookup a path, never the table's pages. The modified
  time is compared when a file is analysed.
- **Deleted with its waveform**: a refused picture, the prune and "Delete waveform data".
- **Its size, measured at 50,000 tracks:** 5.9 MB on its own, the path it is keyed by being
  most of it; the store went from 246.6 to 252.1 MB. The store's budget is now 260 MB: WAVE-02's
  250 for the waveforms, which still hold inside it, and 10 for this table.
- **Not keyed by the waveform's row id,** which would have saved 3.8 MB: `waveforms` is keyed by
  text, so its row ids are SQLite's own, and `VACUUM`, which `clear()` runs, may renumber them.
  A reading keyed by one could follow another file's row.

## Signals to revisit

- **The store outgrows its budget:** a real library's mean picture exceeds about 5 KB, which would put
  50,000 tracks over 250 MB. Consider a coarser companding or a second compression pass before
  anything else.
- **A detail view arrives** (DEC-115): its denser data belongs in a table of its own in this store,
  under a new schema version, not in this row.
- **Reads slow on a network home folder:** SQLite over a network share is unreliable. The store
  follows the library database; if that moves to a share, both need a local home.
