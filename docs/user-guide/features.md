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
| **Discover** | Find new music on Beatport from your artists and labels, keep a wantlist, push tracks to a Beatport playlist, open an artist's or label's page, and find similar tracks in your library | [Discover](discover.md) |
| **Prepare** | Plan a set: a running order in chapters, with planned times, transition checks, suggestions for any gap, and set lists | [Prepare](prepare.md) |
| **Settings** | One page in sections: theme and size, playback output, waveforms, the Beatport token Discover uses, where Rekordbox exports go, privacy and the version | [The CuePoint window](the-window.md#settings), [Privacy and error reports](the-window.md#privacy-and-error-reports) |

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

### Export to Rekordbox

**Export to Rekordbox…** in the Library's **Collection file** menu, or on a
Collection's right-click menu, writes a new Rekordbox XML file carrying your key, BPM, genre, label, year
and rating, and the Collections you choose as playlists. It is made by patching
a copy of the file you imported, so **cue points and beat grids are kept**
exactly as Rekordbox wrote them. A preview says what will be written first;
tags, notes and favorites are not exported; the imported file is never written.
See [Exporting to Rekordbox](rekordbox-export.md).

### Export a review list

**Export review list…** on the Clean page saves tracks with their match state,
score and Beatport match as CSV, JSON or Excel.

### Organize

Collections, Smart Collections, tags, ratings, favorites and notes, all
CuePoint's own. See [Organizing your library](organization.md).

### Prepare a set

A Set is a running order: tracks in chapters, each with the in and out times
you plan, a running time that counts what you timed, and a check on every
transition that explains itself and never blocks. Suggestions fit a track
between any two, the Set plays as the queue, and it saves as a text, CSV or
M3U8 set list or exports to Rekordbox as one playlist. Chapters, times and notes
stay in CuePoint. See [Prepare](prepare.md).

### See every track's waveform

CuePoint works out a waveform for every track whose file it finds, in the
background, and draws it in the player bar (where a click seeks), the
Inspector, a Library column and Prepare's transition strip, in three frequency
bands or one color, with Rekordbox's cue points and beat grid on it. The
analysis can be paused and carries on after a restart. See
[Waveforms](waveforms.md).

## What CuePoint never does

- It never writes to the Rekordbox XML you imported, or to Rekordbox's
  database. An export to Rekordbox is always a new file you choose.
- It never deletes, moves or renames a track or a file. Moving a file is done in
  Rekordbox with **Relocate**.
- It never writes to an audio file unless you choose **Write tags to files**,
  after a preview.

## The command line

`python main.py --xml collection.xml --playlist "My Playlist"` matches one
playlist from an XML export and writes CSV files, as it always has. See
[CLI and arguments](../features/cli-and-arguments.md).

## Supported environments and limits

- **Supported OS**: Windows 10+ (x64), macOS 12+ (Apple Silicon; an Intel build is planned)
- **Rekordbox export**: XML export format from recent Rekordbox versions
- **Library size**: measured at 50,000 tracks — see [Performance](performance.md)
- **Support policy**: see [Support policy](support-policy.md) for update cadence and EOL policy

## Keyboard shortcuts

The full list is in [The CuePoint window](the-window.md#keyboard-shortcuts),
and in the app under **Help → Shortcuts** (**F1**).
