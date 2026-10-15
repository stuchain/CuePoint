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
number when nothing is waiting, or when that check has never run. Values go into
your files from a playlist's Review: see [Saving values into your
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

CuePoint looks each track up on Beatport. You tick the playlists to match, go
through what it found in a plain table, untick what is wrong, and sync the rest
into your files. Match has these tabs: **Playlists**, a **Review** tab for each
playlist you matched or opened (**Review hJ**) and **Past searches**. It opens on
**Playlists**; after that it reopens on **Playlists** or **Past searches**,
whichever you used last.

While a match runs, a line at the top of Clean, above every tab, says what it is
doing: **Matching hJ**, a bar, **11 of 24**, **about 2 minutes left** (once a few
tracks are done) and a **Stop**. It is read from the match that is running, so it
is right when you come back to Clean from another page too, and whichever tab you
are on.

### Playlists

One row for every Rekordbox playlist, and a first row, **Whole library**. Each
row has a tick, the playlist's folder (muted) and name, how many **Tracks** it
has and its **Status**. The box above the list narrows it by name or folder,
which helps when you have hundreds.

A playlist whose values CuePoint has written into your files, with nothing left to
save, is marked **Synced** with the day it was written. Undoing that save, or a
value that is waiting to be saved again, takes the mark away.

| Status | Means |
| --- | --- |
| **Matching 12 of 24**, with a bar | A match is working on it |
| **Matched · 24**, with **Review** | That many tracks have a Beatport match |
| **N not found** | Beatport was asked and had nothing for these |
| **N not matched yet** | Never looked up |
| **Not matched yet** | Nothing in it has been looked up |
| **Empty** | No tracks, so it cannot be ticked |

**Tick one or more playlists and press Match N playlists.** That is the only way
to start a match: there is no button on a row. The ticked playlists are matched as
one run. **Whole library** is its own choice: ticking it unticks and disables the
playlists (they are in it) and matches only the collection. A playlist with
nothing left to look up is looked up again. One match runs at a time, so **Match**
waits until the running one ends, and says why.

Matching runs in the background; a row being matched shows a bar and "Matching 12
of 24", and the status strip shows **Matching on Beatport**. A track already
matched or decided is skipped, so matching a playlist twice does not look anything
up twice. A tick or untick you made is kept either way.

**When a match ends** while you are on Clean, it opens a [Review](#review) tab
for each playlist you matched (the whole library: only its own). From another
page, a note says so ("hJ matched · 15 confirmed · 9 to check") with a **Review**
button. **Review** on a row opens the same table again later.

**When a search finds nothing at all**, a red note at the top of Clean says so.
If Beatport could not be reached or turned the searches away it says "hJ: 24
searches failed" and that matching again usually fixes it; if the searches ran and
found nothing it says "hJ: no Beatport match for 24 tracks. This usually means the
search failed, not that the tracks aren't on Beatport." Either way **See the 24 ›**
opens the Review, where those tracks show as **Search failed** or **Not found**.

A match that ends while you are reading a track's side panel does not replace
what you are reading: a note says so, with **Review**.

The first time you open Clean, with nothing looked up yet, every row says **Not
matched yet**. Other pages hand tracks to Match too: **Match tracks…** in the
Library's Beatport menu, or **Match on Beatport** in Track details. Those open the
[match window](#the-match-window) with the tracks they handed over.

Matching takes a while: each track is several Beatport searches. A match you
stopped, or one that CuePoint's closing cut short, can be carried on: the search
shows in **Past searches** as **Stopped at 120**, with **Resume**, and the
**Activity** entry for an interrupted match offers **Resume** too. Resuming
matches only the tracks it had not reached; nothing is matched twice.

Matching searches Beatport with your Beatport sign-in (**Settings → Beatport**), so
sign in first. If Beatport does not accept the sign-in, or limits how fast it will
answer, the tracks say **Search failed** rather than **Not found**, and matching
again tries them once that is sorted out. Without a sign-in CuePoint falls back
to Beatport's public website, which Beatport often blocks.

### The match window

The window asks which tracks:

- **Tracks not looked up yet**, with how many there are.
- **All tracks**.
- **Tracks in chosen playlists, Collections or Sets**: tick any mix of Rekordbox
  playlists, your Collections and your Sets.
- **The N tracks you chose**, when you came from somewhere with tracks selected.

**Look up tracks that already have a match again** is off unless you turn it on.
Left off, only the tracks not looked up yet are searched, and the window says how
many that is for what you chose. The button names the job: **Match 212 tracks**,
**Match 212 tracks again** when you turned that on, or **Match the 12 chosen** for
tracks you came with. When it is greyed, a line says why ("Choose which tracks.").

### What matching decides for you

| Status in the Review | Means |
| --- | --- |
| **Matched** | The best candidate scored 95 or more and passed every check, or you chose it. CuePoint confirmed it for you |
| **Check** | Beatport found candidates, but none was certain enough |
| **Not found** | Beatport was asked and nothing fit |
| **Search failed** | The search itself could not finish, so nothing is known about the track |

Every candidate a match found is kept, with its score and the reason it was
turned down, so you can pick another one later.

### Review

Every track of one playlist, in one plain table: what Beatport found for it, and
a tick that says whether its values go into your files. Each playlist you match or
open has its own **Review <name>** tab; the whole library has only its own. **‹
Playlists** closes the tab and goes back.

Above the table: the name, how many tracks and how many are **ticked to sync**,
what was **not found**, and a big green **Sync hJ to files…**. A very long
playlist is read a page at a time (**Show more**), and only the rows in view are
drawn.

Each row shows:

- A **tick**. The header tick ticks or unticks every track that has a match.
- **Status**: **Matched**, **Check**, **Not found** or **Search failed**.
- **Your track** and the **Beatport match** found for it, with the part that
  differs from yours (a version, the title, the artists) marked.
- A **▶** that plays Beatport's short sample of the match.

**A ticked track is synced; an unticked one is left out.** Tracks that matched
start ticked, and so do those to check when their match passed the checks; tracks
with no match cannot be ticked. An unticked row dims and its match is struck
through. Your ticks are kept by CuePoint, so they are there when you come back,
and a later match does not undo them. Ticking does not change any value or file:
that happens only in **Sync**.

**Click a row**, or press **Enter** on it, to open its side panel. It opens
straight on the Beatport candidates:

- **Your file** at the top, with its art and a ▶ to play it.
- **Every candidate** the matcher scored, each with a ▶, its title and version,
  artists, BPM, key and year, and **Use this**. The one the track is matched with
  is marked **in use**. A candidate that was ruled out says why.
- A search box, filled with the track's title and artist, and **Search Beatport**,
  which searches from CuePoint with those words (it needs your Beatport sign-in;
  without one the panel says so). The results are scored against your track as any
  match is, kept with it, and listed with **Use this**. A search never confirms
  anything by itself: the track waits until you press **Use this**. It waits while
  a match is running.
- **None of these — leave it out**, which unticks the track.
- **More ›**, which holds **Why this score?** (the matcher's own working for a
  candidate) and, for a track searched more than once, an **Attempt** menu.

**Use this** confirms that candidate and ticks the track. **Up** and **Down** move
to the previous or next track (the table moves too, also with no panel open), and
**Esc** closes the panel. The keys do nothing while you are typing in a field or
have a dialog open. **Space** still plays and pauses the player.

### Previews and artwork

The **▶** on a row and on a candidate play Beatport's short sample of that match.
It plays through your computer's default sound output, not the device chosen in
Settings → Audio, and it does not join the queue. Starting a preview pauses the
player, and **Play your file** stops the preview. Only one preview plays at a time,
and it stops when you move to another track or leave the page. When Beatport has
no sample for a result, the ▶ is greyed.

The Beatport artwork is fetched only from Beatport's own servers. It is shown, not
saved: nothing is written to your library or your files. With no connection, the
art and the preview are simply missing, and the rest works.

### Past searches

Every search you ran, newest first: **When**, **What was matched** (a playlist's
name, or "N tracks"), how many **Tracks**, a **Results** line ("131 found · 42
waiting for you · 6 not found", with "· 2 rejected" and "· 4 not reached" when
there are some) and a status of **Done**, **Stopped at 120** or **Running**. The
numbers show where the tracks stand now, so they change as you work through them.
A search that was resumed is still one line. Type in the search box to find one by
name or date.

- **Open** shows that search's [Review](#review): all of its tracks.
- **Resume** carries on a stopped search with the tracks it had not reached.
- **Match again** looks the same tracks up once more.
- **Save review list as a file…** saves that search's tracks with their match
  state and Beatport link, as a spreadsheet (CSV or Excel) or JSON that you can
  share or check by hand.

## Saving values into your files

**Nothing is written before Sync.** **Sync hJ to files…** opens the Sync window for
the ticked tracks of that playlist, and opening it changes nothing: not your
files, and not CuePoint's own values or matches. Its numbers come from laying
the Beatport matches' BPM, Genre, Label and Year over what each track shows, in
memory, and reading your files. **Cancel** just closes it. You choose what goes
into the files, here and nowhere else:

> ☑ BPM  ☑ Genre  ☑ Label  ☑ Year  ☐ Key [Am / 8A / Amin]  ☑ Comment [ok]
> ☑ Keep values already in the files

Each value shows how many files it would change. **Key** has a style (**Am**,
**8A** or **Amin**) and starts unticked. **Comment** writes the text beside it
(**ok** to start with, up to 255 characters, on one line) into each file's comment
tag, the one Rekordbox lists as **Comments**, so you can see in Rekordbox which
files were synced; it is your text, not a Beatport value, so CuePoint keeps no copy
of it. **Keep values already in the files**
leaves a field alone that the file already holds, a comment included: only files
with no comment get yours. **Undo this save** puts a comment back as it was. **See every change** lists the
before and after of each file. Your choices are remembered for next time.

Pressing **Sync N tracks** does it in one step: the files are written first, with
each old value recorded before it is replaced. Then, for the values each file
actually received, CuePoint accepts the ticked matches and copies those values
into its own, as one recorded batch. A value a file already held, or kept under
**Keep values already in the files**, is not written and so not copied: the files
and CuePoint agree. A value you typed yourself is replaced only when you ticked
that value and it was written. If the files could not be written, nothing else
changes. **Undo this save** puts the files back and takes that batch back with
them, matches included; Activity offers it too. WAV files are skipped, since
Rekordbox does not read their tags; Rekordbox shows the new values after **Reload
Tag**. See [Saving to files](library.md#saving-to-files). The key of a match is
the track's shown key unless you typed one yourself, which Sync never replaces.

To sync the whole collection, open the **Whole library** row's **Review** and use
its **Sync Whole library to files…**.

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
**Check for changes**, a button that takes you to the Library and
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
| inKey: load an XML or M3U file, choose playlists, match | Import your Rekordbox file once in the Library, then match a playlist, a Collection or the whole library here |
| Results: review, pick another candidate | **Match**: the **Review** of a search, with the keyboard |
| Export results to CSV, JSON or Excel | **Save review list as a file…** on each run in **Past searches** |
| Sync tags with Rekordbox | **Sync … to files…** on a playlist's [Review](#saving-values-into-your-files), previewed, recorded and undoable |
| Past searches | **Past searches** in Match lists each search; the results are also kept with each track |

The CSV files earlier runs wrote are still where they were saved; CuePoint no
longer lists them and does not import them, because they were matched against a
playlist file rather than your library. An old bookmark or remembered page for
inKey or Results opens Clean.

**The command-line tool is unchanged.** `python main.py --xml … --playlist …`
still matches a playlist from a Rekordbox file and writes its CSV files, exactly as
before.

## See also

- [Your library](library.md) — importing, refreshing, Track details, editing
  values, saving to files and undoing changes
- [Statistics](statistics.md) — the Health tab
- [The CuePoint window](the-window.md) — the status strip, Activity and the
  keyboard
- [Performance](performance.md#clean) — measured timings at 50,000 tracks
