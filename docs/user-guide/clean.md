# Clean

**Clean** is where CuePoint matches your library to Beatport and helps you fix
what it finds: tracks to review, files that have gone missing, possible
duplicates, and a count of everything that needs you. It works on the library
you imported on the [Library](library.md) page, so import a collection first.

Clean has four tabs: **Review**, **Missing files**, **Duplicates** and
**Health**. It reopens on the tab you used last.

Three things hold everywhere on this page:

- **Clean deletes nothing.** No track, file or playlist is removed, moved or
  renamed by anything here.
- **Moving a file is done in Rekordbox.** Clean shows which files are missing;
  Rekordbox's **Relocate** is how you point a track at its new place.
- **Tags written to files reach Rekordbox only when Rekordbox re-reads them.**
  Until you choose **Reload Tag** in Rekordbox, it keeps showing the old values.

## Review

The review queue is a table of tracks, chosen by two menus:

- **Show** — which tracks: **Needs review**, **Disputed**, **Accepted**,
  **Rejected**, **No match** or **Not matched**.
- **In** — where: the whole library, a Rekordbox playlist, one of your
  Collections or a Smart Collection.

### Matching

**Match all** looks up every track the queue shows on Beatport. **Match
selection** looks up the tracks you selected. Both run in the background: the
status strip shows **Matching on Beatport** with its progress and a **Stop**
button, and you can keep working, including on this page.

A track already matched or decided is skipped, so matching a playlist twice does
not look anything up twice. Tick **Match again what is already matched** to
look again. A decision you made is kept either way; if a newer match disagrees
with it, the track is marked **Disputed** so you can look again.

Matching takes a while: each track is several Beatport searches. A match you
stopped, or one that CuePoint's closing cut short, can be carried on: the
review queue says how many tracks it left, with **Resume**, and the **Activity**
entry for an interrupted match offers **Resume** too. Resuming matches only the
tracks it had not reached; nothing is matched twice.

### What matching decides for you

| After a match | Means |
| --- | --- |
| **Accepted** | The best candidate scored 95 or more and passed every check. CuePoint accepted it for you, and says so |
| **Needs review** | Beatport found candidates, but none was certain enough |
| **No match** | Beatport was asked and nothing fit |
| **Not matched** | The track has not been looked up yet, or every search came back empty |

Every candidate a match found is kept, with its score and the reason it was
turned down, so you can pick another one later.

### Deciding

Select a track and the **Comparison** below the queue shows it beside its
candidates: key, BPM, genre, label, year, release and the scores. A value that
differs from your track is marked with **≠** as well as a colour.

Choose a candidate by clicking its heading, then **Accept**. **Reject** says
none of them is right. **Clear decision** hands the track back to what the
matcher proposed. **Re-match** looks it up again.

The keyboard does the same, which is the quick way through a long queue:

| Key | Does |
| --- | --- |
| **Up** / **Down** | Previous or next track |
| **Left** / **Right** | Choose another candidate |
| **A** | Accept the chosen candidate |
| **R** | Reject the match |
| **N** | Next track without deciding |

The keys do nothing while you are typing in a field or have a dialog open.

### Applying Beatport's values

**Accepting a match changes no value on its own.** Once a track has an accepted
match, **Apply from the accepted match** lists its key, BPM, genre, label and
year. Untick what you want to keep and choose **Apply**. The applied values
become your values: the Library shows, sorts and filters by them, marked with
where they came from, and Rekordbox's values stay underneath. Title, artist,
remixer and album are never changed.

To take an apply back, use **Revert** in the Inspector's History, or **Revert
this batch** in the Activity panel for an apply over many tracks. See
[Taking a change back](library.md#taking-a-change-back).

### Exporting the review list

**Export review list…** saves the queue — or the tracks you selected — as CSV,
JSON or Excel: each track with its match state, score and the matched Beatport
track.

## Missing files

The tracks whose file was **missing** or **unreadable** at the last check. The
check runs on its own after every import and refresh. **Check every file**
checks the whole library again; **Check these again** and **Check selected
again** check only what is listed or selected.

A drive that is not connected is reported once, not as thousands of missing
files. Plug it in and check again.

To fix a missing file, use **Show in folder** to find where it was, move it back
or use Rekordbox's **Relocate**, export your collection again and refresh in
CuePoint. See [CuePoint checks that your files are still
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
a duplicate group, tracks not matched, needing review or disputed, and tracks
with no key, BPM, genre or artwork. **Each count opens the Library on exactly
the tracks it counts**, as an ordinary filter you can change or save as a Smart
Collection.

**Checks** says when files were last checked, duplicates last looked for and
artwork last read, with a button to run each again.

Health gives no overall score. A library with 40 tracks without a genre is not
"92% healthy"; it has 40 tracks without a genre.

## Where inKey and Results went

Earlier versions matched from a separate **inKey** screen and showed matches on
**Results**. Clean replaces both:

| Before | Now |
| --- | --- |
| inKey: load an XML or M3U file, choose playlists, match | Import the collection once in the Library, then match a playlist, a Collection or the whole library here |
| Results: review, pick another candidate | **Review**, with the comparison and the keyboard |
| Export results to CSV, JSON or Excel | **Export review list…** |
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
