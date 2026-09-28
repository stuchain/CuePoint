# ADR-007: Discovery moves from inCrate's inventory onto the library

## Status

Accepted (DISCOVER-12, 2026-09-28). Records DEC-090 to DEC-100 as implemented in
Phase 9. Supersedes inCrate's design (`docs/incrate-spec.md` and
`docs/feature/incrate-0*.md`), which stays as history, as ADR-005 did for the
file-based match flow.

## Context

inCrate was CuePoint's one outward-looking tool: it found charts curated by
artists in a collection and new releases on its labels. It was built before the
library existed, so it:

- imported its own copy of the Rekordbox collection into a separate SQLite file
  (`incrate/inventory.sqlite`), which could drift from the library;
- filled missing labels by running its own copy of the matcher over that copy;
- ran as one blocking request, and kept nothing it found beyond a JSON file of
  past results;
- could not tell a track the user owned from one they did not;
- matched artists and labels by name only, with one user's label id hard-coded
  into the source; and
- fell back to driving a browser when a token could not write playlists.

By Phase 9 the library held every effective value, Clean held accepted matches
with their Beatport track ids, and jobs, activity events and a windowed table
existed. Keeping inCrate beside them meant two collection imports, two matchers
feeding two answers, and a discovery list that could not say which tracks were
already in the crate.

## Decision

**Discovery reads the library, and inCrate retires.**

- **Discovery reads the library's effective values** (DEC-090). A run's artists
  and labels are the library's own, overrides included, so a label set in Clean
  is in scope and a label replaced by one is not. Nothing reads inCrate's
  inventory, and nothing fills labels by matching as a side effect of
  discovering.
- **A run is a job, and runs are kept** (DEC-091): cancellable, in the status
  strip, stored with its parameters, outcome, tracks in the order found, and
  every reason each was found. A second run over the same labels reuses their
  looked-up ids and makes no label searches.
- **Ownership is computed, never stored** (DEC-092). A Beatport track is owned
  when it is the track of a library track's accepted match — its parsed id, or
  the id in its URL. It is worked out whenever a run, the wantlist, a page or a
  push reads it, by one SQL fragment and one Python function held together by a
  test, so a track accepted after a run was stored reads as owned when the run
  is reopened, and "hidden as owned" and "shown as not owned" can never
  describe the same track.
- **An artist or label is a Beatport id when CuePoint knows it, otherwise a
  normalized name, and every page says which** (DEC-095). An accepted match
  identifies a Beatport *track*; the artist and label ids are one catalog
  lookup of it away, so they come from an explicit, cancellable resolution job
  over accepted matches, never from browsing. A name groups case, accents and
  punctuation together and errs by not grouping, as DEC-074 chose.
- **Similar tracks are local, deterministic and explained** (DEC-096): a rule in
  `core/similarity.py` over tempo, key, genre, label and artist, read as
  effective values, ordered by score and then track id, with each suggestion's
  reasons returned as data. It needs no token and no network.
- **Beatport playlists go through the v4 API only** (DEC-099), as a job that
  reports added and failed counts and returns the playlist's real URL. The
  browser fallback is deleted.
- **inCrate is removed** (DEC-100): its screen, the Tools group and its landing
  page, its six bridge methods, `/api/v1/incrate/*`, the inventory, enrichment,
  discovery and playlist code, `scripts/create_incrate_playlist.py`, and the
  legacy catalog parsers that guessed between nestings. The Library is home;
  `/incrate` and a remembered `incrate` open Discover, and `/` and a remembered
  `tools` open the Library. What survived moved out of `incrate/`: the catalog
  models to `services/beatport_api_models.py` and the playlist name to
  `services/playlist_name.py`. `incrate/beatport_oauth.py` stays, untouched and
  uncalled (DEC-098).
- **User data is kept.** The inventory database and `incrate_past_results.json`
  stay where they were; nothing reads, moves or deletes them, and the user
  guide says where they are. The `incrate.*` config keys keep their names and
  still load, including the ones nothing reads any more.

## Consequences

Positive:

- One import, one matcher, one set of values. A label corrected in Clean is the
  label discovery searches, and a match accepted in Clean is what makes a track
  owned in every run, page and push.
- Discovery is reviewable: a run keeps why each track was found, a page says
  whether it knows its artist by id or by name, and a suggestion says why it was
  suggested.
- Every Beatport response is parsed by one shape per endpoint, against recorded
  fixtures, keeping every id. The legacy parsers' known type errors went with
  them, and `beatport_api.py` joined the strict mypy gate.
- The engine API and the bridge are smaller: six bridge methods and six routes
  that one screen used are gone.

Negative:

- **A breaking engine-API change**, recorded in the changelog:
  `/api/v1/incrate/*` answers 404. Anything that called it must move to
  `/api/v1/discover/*`.
- Discovery needs an imported library; there is no "discover from this XML
  file". Artists and labels are found by id only after resolution, which needs
  a token.
- Ownership is only as complete as Clean's matches: a track the user owns but
  has not matched reads as not owned, and the page says ownership comes from
  matches.
- Files inCrate left behind are the user's to delete by hand.

## Signals to revisit

- A need for Beatport tracks among Similar tracks' candidates (DEC-096 chose
  local only; the engine's inputs do not depend on where a candidate came from,
  so it would be an addition).
- A need to merge or split an artist's identity by hand, which resolution
  through Beatport cannot serve.
- A token flow or secure storage replacing the pasted token (DEC-098's deferral),
  which would retire `beatport_oauth.py` or give it a caller.
