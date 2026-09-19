# ADR-005: Desktop matching moves from files onto the library

## Status

Accepted (CLEAN-14, 2026-09-17). Records DEC-065 and DEC-071 as implemented in
Phase 7. Supersedes the file-based match flow described by ADR-003's example
routes and `docs/ui-overhaul/phase-3-engine-api.md`, which stay as history.

## Context

The desktop app began as a shell around the CLI's pipeline: inKey loaded a
Rekordbox XML or M3U file, chose playlists, and started a match job
(`POST /api/v1/jobs/match`) whose results lived in the engine's memory until the
Results screen exported them (`/api/v1/export`), synced tags from them
(`/api/v1/tags/sync`), or a later session re-read them from the CSV files the
run wrote (`/api/v1/history/*`).

Phases 3 to 6 gave the app a library: an imported collection in SQLite, a
windowed table, Collections, tags and a history of every change. A match over a
file has no way to attach to that library — a playlist file names paths and
positions, not library tracks — so its results could not be filtered, sorted,
reviewed later, reverted or backed up, and a review made on Results was lost
when the window closed. Keeping both flows alive meant two match paths, two
result shapes and two review screens.

## Decision

**The desktop app matches library tracks, and only library tracks.**

- A match is a job over a selection of library tracks (a playlist, a Collection,
  a Smart Collection, a filter or ids), planned per track so it can be stopped
  and resumed without matching a track twice (DEC-065).
- Every attempt is stored with every candidate it scored (DEC-066); a track's
  match state is derived from its attempts and a person's decision is never
  overwritten by a re-match (DEC-067).
- Review happens on the Clean page, over the Library's own windowed query.
  Applying writes CuePoint's override layer, never a Rekordbox column
  (DEC-068). Export is the review list; writing to files is CLEAN-10's recorded,
  restorable job (DEC-070).
- inKey, Results and past searches are removed from the renderer, and their
  engine routes — `POST /api/v1/jobs/match`, `/api/v1/history/*`,
  `POST /api/v1/tags/sync`, `POST /api/v1/export` and
  `GET /api/v1/xml/playlists` — are removed through all six contract files. The
  `/match` and `/results` addresses redirect to `/clean` (DEC-071).
- **The CLI is unchanged.** It keeps its file-based path through
  `ProcessorService.process_playlist_from_xml`, and its output files.

## Consequences

Positive:

- One match path, one result shape, one review surface. Match results are data
  the Library filters and sorts by, Health counts, backups keep, and reverts
  undo.
- The shared matcher did not change: `process_track` is called with a `Track`
  built from a library row, and CLEAN-03's equivalence test holds Clean and the
  CLI to the same questions and answers.
- Matching survives a restart and can be stopped and resumed.
- The engine API is smaller: five route groups and the in-memory result store
  are gone, and so is a set of bridge methods only one screen used.

Negative:

- **A breaking engine-API change**, recorded in the changelog. Anything that
  called the removed routes must move to `/api/v1/clean/*`.
- A collection must be imported before anything can be matched; there is no
  "match this one file" in the desktop app. The CLI remains that tool.
- Past runs' CSV files are not imported (DEC-071): their candidates were matched
  against a file, with no reliable way to attach them to library tracks.
- The database grows with every candidate kept: about 300 MB for 30,000 matched
  tracks at 40 candidates each (measured in CLEAN-14).

## Signals to revisit

- A real need to match audio outside the library from the desktop app (for
  example a folder not yet in Rekordbox) that importing cannot serve.
- The candidate tables passing about 1 GB in real libraries, which would argue
  for pruning candidates of decided tracks — a change to DEC-066, not to this
  record.
