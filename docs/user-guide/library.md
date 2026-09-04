# Your library

CuePoint keeps its own copy of your Rekordbox collection. Import an XML export
once and CuePoint holds your tracks, your playlists and what is in them, so
everything else it does can start from your actual music instead of asking you
for a file every time.

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
