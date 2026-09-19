# Features

CuePoint keeps your Rekordbox collection in a library of its own, matches it to
Beatport, and helps you keep it clean. For the window around everything —
navigation, search, the Track Inspector, the status strip and the keyboard
shortcuts — see [The CuePoint window](the-window.md).

## The pages

| Page | What it is for | Guide |
| --- | --- | --- |
| **Library** | Your imported Rekordbox collection: browse, search, filter, sort, play, and edit your own values | [Your library](library.md) |
| **Collections** | CuePoint's own Collections and Smart Collections, beside Rekordbox's playlists | [Organizing your library](organization.md) |
| **Clean** | Match tracks on Beatport, review the matches, find missing files and possible duplicates, and see what needs you | [Clean](clean.md) |
| **inCrate** (Tools) | Discover new music on Beatport from the artists and labels in your collection, and build a Beatport playlist | [inCrate](../features/incrate.md) |
| **Settings** | Theme, audio output and the Beatport token inCrate uses | [The CuePoint window](the-window.md#interface-scale-and-theme) |

Music plays in the player along the bottom of the window — see
[Playing music](player.md).

## Core features

### Import from Rekordbox

Export your collection from Rekordbox as XML and import it on the Library page.
A refresh brings in later changes, after showing you what would change. See
[Your library](library.md).

### Match on Beatport

Match a playlist, a Collection, a Smart Collection, a selection or the whole
library. CuePoint keeps every candidate it found, accepts a match on its own
only when it is certain, and leaves the rest for you to review with the
keyboard. See [Clean](clean.md).

### Your values over Rekordbox's

Apply Beatport's key, BPM, genre, label or year, or type your own. Rekordbox's
values stay underneath, every change is in the track's history, and any change
can be taken back. See [Your own values](library.md#your-own-values).

### Keep the library clean

- **Missing files**: checked after every import and refresh; a disconnected
  drive is reported once.
- **Possible duplicates**: grouped by file, Beatport track, or artist, title and
  mix, and never deleted.
- **Health**: a count of everything that needs you, each opening the Library on
  exactly those tracks.
- **Artwork**: read from your files and, for accepted matches, from Beatport.

### Write tags to files

Put your values into the audio files themselves, after a preview, with a record
that lets every file be restored. Rekordbox shows the new values after it
re-reads the files. See [Writing tags to files](library.md#writing-tags-to-files).

### Export

**Export review list…** on the Clean page saves tracks with their match state,
score and Beatport match as CSV, JSON or Excel.

### Organize

Collections, Smart Collections, tags, ratings, favorites and notes, all
CuePoint's own. See [Organizing your library](organization.md).

## What CuePoint never does

- It never writes to your Rekordbox export or database.
- It never deletes, moves or renames a track or a file. Moving a file is done in
  Rekordbox with **Relocate**.
- It never writes to an audio file unless you choose **Write tags to files**,
  after a preview.

## The command line

`python main.py --xml collection.xml --playlist "My Playlist"` matches one
playlist from an XML export and writes CSV files, as it always has. See
[CLI and arguments](../features/cli-and-arguments.md).

## Supported environments and limits

- **Supported OS**: Windows 10+ (x64), macOS 12+ (Intel/Apple Silicon)
- **Rekordbox export**: XML export format from recent Rekordbox versions
- **Library size**: measured at 50,000 tracks — see [Performance](performance.md)
- **Support policy**: see [Support policy](support-policy.md) for update cadence and EOL policy

## Keyboard shortcuts

The full list is in [The CuePoint window](the-window.md#keyboard-shortcuts),
and in the app under **Help → Keyboard shortcuts** (**F1**).
