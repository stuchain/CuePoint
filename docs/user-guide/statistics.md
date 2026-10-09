# Statistics

**Statistics** shows what you play most and how your library is made up. It
works on the library you imported on the [Library](library.md) page, so import a
collection first; until then the page says so and offers **Import a library**.
Everything on it is a count of your own tracks, worked out on your computer.
Nothing is sent anywhere.

## Choosing what to count

The **Scope** picker at the top starts on **Whole library**. Choose a Rekordbox
playlist, a Collection, a Smart Collection or a Set to count only its tracks.
Every number on the page, in all three sections, is for the scope you picked.
CuePoint remembers your choice for next time; a playlist is remembered by its
name and place in the tree, so it is found again after a refresh. If that
playlist or Collection is gone, the page goes back to the whole library (and
remembers your choice, in case it was only missing for a moment). A Smart
Collection whose rules no longer run is listed as "(rules need fixing)" and
cannot be chosen.

## The three sections

Each section reads on its own. While it is reading it says so; if a section
cannot be read it says that in plain words and has its own **Try again** button,
and the other sections stay as they were. The page reads again by itself after an
import or a refresh finishes.

### Plays

**Plays** is what you play most.

- **Where the numbers come from.** A play count is **Rekordbox's own count**: the
  number of times Rekordbox says it has played a track, as it was in the library
  you imported or refreshed. CuePoint does not count plays itself, and a track
  you play in CuePoint's player does not add to it. A count can only be as new as
  your last import or refresh.
- **Most played** lists your most played tracks. **Top** chooses how many: 10,
  25, 50, 100 or 200. Each row shows its rank, title, artist and plays, with a
  bar drawn to the plays. Click a row to open that track in the Library; the
  small play button beside it previews the track.
- **Since** chooses what is counted: **Your last refresh**, **The last 7 days**,
  **The last 30 days**, **The last 90 days**, **The last year**, **All time**
  (the default) or **A date...**, which adds a **Since date** field. All time
  is the count Rekordbox holds now. The others are the plays CuePoint saw added
  since then. Your choices are remembered.
- **Play history.** Rekordbox only keeps a lifetime total for each track, so
  CuePoint keeps its own history: each time you refresh or import, it notes how
  far each count has moved. **Since** adds that movement up.
- **History starts at your last import.** When you update to a version with
  Statistics, CuePoint takes the play counts of the **last library you imported
  before updating** as the starting line (for a library you import for the first
  time afterwards, that import is the start). Every refresh or import after it
  adds to the history. Plays from before the start cannot be told apart, so a
  date earlier than that is **clamped**: the page says "Your play history starts
  on Oct 8, so the counts begin there rather than on Sep 1, 2026." The note
  "Play history starts at your next refresh" appears only when CuePoint has no
  record of that import, and goes when your next refresh has been read.
- **"Since" is only as fine as your refreshes.** CuePoint cannot see when in
  between a play happened, only how far a count moved from one refresh to the
  next. If you refresh once a week, "the last 3 days" counts the plays up to
  your last refresh in that stretch, not the plays of the exact days. A count
  that went down (a track removed and added again, or a reset in Rekordbox)
  adds nothing: it is never taken away from a total.
- **Nothing to count yet.** With **Your last refresh** chosen and no refresh
  since the import, the page says "There is no refresh to count from yet.
  Choose another time, or refresh from Rekordbox." (or, when the import is the
  latest read, "There has been no refresh since the import, so there is nothing
  to count yet."). A list with nothing in it says so: "No plays were recorded in
  that time." or "None of these tracks has been played yet."
- **While it reads, or if it fails.** Choosing again dims the list and says
  "Reading..." until the new list arrives. If a read fails, the earlier list
  stays and the page says "These plays could not be read, so what is shown is
  the earlier list." with **Try again**.
- **Top artists** and **Top labels** list the ten with the most plays, with their
  track counts. An artist spelled two ways in your library is counted as one
  artist, because CuePoint uses the same artist and label credits as the
  Library. Click one to open its tracks. With a **Since** choice, the artist
  and label rows say "Shows all of ...'s played tracks", because the Library
  cannot filter by a date and opens all of that artist's or label's played
  tracks.
- **Never played** and **Plays unknown** are two buttons with counts. Never
  played counts the tracks Rekordbox says have a play count of zero; plays
  unknown counts a track Rekordbox gave no play count, which is not the same as
  never played. Click either to open those tracks in the Library.
- **Keep as Collection** makes a Collection of the Most played list you are
  looking at, in rank order. The page shows the name first (“Will be named
  Most played since Sep 1, 2026 (top 50)”; for All time, “Most played, all
  time (top 50)”), then says "Kept 50 tracks in rank order as ..., in
  Collections in the Library" with **Open it in the Library**. The Collection
  is made at the top level of Collections. It is an ordinary Collection: it
  keeps the tracks it was made with and does not change when plays do. If a
  track has left your library since the list was read, nothing is made and the
  page says so, with **Read the list again**.
- **The foot of the section** says when the counts were read and when history
  started: "Counts from your refresh on Nov 2. History since Oct 8." Before any
  read is recorded it says "No refresh has been recorded yet. The counts are
  the ones in your library."

### Your library

**Your library** is how your tracks spread, in six panels.

- **Genre** and **Rating** are bars by name. **Tempo** (a bar for each whole
  BPM, so 124 BPM holds 123.5 up to just under 124.5), **Year**, **Date added**
  (by month) and **Loudness** (by LUFS) are bars in order.
- Click a bar to open the Library on exactly the tracks it counted, within your
  scope. A bar with no tracks is drawn but cannot be clicked, and **Other**
  genres, and every **Loudness** bar, are shown but open nothing, because the
  Library has no way to ask for them.
- Under each panel a line counts the tracks that could not be placed ("41
  tracks have no tempo"), with an **Open in Library** button where the Library
  can show them. Loudness also says how many tracks have no file to measure,
  and how many are not measured yet. Loudness comes from CuePoint's own
  waveform analysis, not from Rekordbox (see [Waveforms](waveforms.md)).
- **Keys.** A summary says how many of the tracks have a Beatport key, the
  three commonest, and how many have none, counting every notation of a key
  together. **Open in Keys** shows the same scope on the [Keys](keys.md) page.
  Most Smart Collections (any but one saved from a playlist view) are the
  exception: the Keys page counts playlists, Collections and Sets, not rules, so
  for one it opens on your whole library and says so.

### Health

**Health** counts how well kept the library is, in three groups. Every bar is
a count of tracks, and a bar with a count above zero opens the Library on
exactly those tracks, except in Waveforms, which is counted only.

- **Files** is whether each track's file can be found: **Present**,
  **Missing** (the file is no longer where Rekordbox says), **Unreadable**
  (it is there, but CuePoint cannot read it) and **Not checked** (no file
  check has run for the track's current location yet). A track that was never
  checked is not counted as present. Under the bars it says "Last checked"
  with the date of the latest check, or "Files have not been checked yet".
  **Check files** opens [Clean](clean.md) where the check is run.
- **Beatport** is where each track stands in matching, in the words Clean
  uses: **Accepted**, **Waiting for you** (a match is waiting for your
  decision), **Rejected (no match)**, **Not found on Beatport** and **Not
  looked up yet**. **Match** opens Clean to review and match. The Library's own filter chip
  names some of these states differently (**Rejected**, **No match** and **Not
  matched**); they are the same states.
- **Waveforms** is how far the waveform analysis has got: **Analyzed**,
  **Failed**, **Waiting** and **No file** (a track with no file to analyze).
  **Analyze** opens Settings on Waveforms, where the analysis is started,
  paused or resumed (see [Waveforms](waveforms.md)).

**All health checks** opens Clean's Health tab, which still has the longer list
(duplicates, missing values and more) and stays where it was.
