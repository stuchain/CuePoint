# Glossary

- **Rekordbox XML**: An export file from Rekordbox containing tracks and playlists.
- **Playlist**: A named collection of tracks inside the Rekordbox XML.
- **Preflight**: Validation checks that run before processing.
- **Match**: A Beatport result associated with an input track.
- **Low-confidence**: A match with a score below the acceptance threshold.
- **Run summary**: A post-run report with counts, duration, and output paths.
- **Set**: A running order prepared on the [Prepare](prepare.md) page: tracks in
  the order you will play them, in chapters, with planned times. It sits in the
  Collections tree beside Collections, and a track may be in it more than once.
- **Chapter**: A stretch of a Set — a warm-up, a peak, a close — holding a run
  of its entries in order, with an optional name, notes, target length and BPM
  range. Every entry is in exactly one chapter.
- **Entry**: One place in a Set's running order. A track played twice is two
  entries, each with its own planned times and note.
- **Planned time**: The in and out time typed for an entry, in whole seconds as
  `m:ss` or `h:mm:ss`. An entry with an out time is timed, and plays for its out
  time less its in time. A Set's running time counts timed entries only, and
  says how many are not.
