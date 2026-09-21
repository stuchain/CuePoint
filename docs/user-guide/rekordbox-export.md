# Exporting to Rekordbox

Everything you do in CuePoint — the keys and BPMs you corrected, the ratings
you gave, the Collections you built — stays in CuePoint until you export it.
**Export to Rekordbox** writes it into a new Rekordbox XML file that you then
open in Rekordbox.

> **Your cue points and beat grids are kept.** CuePoint does not rebuild your
> collection from its own database. It takes the XML file you imported, copies
> it, and changes only the values you changed in CuePoint. Hot cues, memory
> cues, beat grids and everything else Rekordbox wrote are carried over exactly
> as they were, because nothing touches them.

## What is exported, and what is not

**Exported:**

- Your own **key, BPM, genre, label and year**, and your **rating**, on every
  track where they differ from what the file holds. A track you never changed
  is not touched at all.
- The **Collections and Smart Collections you tick**, as playlists, in a folder
  called `CuePoint` at the top of the playlist tree. A Collection keeps your
  order, and a track you put in it twice appears twice. A Smart Collection is
  exported as the tracks it matches at that moment. Folders you tick bring
  everything filed under them, in the same folder structure.

**Not exported:**

- **Tags, notes and favorites.** Rekordbox's XML has nowhere to put them, so
  they stay in CuePoint. To get a tag into Rekordbox, make a Smart Collection
  whose rule is that tag and export it as a playlist.
- **Your audio files.** An export writes one file — the XML you choose — and
  never opens an audio file. To put your values into the files themselves, use
  [Write tags to files](library.md#writing-tags-to-files).
- **The file you imported.** CuePoint never writes over it. Choosing it as the
  destination is refused.

## Exporting

1. On the **Library** page, open **Collection file ▾** at the top — the menu
   that also holds **Import a different collection…** — and choose **Export to
   Rekordbox…**. Or right-click a Collection, Smart Collection or folder in the
   left pane and choose **Export to Rekordbox…** — it opens with that one
   already ticked.
2. **Choose…** where to save the file. The save dialog opens in the folder your
   last export went to and suggests a name with today's date. It never suggests
   the last file's name, so an export never quietly replaces the previous one.
3. **Tick the Collections** you want as playlists, or none to export only your
   values.
4. **Read the preview.** It is worked out from your library and the file as
   they are now, and it is exactly what the export will write:
   - where the file goes,
   - the file it is made from, and whether that file has changed since you
     imported it,
   - how many tracks the exported file holds and how many get your values,
     field by field,
   - each playlist, where it lands and how many tracks it holds,
   - anything you should know first (below),
   - the key notation.
5. **Export.** The button says what it will do — "Export 3,880 tracks and 4
   playlists". Nothing is written before you press it.

The export runs in the background and shows in the status strip; you can stop
it. A stopped export leaves nothing behind — the file only appears once it is
complete. Afterwards the export is listed in **Activity**, and **Settings →
Rekordbox export** shows where your exports went.

## What the preview may tell you

- **The file has changed since you imported it.** You saved a new export from
  Rekordbox, or edited the file. The preview says what changed and offers
  **Refresh first**, which brings your library in step before you export. You
  can also export anyway: the export is made from the file as it is now.
- **Tracks in the file are not in your CuePoint library.** They are exported
  exactly as they are. A refresh brings them in.
- **Tracks in your library are not in the file.** They cannot be exported —
  there is nothing in the file to change — so playlist entries pointing at them
  are left out, and the preview counts them.
- **Tracks have missing audio files.** They are exported unchanged, and
  Rekordbox will show them as missing too. **Show missing files** opens them on
  the Clean page; fix them in Rekordbox with **Relocate**. If your files have
  never been checked, the preview says so rather than claiming none are
  missing.
- **Your file already has a top-level folder called `CuePoint`.** The playlists
  go into `CuePoint (2)` instead. Nothing is added to your existing folder.

Some things stop an export until they are dealt with, and the preview says what
to do: the file you imported has been moved or deleted (import it again from
where it is now), or another library job — an import, a refresh, a batch edit —
is running (the preview waits for it and answers when it ends).

## Key notation

Keys are written the way Rekordbox writes them (`Am`, `C#`) unless you choose
otherwise. You can choose **Camelot** (`8A`) or **short** (`Amin`).

Choosing either has a consequence the dialog states when you choose it: if you
later **import the exported file into CuePoint**, CuePoint stores those keys as
they are in the file, so the tracks the export rewrote read `8A` while the rest
still read `Am`. If you only open the file in Rekordbox, this does not arise.

The notation you use becomes the default for your next export.

## Opening the export in Rekordbox

Rekordbox does not merge an XML file into your collection. It shows it as a
second library in the tree, called **rekordbox xml**, beside your own:

1. In Rekordbox, open **Preferences → Advanced → Database**, and under
   **rekordbox xml** choose the exported file as the **Imported Library**.
2. If the tree does not show **rekordbox xml**, turn it on under **Preferences
   → View → Layout**.
3. Your playlists are in the `CuePoint` folder inside it. Tracks there carry your
   values; drag them or the playlists into your collection to keep them.

## Settings

**Settings → Rekordbox export** shows the folder the next save dialog opens in,
the key notation the next export starts in, and your recent exports — when each
ran, where it went, and what it wrote. Both remembered values come from your
last export, and change by exporting; export itself is started only from the
Library.

## See also

- [Organizing your library](organization.md) — making the Collections you export
- [Your library](library.md) — importing and refreshing
- [Clean](clean.md) — finding missing files before an export
