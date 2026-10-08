# Clean

**Clean** is where CuePoint matches your library to Beatport and helps you fix
what it finds: tracks to review, files that have gone missing, possible
duplicates, and a count of everything that needs you. It works on the library
you imported on the [Library](library.md) page, so import a collection first.

Clean has four tabs: **Review matches**, **Missing files**, **Duplicates** and
**Health**. It reopens on the tab you used last. Each tab opens with a line
saying what it is for, and the tabs show where work waits: **Review matches
(42)** counts the tracks waiting for you plus those that changed since you
decided, **Missing files (3)** and **Duplicates (5)** count what the last check
found; Duplicates counts the tracks in duplicate groups, not the groups. A tab shows no number when nothing is waiting, or when that check has
never run.

Three things hold everywhere on this page:

- **Clean deletes nothing.** No track, file or playlist is removed, moved or
  renamed by anything here.
- **Moving a file is done in Rekordbox.** Clean shows which files are missing;
  Rekordbox's **Relocate** is how you point a track at its new place.
- **Tags written to files reach Rekordbox only when Rekordbox re-reads them.**
  Until you choose **Reload Tag** in Rekordbox, it keeps showing the old values.

## Review matches

CuePoint looks each track up on Beatport. Sure matches are accepted for you; the
rest wait here for a yes or no. The first time you open Clean, with nothing
looked up yet, it offers **Match all N tracks** and says what that does:
CuePoint searches Beatport for each track to find the right release, key and
label, in the background, and you can keep using the app. **Choose a playlist
first** takes you to the **In** menu to match less.

**Save review list as a file…**, in the page's header, is described under
[Saving the review list](#saving-the-review-list).

The review queue is a table of tracks, chosen by two menus:

- **Show** — which tracks: **Waiting for you**, **Changed since you decided**,
  **Accepted**, **Rejected (no match)**, **Not found on Beatport** or **Not
  looked up yet**.
- **In** — where: the whole library, a Rekordbox playlist, one of your
  Collections or a Smart Collection.

### Matching

**Match all** looks up every track the queue shows on Beatport. **Match
selection** looks up the tracks you selected. Each asks what to match first:
**Only tracks not looked up yet**, or **Look all of them up again**. Matching
runs in the background: a note above the queue says how many tracks are being
matched, that the bar at the bottom shows progress and the list updates when it
finishes, and you can leave the page. The status strip shows **Matching on
Beatport** with its progress and a **Stop** button.

A track already matched or decided is skipped, so matching a playlist twice does
not look anything up twice, unless you choose to look them all up again. A
decision you made is kept either way; if a newer search found a different best
match than the one you chose, the track is marked **Changed since you decided**
so you can look again.

Matching takes a while: each track is several Beatport searches. A match you
stopped, or one that CuePoint's closing cut short, can be carried on: the
review queue says how many tracks it left, with **Resume**, and the **Activity**
entry for an interrupted match offers **Resume** too. Resuming matches only the
tracks it had not reached; nothing is matched twice.

### What matching decides for you

| After a match | Means |
| --- | --- |
| **Accepted** | The best candidate scored 95 or more and passed every check. CuePoint accepted it for you, and says so |
| **Waiting for you** | Beatport found candidates, but none was certain enough |
| **Not found on Beatport** | Beatport was asked and nothing fit |
| **Not looked up yet** | The track has not been looked up yet, or every search came back empty |
| **Rejected (no match)** | You (or a later check) said none of the candidates is the track |

Every candidate a match found is kept, with its score and the reason it was
turned down, so you can pick another one later.

### Deciding

Select a track and the **Comparison** below the queue shows it beside its
candidates: key, BPM, genre, label, year and release. A value that
differs from your track is marked with **≠** as well as a color. The Key row
shows Rekordbox's key against Beatport's, and says Rekordbox's is not used.

Each candidate has one plain line under its number: **Very likely (94/100)**,
**Possible (71/100)**, **Unlikely**, or **Ruled out** with the reason, such as
no artist in common. **Why this score?** opens the matcher's own working: the
score before bonuses, title and artist similarity, the year and key bonuses, the
checks and the search that found it. It stays open or closed as you left it.
A candidate is badged **Suggested**, **Best score**, **Accepted**, **Rejected**
or **Ruled out**.

Choose a candidate by clicking its heading, then **Accept**. **Accepting links
this track to the Beatport release. It changes no values.** **Reject** says none
of them is right. **Undo my decision** hands the track back to what the matcher
proposed. **Search Beatport again for this track** looks it up again, even if it
is already matched.

The keyboard does the same, which is the quick way through a long queue. The
hint is behind **Keyboard shortcuts** under the comparison:

| Key | Does |
| --- | --- |
| **Up** / **Down** | Previous or next track |
| **Left** / **Right** | Choose another candidate |
| **A** | Accept the chosen candidate |
| **R** | Reject the match |
| **N** | Next track without deciding |

The keys do nothing while you are typing in a field or have a dialog open.

### Applying Beatport's values

**Accepting a match gives the track its key and changes no other value on its
own.** The key is Beatport's, from the accepted match, whether you or CuePoint
accepted it (a re-match can change an automatic accept's key); rejecting the
match takes it away again. Once a track has an accepted match,
**Apply from the accepted match** lists its BPM, genre, label and
year, and says what applying does: it copies the values into CuePoint, and your
audio files and Rekordbox are unchanged until you export. Untick what you want to
keep and choose **Apply**. The applied values
become your values: the Library shows, sorts and filters by them, marked with
where they came from, and Rekordbox's values stay underneath. Title, artist,
remixer and album are never changed.

To take an apply back, use **Revert** in the Inspector's History, or **Revert
this batch** in the Activity panel for an apply over many tracks. See
[Taking a change back](library.md#taking-a-change-back).

### Saving the review list

**Save review list as a file…**, beside the page's title, saves the tracks shown
(or the ones you selected) with their match state and Beatport link, as a
spreadsheet (CSV or Excel) or JSON that you can share or check by hand.

## Missing files

The tracks whose file was **missing** or **unreadable** at the last check. The
check runs on its own after every import and refresh. **Check every file**
checks the whole library again; **Check these again** and **Check selected
again** check only what is listed or selected.

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

## Health

A count of everything that may need you: missing or unreadable files, tracks in
a duplicate group, tracks not looked up yet, waiting for you or changed since you
decided, and tracks
with no Beatport key, or no BPM, genre or artwork. **Each count opens the Library on exactly
the tracks it counts**, as an ordinary filter you can change or save as a Smart
Collection.

**Checks** has a line for what each is for and when it last ran, or **Not done
yet**: **Files on disk** (looks for tracks whose file has moved or been
deleted), **Duplicate search**, **Cover art in your files** (**Read cover art**
reads the pictures stored inside your audio files) and **Waveform drawing**, each
with a button to run it again.

**Waveform drawing** is the one check that runs on its own. After every file
check, CuePoint works out a waveform for each file the check found, in the
background and at low priority: the tracks in your Sets first, then those in your
Collections, then the newest. It says how far it has got ("Analyzing · 1,234 of
50,000 · about 6 hours left") and offers **Pause** while it runs, **Resume** while
it is paused, and **Analyze waveforms** when it has nothing left to do. A paused
analysis stays paused, after a restart too, until you resume it. A file that
could not be read is not tried again until it changes; a file on a drive that is
not connected is not counted against it. On a build without the player's decoder
it says so, and nothing is analyzed. **Settings → Waveforms** shows the same and
chooses how waveforms are colored. See [Waveforms](waveforms.md).

Health gives no overall score. A library with 40 tracks without a genre is not
"92% healthy"; it has 40 tracks without a genre.

## Where inKey and Results went

Earlier versions matched from a separate **inKey** screen and showed matches on
**Results**. Clean replaces both:

| Before | Now |
| --- | --- |
| inKey: load an XML or M3U file, choose playlists, match | Import the collection once in the Library, then match a playlist, a Collection or the whole library here |
| Results: review, pick another candidate | **Review matches**, with the comparison and the keyboard |
| Export results to CSV, JSON or Excel | **Save review list as a file…** |
| Sync tags with Rekordbox | [Write tags to files](library.md#writing-tags-to-files), previewed, recorded and restorable |
| Past searches | Match results are kept with each track instead of in files |

The CSV files earlier runs wrote are still where they were saved; CuePoint no
longer lists them and does not import them, because they were matched against a
playlist file rather than your library. An old bookmark or remembered page for
inKey or Results opens Clean.

**The command-line tool is unchanged.** `python main.py --xml … --playlist …`
still matches a playlist from an XML export and writes its CSV files, exactly as
before.

## See also

- [Your library](library.md) — importing, refreshing, the Inspector, writing
  tags to files and taking changes back
- [The CuePoint window](the-window.md) — the status strip, Activity and the
  keyboard
- [Performance](performance.md#clean) — measured timings at 50,000 tracks
