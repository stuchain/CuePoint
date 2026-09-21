# ADR-006: The Rekordbox export patches the source file; it never generates one

## Status

Accepted (EXPORT-07, 2026-09-21). Records DEC-077 as implemented in Phase 8
(EXPORT-01…EXPORT-07). Retires `write_updated_collection_xml` and the five other
orphaned writers EXPORT-01 found.

## Context

Phase 8 carries CuePoint's work — its own key, BPM, genre, label, year and
rating, and its Collections — back into Rekordbox as an XML file a DJ loads as
a second library. The obvious design is to generate that file from CuePoint's
database: it holds every track, every value and every Collection, and a
generator is one loop over them.

It would lose the DJ's cue points and beat grids. `POSITION_MARK` and `TEMPO`
appear nowhere in CuePoint: no parser, no table, no model has ever read one. So
a generated document would hand back every track without its hot cues, memory
cues and grid, silently, and the loss would be discovered in a booth. The same
is true of every other attribute and element CuePoint does not model —
`Kind`, `Size`, `DiscNumber`, `Colour`, `Mix`, `Grouping`, the playlist tree's
`KeyType`, and whatever a future Rekordbox version adds.

A generator can only ever preserve what someone remembered to model. The
failure is by omission, and the failing test would have to be written by the
person who did not know the element existed.

## Decision

**The export re-reads the file the library was imported from and changes it in
place, in a copy; it never builds a document from the database.**

- The source is spliced as bytes: for each `TRACK` whose effective value differs
  from what the file holds, only the six attributes CuePoint owns are set
  (`Tonality`, `AverageBpm`, `Genre`, `Label`, `Year`, `Rating`), and only where
  they differ (DEC-079). Every other byte — cue points, grids, unknown
  attributes, whitespace, the mirrored playlist tree — is copied through.
- The chosen Collections are appended as playlists under one folder inside
  `ROOT`, renamed rather than merged if the file already has one of that name
  (DEC-078).
- The source is never written. The destination is refused if it resolves to the
  source, is not `.xml`, is a folder, or is in a folder that does not exist
  (DEC-083); the write goes to a temp file beside the destination and replaces
  it only when complete.
- The preview runs the same planning code with the write left out, so what the
  dialog states and what the file receives are one computation (DEC-084).
- Tags, notes and favorites are not written anywhere (DEC-080), and no audio
  file is opened for writing (DEC-085).

## Consequences

Positive:

- **Preserving what CuePoint does not understand is the default, not a list.**
  A cue point survives because nothing touched it, and so does anything a
  future Rekordbox adds. The phase needed no cue-point parser and has none.
- The exported file differs from its source by exactly what the preview said: a
  diff of the two shows six attributes on the rewritten tracks and the appended
  folder. A library with nothing overridden exports as a byte-for-byte copy
  plus its playlists.
- Measured at 50,000 tracks: 3.1 s and a 161 MiB peak working set to write
  (EXPORT-05), because the splice holds the source once and no tree at all.

Negative:

- **An export needs the source file.** A library whose XML was deleted or moved
  cannot be exported until it is imported again from where the file is now;
  the preview refuses with the path (DEC-082).
- **The file exported is the file as it is now**, which may have moved on since
  the import. The preview reports that with numbers — tracks CuePoint does not
  know, tracks the file lacks, playlist entries dropped — and offers "Refresh
  first", but does not refuse (DEC-082).
- Tracks CuePoint knows that the file does not hold cannot be exported at all:
  there is no `TRACK` to patch, and generating one would reintroduce exactly
  the loss this decision exists to avoid.
- Two code paths read the same XML format: the importer, and the splice. Both
  go through the size guard and expat; neither regenerates anything.

## Signals to revisit

- CuePoint gains a model of cue points and beat grids for its own reasons (for
  example editing a cue in the player). A generator could then preserve those
  two — but still not the attributes and elements nobody modelled, so the
  argument for patching stands unless the whole schema is modelled.
- Rekordbox changes its XML so that byte-level patching of `TRACK` attributes
  is no longer valid (for example values moved into child elements). The
  splice's tests would fail first; the fix is to the splice, not a generator.
- A real need to export a library without its source file — a user who lost the
  XML but kept CuePoint's database. That is a recovery tool, and it should be
  built as one, stating in its own words that cue points and grids are gone.
