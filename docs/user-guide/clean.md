# Clean

**Clean** is where CuePoint matches your library to Beatport and helps you work
through what it finds: playlists to match, tracks to review, files that have gone
missing and possible duplicates. It works on the library you imported on the
[Library](library.md) page, so import a collection first.

Clean has three tabs: **Match**, **Missing files** and **Duplicates**. It
reopens on the tab you used last. The tabs show where work waits: **Match (42)**
counts the tracks waiting for you plus those that changed since you decided,
**Missing files (3)** and **Duplicates (5)** count what the last check found;
Duplicates counts the tracks in duplicate groups, not the groups. A tab shows no
number when nothing is waiting, or when that check has never run. Under every
tab, a green bar offers to [save new values into your
files](#saving-values-into-your-files).

Three things hold everywhere on this page:

- **Clean deletes nothing.** No track, file or playlist is removed, moved or
  renamed by anything here.
- **Moving a file is done in Rekordbox.** Clean shows which files are missing;
  Rekordbox's **Relocate** is how you point a track at its new place.
- **Tags written to files reach Rekordbox only when Rekordbox re-reads them.**
  Until you choose **Reload Tag** in Rekordbox, it keeps showing the old values.

**Where the old tabs went.** The count of everything that may need you, and
**Read cover art**, are in **Statistics ▸ Health** (an old link to Clean's Health
opens it); starting or resuming waveform drawing is in **Settings ▸ Waveforms**. Changing values is done where the tracks are: **Edit values…** and **Use
Beatport's values…** in the Library's menus, in Track details and in Keys open
their dialogs in place, and an old link to Fix values opens the Library.

## Match

CuePoint looks each track up on Beatport. Sure matches are accepted for you; the
rest wait here for a yes or no. Match has four views of the same work:
**Playlists**, **One at a time**, **Table** and **Past searches**. It opens on
**Playlists**; after that it reopens on the view you used last.

### Playlists

One row for every Rekordbox playlist, and a first row, **Whole library**. Each
row shows the playlist's folder (muted) and name, how many **Tracks** it has, its
**Beatport** status and a **Next** column that says what to do. The box above the
list narrows it by name or folder, which helps when you have hundreds.

The status is the first of these that applies:

| Status | Next |
| --- | --- |
| **Matching 108 of 180** | You can keep working |
| **N waiting for you** | **Review N** |
| **N ready to save** | **Save N to files…** |
| **Not matched** or **N not matched** | Tick and press Match |
| **Done** | Values in your files |

To match, tick one or more playlists and choose **Match N playlists on
Beatport**. Tick **Whole library** and the button reads **Match the whole
library on Beatport**; the whole library includes every playlist, so the playlists
cannot be ticked with it. When everything you ticked is already matched the
button says **Match 3 playlists again** (or **Match the whole library again**),
which looks those tracks up once more. The button is greyed, with the reason
beside it, until you tick something. The ticks clear when the match starts.

Matching runs in the background. While it runs, one line on the page names what
is being matched with its progress ("Matching hj · 108 of 180") and a bar, and
the status strip shows **Matching on Beatport** with a **Stop** button. You can
leave the page. A track already matched or decided is skipped, so matching a
playlist twice does not look anything up twice, unless you ask for **again**. A
decision you made is kept either way; if a newer search found a different best
match than the one you chose, the track is marked **Changed since you decided**
so you can look again.

**Review N** opens **One at a time** on that playlist's tracks waiting for you.
When the only tracks waiting were matched before you decided, it opens **Changed
since you decided** instead. **Save N to files…** is explained under [Saving
values into your files](#saving-values-into-your-files).

The first time you open Clean, with nothing looked up yet, it says so and offers
**Match all N tracks…**. Other pages hand tracks to Match too: **Match tracks…**
in the Library's Beatport menu, or **Match on Beatport** in Track details. Those
open the [match window](#the-match-window) with the tracks they handed over.

Matching takes a while: each track is several Beatport searches. A match you
stopped, or one that CuePoint's closing cut short, can be carried on: the search
shows in **Past searches** as **Stopped at 120**, with **Resume**, and the
**Activity** entry for an interrupted match offers **Resume** too. Resuming
matches only the tracks it had not reached; nothing is matched twice.

### The match window

The window asks which tracks:

- **Tracks not looked up yet**, with how many there are.
- **All tracks**.
- **Tracks in chosen playlists, Collections or Sets**: tick any mix of Rekordbox
  playlists, your Collections and your Sets.
- **The N tracks you chose**, when you came from somewhere with tracks selected.
  In the **Table**, the window opens on the tracks you ticked.

**Look up tracks that already have a match again** is off unless you turn it on.
Left off, only the tracks not looked up yet are searched, and the window says how
many that is for what you chose. The button names the job: **Match 212 tracks**,
**Match 212 tracks again** when you turned that on, or **Match the 12 chosen** for
tracks you came with. When it is greyed, a line says why ("Choose which tracks.").
One track is matched in place with **Search Beatport again for this track**, in
One at a time, and from Track details.

### What matching decides for you

| After a match | Means |
| --- | --- |
| **Accepted** | The best candidate scored 95 or more and passed every check. CuePoint accepted it for you, and says so |
| **Waiting for you** | Beatport found candidates, but none was certain enough |
| **No match** | Beatport was asked and nothing fit |
| **Not matched** | The track has not been looked up yet, or every search came back empty |
| **Rejected** | You (or a later check) said none of the candidates is the track |

Every candidate a match found is kept, with its score and the reason it was
turned down, so you can pick another one later.

### One at a time

One track fills the screen. On the left is **Your track**: its small artwork, key,
BPM, genre, label, year and length, and **Play your file**. On the right is the
**Best match on Beatport**: its artwork and the same values, with a **%
likely** between the two. A value that would change reads like "126 → 128"; one
that already agrees has a ✓. The artwork is a small thumbnail; click it to see it
larger.

The two menus above the card are **Show** and **From**:

- **Show**: which tracks: **Waiting for you**, **Changed since you decided**,
  **Accepted**, **Rejected**, **No match** or **Not matched**. When **From** is
  one search, **Everything in this search** is there too.
- **From**: **All searches**, or one of your past searches, named by when it ran
  and what it matched ("Today 13:42 · Playlist "all""). It shows only when you
  have two or more past searches, or while a playlist (from **Review N**) or a
  search you opened from **Past searches** is the source.

The line beside them says how far you are ("12 of 48 checked") while you work
through **Waiting for you**, and how many tracks there are for the other lists.

The **Other results** under the cards are chips, each with its place, its mix
and its score. Click one to see that result instead. A result that was ruled out
says why, such as no artist in common. **Why this score?** opens the matcher's
own working: the score before bonuses, title and artist similarity, the year and
key bonuses, the checks and the search that found it. It stays open or closed as
you left it. **Search Beatport myself…** lets you look for the right track by
hand, and **Search again** looks it up again, even if it is already matched. A
track that was searched more than once also has an **Attempt** menu.

The ticks under the cards say which values **Correct** also copies:

> When I say "Correct", also update: ☑ BPM 126 → 128 ☑ Genre ☑ Label ☑ Year

Your ticks are remembered. **Rekordbox keeps its own values**: Correct changes
CuePoint's view of the track and nothing in your Rekordbox collection or your
audio files until you [save them into the files](#saving-values-into-your-files).
The **Key** tick is off until you turn it on, and it only appears when you had
typed a key of your own that differs from Beatport's. Ticking it replaces your
key with Beatport's. Otherwise the key row reads **comes with Correct**:
accepting a match already gives the track Beatport's key. To type a key yourself,
use **Edit values…** in the Library or Track details.

The buttons decide, and stay at the bottom of the screen however tall the card
is:

- **Correct** accepts the match and updates the ticked values in one step.
  Titles, artists, remixers and albums are never changed.
- **Not this track** says none of the results is right.
- **Skip for now** moves on without deciding.
- **←** and **→** step through the other results.

After Correct, a line says what happened ("Corrected "Tone Two"."), with an
**Undo** next to it when something was changed. If the track already had all of
it, the line says "Nothing to change" and there is nothing to undo. **Undo**
takes back the last Correct: the track is back to waiting for you, with the
values it had. To take a correction back later, use **Revert** in Track details'
History, or **Revert this batch** in the Activity panel. See [Taking a change
back](library.md#taking-a-change-back). To go to the list, choose **Table**
above.

The keyboard does the same, which is the quick way through a long list. Every
key has a button too. The keys do nothing while you are typing in a field or have
a dialog open.

| Key | Does |
| --- | --- |
| **A** | Correct |
| **R** | Not this track |
| **N** | Skip for now |
| **Left** / **Right** | Choose another result |
| **Up** / **Down** | Previous or next track |
| **B** | Play or stop the Beatport preview |
| **Y** | Play your file (stops a preview) |
| **Esc** | Stop the preview |

**Space** still plays and pauses the player.

### Previews and artwork

**Play Beatport preview** (or **B**) plays Beatport's short sample of the result
on screen. It plays through your computer's default sound output, not the
device chosen in Settings → Audio, and it does not join the queue. Starting a
preview pauses the player, and **Play your file** (**Y**) stops the preview.
Only one preview plays at a time, and it stops when you move to another track
or leave the page. When Beatport has no sample for a result, the page says so.

The Beatport artwork is fetched when a result is on screen, and only from
Beatport's own servers. It is shown, not saved: nothing is written to your
library or your files. With no connection, the art and the preview are simply
missing, and the rest works.

**Play your file** plays the track from your library; the list of tracks you
are going through becomes the queue.

### Table

The same list as a table, for working through many tracks at once. **Show** and
**From** work as in One at a time. Each row shows the match percentage, and the
key, BPM, genre, label and year as **before → after**. A track with no proposal
says why: "Several possible matches · choose in One at a time", "Beatport found
nothing", "You said not this track" or "Not looked up yet". Double-click a row,
or press **Enter** on it, to open it in **One at a time**.

The **Preview** column plays Beatport's short sample of the proposed match, so
you can hear it before you take it. Only one sample plays at a time.

Tick the rows you want and choose **Take ticked values (N tracks)** to Correct
them all: it accepts each track's best match and updates the values you ticked.
The chevron beside the button, **Values to take**, opens a menu with Key, BPM,
Genre, Label and Year. These are the same remembered ticks as in One at a time,
with the same rule for the key, which is off until you turn it on. When not all
five are ticked the button says how many ("Take ticked values (4 fields)"). Over
many tracks it runs in the background, and **Undo** takes the batch back.
**Columns…** chooses the columns.

### Past searches

Every search you ran, newest first: **When**, **What was matched** (a playlist's
name, or "N tracks"), how many **Tracks**, a **Results** line ("131 found · 42
waiting for you · 6 not found", with "· 2 rejected" and "· 4 not reached" when
there are some) and a status of **Done**, **Stopped at 120** or **Running**. The
numbers show where the tracks stand now, so they change as you work through them.
A search that was resumed is still one line. Type in the search box to find one by
name or date.

- **Open** shows that search's tracks in One at a time (it sets **From**).
- **Resume** carries on a stopped search with the tracks it had not reached.
- **Match again** looks the same tracks up once more.
- **Save review list as a file…** saves that search's tracks with their match
  state and Beatport link, as a spreadsheet (CSV or Excel) or JSON that you can
  share or check by hand.

## Saving values into your files

Correcting a match, **Take ticked values**, **Edit values…** and **Use Beatport's
values…** change the values CuePoint shows, not your audio files. When some of
those values are not in their files yet, a green bar appears under every Clean
tab (and at the bottom of the Library):

> ✓ 47 tracks have new values that aren't in your files yet. **See changes** **Save to files…**

The count is of tracks, an upper bound: the save window then reads the files and
counts exactly, because a file that already holds the value drops out. WAV files
are skipped, since Rekordbox does not read their tags. The bar is gone when
nothing is waiting.

**See changes** lists what would change. **Save to files…** opens the save
window: tick the values to save (Key, with the key style, Genre, Label, Year,
BPM and Artwork), each with the number of files it would change, and **Keep
values already in the files** to leave a field alone that the file already holds.
A preview comes first, and nothing is written until you choose **Save to N
files**. Your choices are remembered. After a save, **Restore** puts the files
back as they were. See [Writing tags to
files](library.md#writing-tags-to-files).

A playlist row on **Playlists** that says **N ready to save** has its own
**Save N to files…**, which opens the same window on just that playlist's unsaved
tracks.

## Missing files

The tracks whose file was **missing** or **unreadable** at the last check. The
check runs on its own after every import and refresh. One check button shows at
a time: **Check every file** before any check has been run, then **Check again**
for the whole library, or **Check 12 again** when you have selected rows.

When nothing is missing the tab is one line: "All 306 files found · checked today
07:54 · **Check again**". The steps and the table below appear only when something
is missing.

A drive that is not connected is reported once, not as thousands of missing
files. Plug it in and check again.

**Missing** means nothing is at that path; **Unreadable** means the file is there
but CuePoint cannot open it. To fix a missing file, use **Show in folder** to
find where it was, then follow the three steps on the page: in Rekordbox,
right-click the track, choose **Relocate** and point it at the file; in
Rekordbox, choose File, then Export Collection in xml format; then here, choose
**Check Rekordbox for changes**, a button that takes you to the Library and
starts it. See [CuePoint checks that your files are still
there](library.md#cuepoint-checks-that-your-files-are-still-there--and-never-moves-them).

## Duplicates

Groups of tracks that may be the same recording, each saying why: the same
file, the same Beatport track, or the same artist, title and mix. **Find
duplicates** looks again; it also runs after every import, refresh and match.

A group you know is fine can be marked **Not duplicates**, and stays hidden
until its tracks change. **Show groups marked not duplicates** lists them, and
**Show as duplicates again** brings one back.

A group can be tagged or added to a Collection from here. **Nothing is ever
merged or deleted**: to remove a duplicate, remove it in Rekordbox and refresh.

Before it changes many tracks, the confirmation names what it will do and how many,
for example **Tag 340 tracks**.

## Where inKey and Results went

Earlier versions matched from a separate **inKey** screen and showed matches on
**Results**. Clean replaces both:

| Before | Now |
| --- | --- |
| inKey: load an XML or M3U file, choose playlists, match | Import the collection once in the Library, then match a playlist, a Collection or the whole library here |
| Results: review, pick another candidate | **Match**: **One at a time** and the keyboard, or the **Table** |
| Export results to CSV, JSON or Excel | **Save review list as a file…** on each run in **Past searches** |
| Sync tags with Rekordbox | **Save to files…** on the [green bar](#saving-values-into-your-files), previewed, recorded and restorable |
| Past searches | **Past searches** in Match lists each search; the results are also kept with each track |

The CSV files earlier runs wrote are still where they were saved; CuePoint no
longer lists them and does not import them, because they were matched against a
playlist file rather than your library. An old bookmark or remembered page for
inKey or Results opens Clean.

**The command-line tool is unchanged.** `python main.py --xml … --playlist …`
still matches a playlist from an XML export and writes its CSV files, exactly as
before.

## See also

- [Your library](library.md) — importing, refreshing, Track details, editing
  values, writing tags to files and taking changes back
- [Statistics](statistics.md) — the Health tab
- [The CuePoint window](the-window.md) — the status strip, Activity and the
  keyboard
- [Performance](performance.md#clean) — measured timings at 50,000 tracks
