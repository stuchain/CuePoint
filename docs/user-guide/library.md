# Your library

CuePoint keeps its own copy of your Rekordbox collection. Import an XML export
once and CuePoint holds your tracks, your playlists and what is in them, so
everything else it does can start from your actual music instead of asking you
for a file every time. The Library page is also where you browse it: playlists,
filters, sorting and a track's full detail.

Open **Library** in the sidebar.

## Importing a collection

1. In Rekordbox, use **File → Export Collection in xml format** and save the
   file somewhere you will find it again. Downloads is fine.
2. In CuePoint, open **Library** and choose **Import a collection…**.
3. Pick the file. CuePoint reads it in the background — you can keep using the
   rest of the app, and the strip along the bottom shows how far it has got.

When it finishes, the page shows what CuePoint now holds and which file it came
from. **It remembers that file**, so refreshing later takes one click.

A 50,000-track collection takes about eleven seconds to import. See
[Performance](performance.md#the-library) for the measured numbers.

### If the file is not right

CuePoint refuses a file that is not a Rekordbox collection export rather than
importing an empty library and telling you it worked. If you exported a single
playlist instead of the whole collection, the file has no collection in it and
CuePoint will say so — export again with **File → Export Collection**.

## Browsing your library

Once something is imported, the Library page **is** your collection: the
playlists down the left, the tracks in the middle, and everything CuePoint
knows about whichever track you clicked in the Inspector on the right.

Nothing here changes your music. The Library page reads.

### Finding tracks

- **Click a playlist** on the left to look at just that playlist. Folders show
  everything underneath them. **All tracks** goes back to the whole library.
- **Type in the search box** to narrow to matching titles, artists, albums and
  labels. It searches whatever you are looking at, so a search inside a playlist
  stays inside that playlist.
- **Add a filter** for anything more specific — BPM between 124 and 130, genre
  is Techno, comment contains "promo". Filters stack, and the bar says how many
  tracks are left after them.
- **Click a column heading** to sort by it; click again to reverse it.

A playlist opens in the order you arranged it in Rekordbox, which is what a set
list is for. The whole library opens by artist. Sorting a playlist by anything
else and then going back to **All tracks** does not carry that sort over.

### Choosing columns

**Columns…** opens the list. Nine are shown to start with — the ones a DJ reads —
and eight more are there if you want them: remixer, year, plays, date added,
colour, bitrate, comment and the file path. Turn them on and off, drag a heading
to move a column, drag its edge to resize it. CuePoint remembers all of it.

### Selecting tracks

Click to select, Ctrl+click (Cmd+click) to add one, Shift+click for a range —
a range works even across parts of a long list you have not scrolled to yet.

**Ctrl+A selects everything matching what you are looking at**, filters and all.
That means *everything*, not just the rows on screen: select-all over a filtered
47,000-track view selects 47,000 tracks. **Esc** lets go. **Ctrl+F** puts the
cursor in the search box.

With something selected you can **Copy** it — the visible columns, in the order
you have them, ready to paste into a spreadsheet — and, for a single track,
**Show in folder**. A copy is capped at 5,000 tracks and tells you when it hit
the cap.

### The Inspector

Selecting one track fills the Inspector with everything CuePoint imported for
it: title, artist, remixer, album, label, genre, key, BPM, year, length, rating,
plays, colour, comment, bitrate, when it was added, where the file is, and every
playlist it belongs to. Click one of those playlists to jump to it.

The Inspector is read-only. Ratings, comments and everything else come from
Rekordbox, and CuePoint does not write back to it — editing here would mean
editing something Rekordbox would overwrite on your next refresh. Ctrl+I hides
the Inspector if you would rather have the width.

**Double-clicking a track does nothing yet.** Starting a match run from a
selection is the next release.

### Large collections

Browsing 50,000 tracks does not load 50,000 tracks. CuePoint fetches what is on
screen and a little either side, so scrolling stays smooth and memory stays flat
however far you go. A row that has not arrived yet is blank for a moment rather
than moving everything around it. See
[Performance](performance.md#the-library) for the measured numbers.

## Refreshing after Rekordbox changes

Your collection moves on: you buy tracks, you rate them, you delete things.
CuePoint does not watch the file, so you decide when to catch up.

Open **Library** and press **Check for changes**.

- If nothing has changed, CuePoint says so immediately. It does not re-read a
  50,000-track file to tell you nothing happened — it compares the file's
  modified time and size against what it recorded when it imported.
- If something has changed, CuePoint reads the export and shows you **exactly
  what a refresh would do** before doing any of it.

The page also tells you, without being asked, when the export has changed since
your last import — that is what **Out of date** means next to the file name.

### What the preview shows

| Line | Means |
| --- | --- |
| New tracks | In the export, not yet in CuePoint |
| Updated tracks | In both, with something different in Rekordbox |
| **Tracks removed from Rekordbox** | In CuePoint, no longer in the export — **these get deleted** |
| Re-linked after renumbering | Rekordbox gave the track a new ID; CuePoint recognised the file and kept everything |
| New / edited / deleted playlists | The same, for your playlist tree |

Nothing happens until you press the confirm button. **Cancel changes nothing** —
the preview only reads.

### What a refresh deletes

**A refresh deletes the tracks that are no longer in your export, and it cannot
be undone.**

Anything CuePoint has attached to those tracks goes with them: ratings, tags,
play history, and — from a later release — their membership of any Collection or
Set you have built. This is deliberate. CuePoint's library is a mirror of
Rekordbox's, and a mirror that kept tracks you deleted would slowly fill with
things you cannot see in Rekordbox and cannot get rid of in CuePoint.

The preview is there so this is a decision rather than a surprise. It names the
number, tells you what goes with them, and puts that number on the button you
press. If you are not sure, **Cancel** and look at Rekordbox first.

Removing a track from a *playlist* does not delete it. Only a track that has
left your collection entirely is removed.

### Re-numbering is not deletion

Rekordbox sometimes hands out new TrackIDs — after rebuilding a library, or on
some upgrades. CuePoint matches those tracks by their file instead, keeps
everything attached to them, and reports them as **re-linked**. They are not
deleted and re-added, and they do not appear in the removal count.

### When CuePoint cannot tell whether the file changed

If CuePoint says it **could not tell** whether the export changed, check it
anyway — that message means the file's details could not be read, not that
nothing happened.

Very rarely, an export can be edited without its size or modified time changing,
and CuePoint would then say nothing has changed when something has. Re-exporting
from Rekordbox always fixes this, because a fresh export has a new modified
time.

## Two things worth knowing

### CuePoint does not check that your files are still there

The library records where each track's file was according to Rekordbox. It does
**not** check that the file is still on disk, and a track whose file has moved
or been deleted looks exactly like any other track in CuePoint today. Finding
missing files is a later release.

### inCrate keeps a separate inventory

**inCrate has its own copy of your collection, and importing into one does not
import into the other.** If you use inCrate, you will import your XML twice —
once on the Library page and once in inCrate — and the two can drift apart if
you refresh one and not the other.

This is not an oversight; it is the cost of adding the library underneath a tool
that already had one, without breaking inCrate while doing it. A later release
moves inCrate onto the shared library and this duplication goes away. Until
then, if inCrate's results look out of date, re-import there too.

## Where the data lives

Your library is a single SQLite file in your CuePoint home directory
(`~/.cuepoint/cuepoint.db` on macOS and Linux, `%USERPROFILE%\.cuepoint\` on
Windows). About 20 MB for 50,000 tracks. CuePoint backs it up on launch, and the
Activity panel lists those backups along with every import and refresh — which
is where to look if you want to know what a refresh actually did.

Nothing is uploaded anywhere. The library never leaves your machine.

## See also

- [The CuePoint window](the-window.md) — navigation, search and the status strip
- [Performance](performance.md#the-library) — measured timings at 50,000 tracks
- [Troubleshooting](troubleshooting.md)
