# Glossary

## Words CuePoint uses

One word for each idea, everywhere in the app and in this guide. The "never
say" column is what older screens said; a test keeps those words out of the app
as they are replaced.

| Idea | Say | Never say |
| --- | --- | --- |
| The `rekordbox.xml` you bring in | **Rekordbox file** | "Rekordbox export", "XML export", "your export", "Rekordbox collection" |
| CuePoint writing a file for Rekordbox | **Export to Rekordbox** (the only meaning of "export") | "Export results", "Export support bundle" |
| Bringing the Rekordbox file in | **Import** ("Import a Rekordbox file…") | "Import another file…" |
| Writing values into the audio files | **Sync** ("Sync to files", "Sync 12 files", "Synced 12 files"); a library whose files match is **Up to date** | "Write", "Writing tags", "Save to files", "Write N files", "Nothing to write", "In sync", "Save changes into the files" |
| Taking back a change | **Undo** | "Revert", "Restore", "Put back", "Go back to…" |
| Agreeing with a Beatport match | **Use this match** (the button), **Confirmed** (the state) | "accepted", "Take", "Resolved", "Use this", "Correct" |
| The state of a track's Beatport match | **Confirmed**, **To check**, **No match**, **Not looked up yet**, **Rejected** | "Matched", "Not matched", "Waiting for you", "To review", "Not found", "Not searched yet" |
| The picture on a track | **Artwork** | "cover art" |
| The strip along the bottom of the window | **status strip** | "status bar" |
| Agreeing a Prepare warning is fine | **Mark OK** | "Accept", "Undo accept" |
| Getting Beatport access | **Sign in to Beatport** | "token", except in the fallback "Paste a token instead" |
| CuePoint's background process | not named: "CuePoint stopped working in the background" | "library service", "engine" (only Diagnostics and the log viewer keep it) |
| A value that isn't there | **—** in tables and cards, **not set** in sentences | "empty", "none", "No value", "(not used)" |
| Looking for text in a list | **Search** | "search" for a Discover run, which is a **dig** |
| A failure CuePoint can't reach its background process for | "CuePoint lost touch with its background process. Nothing was changed." | "Fetch failed" |
| Something only the desktop app can do | "This needs the CuePoint desktop app." | "needs the desktop app with CuePoint's library service running" |

## Terms

- **Rekordbox file**: The `rekordbox.xml` you import: a file Rekordbox saved with its tracks and playlists.
- **Key**: A track's musical key, written in the notation chosen in Settings
  (Camelot, "8A", by default; or Musical, "Am", or Both) with its name ("A
  minor") in Track details. It is the key you typed, or else the key of the
  track's confirmed Beatport match. Rekordbox's key is never used; a track with
  neither shows "—".
- **Track details**: The panel on the right that shows the selected track: buttons to
  play it, tabs for its facts and waveform (Overview), its Beatport match, where it is and
  your own values (Yours, with its history), and what Rekordbox sent and its cue points at the foot of Overview. It opens when you select a track; close or open it with Ctrl+I, and it folds to a "Details" tab you can click.
- **Keys page**: Shows the keys in the playlists, Collections and Sets you tick, with a
  count for each, and the tracks in the keys you click. See [Keys](keys.md).
- **Play history**: What CuePoint notes each time you import or refresh: how far
  each track's play count (Rekordbox's own) has moved since the last time. It is
  what the Statistics page's **Since** choices add up. It starts at the last
  import you made before updating (or your first import, for a new library), and
  is only as fine as your refreshes. See
  [Statistics](statistics.md).
- **Never played**: A track whose play count in Rekordbox is zero. A track
  Rekordbox gave no play count is counted apart, as "no play count". See
  [Statistics](statistics.md).
- **Camelot wheel**: The 24 keys drawn as two rings, minor (A) inside and major (B)
  outside. It lights a track's key and the keys that mix with it: the same number one
  step either way, and the relative key. Open it from the button beside search or from
  the key in the player bar; click a key to see every track in it in the Library. On the Keys page it also carries
  each key's track count; Ctrl+Click or Shift+Click chooses several keys.
- **Selection bar**: The row of buttons above the Library table that act on the
  selected tracks. It shows the count and Select all; with a selection it shows Play,
  Organize, Beatport and More, then "N selected ×". A track's right-click menu holds the same
  four groups. On Discover's artist and label pages and on Similar tracks the bar is shorter
  (Play and More), and the right-click menu there holds the same groups.
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
  from your Rekordbox file and drawn on its waveform. CuePoint never changes them.
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
