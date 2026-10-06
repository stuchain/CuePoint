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
- **Waveform**: A picture of a track's loudness from start to end, worked out by
  CuePoint from the audio file, in three frequency bands or one colour. See
  [Waveforms](waveforms.md).
- **Waveform analysis**: The background job that makes a waveform for every
  track whose file was found. It can be paused, and carries on where it stopped.
- **Hot cue**, **memory cue**, **beat grid**: Rekordbox's marks on a track, read
  from your export and drawn on its waveform. CuePoint never changes them.
- **Transition strip**: The view on the Prepare page that shows the selected
  entry's waveform beside the next one's, with their planned times and
  loudness.
- **Loudness (LUFS)**: How loud a whole track sounds, measured in the pass that
  draws its waveform: closer to zero is louder. Shown, never applied. See
  [Loudness](waveforms.md#loudness).
- **Peak (dBFS)**: A track's highest sample; 0.0 dBFS is the most a file can
  hold.
- **LU**: A difference in loudness between two tracks, as the transition strip
  says it: "+2.1 LU" is the next track 2.1 LU louder.
