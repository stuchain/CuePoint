# Glossary

- **Rekordbox XML**: An export file from Rekordbox containing tracks and playlists.
- **Key**: A track's musical key, shown in Camelot ("8A") with its name ("A
  minor") in Track details. It is the key you typed, or else the key of the
  track's accepted Beatport match. Rekordbox's key is never used; a track with
  neither has "No Beatport key".
- **Track details**: The panel on the right that shows the selected track: buttons to
  play it, your own values, what Rekordbox sent, its cue points, where it is, its Beatport
  match and its history. Hide it with Ctrl+I; it stays as a tab you can click.
- **Keys page**: Shows the keys in the playlists, Collections and Sets you tick, with a
  count for each, and the tracks in the keys you click. See [Keys](keys.md).
- **Camelot wheel**: The 24 keys drawn as two rings, minor (A) inside and major (B)
  outside. It lights a track's key and the keys that mix with it: the same number one
  step either way, and the relative key. Open it from the button beside search or from
  the key in the player bar; click a key to see every track in it in the Library. On the Keys page it also carries
  each key's track count; Ctrl+Click or Shift+Click chooses several keys.
- **Selection bar**: The row of buttons above the Library table that act on the
  selected tracks: Play, Organize, Explore, Beatport, Fix and More, then Clear
  selection. A track's right-click menu holds the same six groups. On Discover's
  artist and label pages and on Similar tracks the bar is shorter (Play and
  Explore, and More on an artist's or label's tracks), and the right-click menu there
  holds the same groups.
- **Playlist**: A named collection of tracks inside the Rekordbox XML.
- **Preflight**: In the command-line tool, validation checks that run before processing.
- **Match**: A Beatport result associated with an input track.
- **Low-confidence**: A match with a score below the acceptance threshold.
- **Run summary**: In the command-line tool, a post-run report with counts, duration, and output paths.
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
  CuePoint from the audio file, in three frequency bands or one color. See
  [Waveforms](waveforms.md).
- **Waveform analysis**: The background work that makes a waveform for every
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
