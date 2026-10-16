# Statistics

**Statistics** shows what you play most, what is in your library and what needs
fixing. It works on the library you imported on the [Library](library.md) page,
so import a collection first; until then the page says so and offers **Import a
library**. Everything on it is a count of your own tracks, worked out on your
computer. Nothing is sent anywhere.

## Choosing what to count

The **Scope** picker at the top starts on **Whole library**. Choose a Rekordbox
playlist, a Collection, a Smart Collection or a Set to count only its tracks.
Every number on the page, in all three tabs, is for the scope you picked. Under
the title one line says what is counted ("2,847 tracks · 64 playlists" for the
whole library).
CuePoint remembers your choice for next time; a playlist is remembered by its
name and place in the tree, so it is found again after a refresh. If that
playlist or Collection is gone, the page goes back to the whole library (and
remembers your choice, in case it was only missing for a moment). A Smart
Collection whose rules no longer run is listed as "(rules need fixing)" and
cannot be chosen.

## The three tabs

The page has three tabs: **Plays**, **Library** and **Health**. **Library**
shows how many tracks are in the scope, and **Health** shows a chip such as "83
to fix" when something needs doing. Each tab keeps what you set on it while you
look at another one. Each reads on its own. While it is reading it says so; if a
tab cannot be read it says that in plain words and has its own **Try again**
button, and the other tabs stay as they were. The page reads again by itself
after an import or a refresh finishes.

### Plays

**Plays** is what you play most.

- **Where the numbers come from.** A play count is **Rekordbox's own count**: the
  number of times Rekordbox says it has played a track, as it was in the library
  you imported or refreshed. CuePoint does not count plays itself, and a track
  you play in CuePoint's player does not add to it. A count can only be as new as
  your last import or refresh. A line beside **Since** says so: "From your
  Rekordbox play counts · history since Oct 8 · last refresh Nov 2".
- **Since** chooses what is counted: **Your last refresh**, **The last 7 days**,
  **The last 30 days**, **The last 90 days**, **The last year**, **All time**
  (the default) or **A date...**, which adds a **Since date** field. All time
  is the count Rekordbox holds now. The others are the plays CuePoint saw added
  since then. Your choices are remembered.
- **Most played tracks** lists the ten tracks you play most: rank, title and
  artist, key, BPM and plays. Click a row to open that track in the Library; the
  small play button at the row's end plays it. **See top 25 ›** shows twenty-five
  (**Show top 10 ›** goes back); the choice is remembered.
- **Top artists**, **Top labels** and **Top genres** list the five with the most
  plays (with their track counts, except genres), with a bar behind each name as
  long as its share of the first. **See top 10 ›** shows more rows. An artist
  spelled two ways in your library is counted as one artist, and so is a genre
  spelled with different capitals, because CuePoint uses the same artist, label
  and genre values as the Library. Click a row to open its tracks. With a
  **Since** choice the row says "opens all its played tracks", because the Library
  cannot filter by a date and opens all of that artist's, label's or genre's
  played tracks.
- **Not played** has two counts. **Never played** counts the tracks Rekordbox
  says have a play count of zero; **Plays unknown** counts a track Rekordbox gave
  no play count, which is not the same as never played. **Open in Library ›**
  opens those tracks.
- **Keep as Collection** makes a Collection of the Most played list you are
  looking at, in rank order. The page shows the name first (“Will be named
  Most played since Sep 1, 2026 (top 25)”; for All time, “Most played, all
  time (top 25)”), then says "Kept 25 tracks in rank order as ..., in
  Collections in the Library" with **Open it in the Library**. The Collection
  is made at the top level of Collections. It is an ordinary Collection: it
  keeps the tracks it was made with and does not change when plays do. If a
  track has left your library since the list was read, nothing is made and the
  page says so, with **Read the list again**.
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
- **While it reads, or if it fails.** Choosing again dims the lists and says
  "Reading..." until the new ones arrive. If a read fails, the earlier lists
  stay and the page says "These plays could not be read, so what is shown is
  the earlier list." with **Try again**.

### Library

**Library** is what is in the scope.

- **Four numbers** across the top: **Tracks** (with the number of playlists for
  the whole library), **Total time** (the lengths of the tracks added up, with
  the average track length), **Average BPM** (the mean of the tracks that have
  one, with how many have none) and **Added this year**.
- **Genres**, **Labels** and **Artists** list the five with the most tracks,
  each with a bar. **See top ...** shows more. Click a row to open exactly those
  tracks in the Library, within your scope. An artist is counted for the tracks
  it is credited on as artist or as remixer, once per track.
- **BPM**, **Keys**, **Year** and **Loudness** are the charts. **BPM** has a bar
  for each whole BPM, so 124 holds 123.5 up to just under 124.5; **Year** and
  **Loudness** (by LUFS) are bars in order. Click a bar to open the Library on
  exactly the tracks it counted. A bar with no tracks is drawn but cannot be
  clicked, and every **Loudness** bar is shown but opens nothing, because the
  Library has no way to ask for it.
- Under each chart a line counts the tracks that could not be placed ("41
  tracks have no BPM"), with **Open in Library ›** where the Library can show
  them. Loudness also says how many tracks have no file to measure, and how many
  are not measured yet. Loudness comes from CuePoint's own waveform analysis, not
  from Rekordbox (see [Waveforms](waveforms.md)).
- **Keys** shows the commonest keys as bars in their Camelot colours, how many
  tracks have a key and how many have none, counting every notation of a key
  together. **Open in Keys ›** shows the same scope on the [Keys](keys.md) page.
  Most Smart Collections (any but one saved from a playlist view) are the
  exception: the Keys page counts playlists, Collections and Sets, not rules, so
  for one it opens on your whole library and says so.
- **More charts: date added, rating** shows two more, **Date added** (by month)
  and **Rating**.

### Health

**Health** counts how well kept the library is, in four cards. Each count is a
coloured chip: red for what is broken, yellow for what waits for you, grey for
the rest. A chip above zero has a link to where it is dealt with. The "to fix"
number on the tab adds up the missing and unreadable files, the matches waiting
for you, the duplicates, the matches that changed since you decided, and the
analyses that failed.

- **Files** is whether each track's file can be found, as a bar: **Present**,
  **Missing** (the file is no longer where Rekordbox says), **Unreadable** (it is
  there, but CuePoint cannot read it) and **Not checked** (no file check has run
  for the track's current location yet). A track that was never checked is not
  counted as present. The card says when the latest check was made, or "not
  checked yet". **Missing** and **Unreadable** open [Clean](clean.md)'s Missing
  files tab, where the check is run.
- **Beatport** is where each track stands in matching, as a bar: **Confirmed**,
  **To review** (a match is waiting for your decision), **Rejected**, **No
  match** and **Not matched**, with how many are matched. **To review**, **Not
  matched yet** and **No match found** open Clean's Match tab. **Not synced to
  files** counts the tracks whose CuePoint values (key, genre, label, year or
  BPM) are not yet in their files, the same count as the Library's save bar;
  **Open in Library ›** shows them.
- **Other** counts **Duplicates** (tracks in a group of likely duplicates you
  have not dismissed; Clean's Duplicates tab shows every group in the library,
  so it can list more than the count for a scope), **Changed since you decided**
  (a newer Beatport match disagrees with a choice you made) and **No cover art**
  (a file that was read and holds no cover picture, with no Beatport image to
  fall back on). **Read cover art** reads the pictures stored inside your audio
  files, for the whole library, and tells you when it has finished. Under it, it
  says "Cover art last read" with the date, or "Cover art has not been read
  yet". That date is the library's, whichever scope is picked.
- **Analysis** is how far the waveform analysis has got, as a bar: **Analyzed**,
  **Waiting**, **Failed** and **No file** (a track with no file to analyze).
  **Failed** opens Settings on Waveforms, where the analysis is started, paused
  or resumed (see [Waveforms](waveforms.md)).
