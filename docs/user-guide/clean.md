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

CuePoint looks each track up on Beatport. Sure matches are confirmed for you; the
rest wait here for a yes or no. Match has these tabs: **Playlists**, the
**Review** of a search (only while one is open, named for it: **Review hJ**) and
**Past searches**. It opens on **Playlists**; after that it reopens on **Playlists**
or **Past searches**, whichever you used last.

While a match runs, a line at the top of Clean, above every tab, says what it is
doing: **Matching hJ**, a bar, **11 of 24**, **about 2 minutes left** (once a few
tracks are done) and a **Stop**. It is read from the match that is running, so it
is right when you come back to Clean from another page too, and whichever tab you
are on.

### Playlists

One row for every Rekordbox playlist, and a first row, **Whole library**. Each
row shows the playlist's folder (muted) and name, how many **Tracks** it has, its
**Beatport** status and a **Next** column that says what to do. The box above the
list narrows it by name or folder, which helps when you have hundreds.

The status is the first of these that applies:

| Status | Next |
| --- | --- |
| **Matching 12 of 24**, with a bar | **Stop** |
| **N to check** and **N confirmed** | **Match**, **Review N ›** |
| **N ready to save** | **Match**, **Save N to files…** |
| **N not found** | **Match again**, **See them ›** |
| **Not matched** or **N not matched** | **Match** |
| **Done** | **Match**, "Values in your files" |

A row can also say **N not found** beside what else it says, when some tracks
were searched for and Beatport had nothing.

Every row has its own **Match**: there are no tick boxes and no button in the
page header. **Whole library** matches every track. A playlist with nothing left
to look up is looked up again. One match runs at a time, so the other rows'
**Match** buttons wait until it ends, and say why: "one match at a time". A row
with values ready to save also has its own **Save N to files…**.

Matching runs in the background. While it runs, its row shows a bar and
"Matching 12 of 24" with a **Stop**, and the status strip shows **Matching on
Beatport**. A track already matched or decided is skipped, so matching a
playlist twice does not look anything up twice. A decision you made is kept
either way; if a newer search found a different best match than the one you
chose, the track is marked **Changed since you decided** so you can look again.

**When a match ends** while you are on Clean, it lands on its [Review](#review).
From another page, a note says so ("hJ matched · 15 confirmed · 9 to check") with
a **Review 9** button. **Review N ›** on a row opens the same list again later.

**When a search finds nothing at all**, a red note at the top of Clean says so.
If Beatport could not be reached or turned the searches away it says "hJ: 24
searches failed" and that **Match again** usually fixes it; if the searches ran and
found nothing it says "hJ: no Beatport match for 24 tracks. This usually means the
search failed, not that the tracks aren't on Beatport." Either way **See the 24 ›**
opens the Review on those tracks (on **Search failed** when any failed, else on
**Not found**), and the row reads **24 not found** with **Match again**. **See them ›**
on the row opens the Review on the tracks that were not found, where you can search
again, search Beatport yourself or leave them unmatched.

A match that ends while you are reading a review's details does not replace it: a
note says so, with **Review N**.

The first time you open Clean, with nothing looked up yet, every row says **Not
matched**. Other pages hand tracks to Match too: **Match tracks…** in the
Library's Beatport menu, or **Match on Beatport** in Track details. Those open the
[match window](#the-match-window) with the tracks they handed over.

Matching takes a while: each track is several Beatport searches. A match you
stopped, or one that CuePoint's closing cut short, can be carried on: the search
shows in **Past searches** as **Stopped at 120**, with **Resume**, and the
**Activity** entry for an interrupted match offers **Resume** too. Resuming
matches only the tracks it had not reached; nothing is matched twice.

Matching searches Beatport with your Beatport sign-in (**Settings → Beatport**), so
sign in first. If Beatport does not accept the sign-in, or limits how fast it will
answer, the tracks say **Search failed** rather than **Not found**, and **Match
again** tries them once that is sorted out. Without a sign-in CuePoint falls back
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
One track is matched in place with **Search again** in the Review, and from Track
details.

### What matching decides for you

| After a match | Means |
| --- | --- |
| **Matched** | The best candidate scored 95 or more and passed every check. CuePoint confirmed it for you, and says so |
| **To check** | Beatport found candidates, but none was certain enough |
| **Not found** | Beatport was asked and nothing fit |
| **Search failed** | The search itself could not finish, so nothing is known about the track |
| **Done** | You decided it: accepted a match, or said none is the track |

Every candidate a match found is kept, with its score and the reason it was
turned down, so you can pick another one later.

### Review

Every track of one search, in one list, with what was found for it. It is where a
match lands when it finishes, and where **Review N ›**, **See them ›** and **Open**
in Past searches take you.

Above the list: a **‹ Playlists** button back, the name and how many tracks, chips
that filter the list with their counts (**All 24**, **To check 9**, **Not found 2**,
**Matched 13**, and **Search failed**, **Done**, **Rejected** or **Changed since you
decided** when there are some), a coloured bar showing the same counts, and **Confirm
all 13 matched**. The counts and the chips are for every track of the search, however
long; a very long search is read a page at a time (**Show more**), with the tracks
still to look at first, and only the rows in view are drawn.

**Confirm all 13 matched** asks first, naming what it will copy ("Confirm 13 and update
BPM, Genre, Label, Year?"), and its note offers **Undo**. Tick rows (a tick box on
each row with a match, and one in the header) to **Correct N selected** the same way.

Each row shows:

- **Status**: **To check**, **Not found**, **Search failed**, **Matched** or **Done**.
  A decision you made that a newer search disagrees with is **To check** again, and
  under **Changed since you decided**.
- **Your track** and the **Beatport match** found for it.
- **Differs**: which part differs ("title", "remix", "key", "BPM"…), or a ✓ when
  nothing does.
- A **▶** that plays Beatport's short sample of the match.
- The **quick decision** for its status:

| Status | Buttons |
| --- | --- |
| **To check** | **✓ Correct**, **✕ Not this**, **Details ›** |
| **Not found** | **Search ›**, **Leave unmatched** |
| **Search failed** | **Search ›**, **Match again** |
| **Matched** | **✕ Not this**, **Details ›** |
| **Done** | **Undo** |

**Correct** confirms the match and updates the values ticked in the details (BPM,
Genre, Label and Year unless you changed that) in one step. **Not this** and
**Leave unmatched** say none of the results is the track. A decided row dims and
moves to the bottom. **Undo** takes a decision back, and a line above the list says
what was just done with an **Undo** beside it. When the decision was a Correct or an
Confirm all, Undo takes back that track's part of the step, with the values it copied
to it, even if you left the page or restarted CuePoint since, and leaves the other
tracks of the batch as they were. The note after **Confirm all** has **Undo confirming
13**, which takes back the whole batch. A refusal is cleared and the track returns to
what the search found.

Click a row, or press **Enter** on it, to open its details. **↑** and **↓** move
along the list. **Confirm all 13 matched** confirms every track
CuePoint was sure of, as one step.

**Details ›** (or a click on the row) opens a panel beside the list (the list stays where it is, and
a preview keeps playing); the keyboard moves into the panel and comes back to the row when it closes. The
artist and label are links to their pages:
**Your file** beside the **Beatport** match, each with its small artwork and a
play button, the **% likely**, and **Other results** behind **show ›**: chips, each
with its place, mix and score. A result that was ruled out says why. **Why this
score?** opens the matcher's own working, and a track searched more than once has
an **Attempt** menu. The ticks say which values **Correct** also copies:

> When I say "Correct", also update: ☑ BPM ☑ Genre ☑ Label ☑ Year ☐ Key (replaces yours)

Your ticks are remembered. **Rekordbox keeps its own values**: Correct changes
CuePoint's view of the track and nothing in Rekordbox or your audio files until
you [save them to files](#saving-values-into-your-files). The **Key** tick is off
until you turn it on; ticking it replaces a key you typed yourself with Beatport's.
Otherwise confirming a match already gives the track Beatport's key. To type a
key yourself, use **Edit values…** in the Library or Track details.

The panel's buttons are **Correct** (Enter), **Not this track** (N) and **Skip**
(S); deciding moves straight to the next track still to look at, and **Skip** does
too without deciding. **Search Beatport myself…** opens Beatport in your browser,
and **Search again** looks the track up again, even if it is already matched
(only while no other match runs).

**Search ›** on a track that was not found, or whose search failed, opens the
panel as a search: a box filled with its title and artist, and **Search**, which
searches Beatport from CuePoint with those words (it needs your Beatport sign-in;
without one the panel says so). The results are scored against your track as any
match is, kept with it, and listed with **Use this** on each. A search never
confirms anything by itself, however certain a result is: the track waits for you
until you press **Use this**. It waits while a match is running ("one match at a
time"). **Search Beatport
myself…** opens Beatport in your browser instead, **Search again** looks the track
up again, and **Leave unmatched** (N) and **Skip** (S) decide.

When every row is decided, the list gives way to "hJ is reviewed" and what was
decided, with **Save N to files…** (the save window, with a before and after),
**Look through them again** and **Back to playlists**. Nothing is written to your
files until you save. **Save N to files…** is explained under
[Saving values into your files](#saving-values-into-your-files).

The keyboard does the same, which is the quick way through a long list. Every key
has a button too. The keys do nothing while you are typing in a field or have a
dialog open, and a key held down decides once.

| Key | Does |
| --- | --- |
| **Enter** | Correct (in Details) |
| **N** | Not this track, or Leave unmatched |
| **S** | Skip |
| **Left** / **Right** | Choose another result |
| **Up** / **Down** | Previous or next track (also moves along the list with no panel open) |
| **B** | Play or stop the Beatport preview |
| **Y** | Play your file (stops a preview) |
| **Esc** | Stop the preview; when none plays, close the panel |

**Space** still plays and pauses the player.

### Previews and artwork

The **▶** on a row, and **preview** in the details (or **B**), play Beatport's
short sample of the result on screen. It plays through your computer's default
sound output, not the device chosen in Settings → Audio, and it does not join the
queue. Starting a preview pauses the player, and **Play your file** (**Y**) stops
the preview. Only one preview plays at a time, and it stops when you move to
another track or leave the page. When Beatport has no sample for a result, the
page says so.

The Beatport artwork is fetched when a result is on screen, and only from
Beatport's own servers. It is shown, not saved: nothing is written to your
library or your files. With no connection, the art and the preview are simply
missing, and the rest works.

**Play your file** plays the track from your library.

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

Correcting a match, **Correct ticked values**, **Edit values…** and **Use Beatport's
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
files**. Your choices are remembered. After a save, **Undo this save** puts the files
back as they were. See [Saving to
files](library.md#saving-to-files).

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
| Sync tags with Rekordbox | **Save to files…** on the [green bar](#saving-values-into-your-files), previewed, recorded and undoable |
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
