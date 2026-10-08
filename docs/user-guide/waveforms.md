# Waveforms

A waveform shows a track's shape before you hear it: where the breakdown is, how
long the intro runs, where the drop lands. CuePoint draws one for every track
whose file it can find, from the audio itself, and shows it in four places: the
player bar, the Inspector, a Library column and Prepare's transition strip.

Each is the whole track at once, with a line where playback is. There is no
zoomed, scrolling view.

## Where you see them

**The player bar.** The playing track's waveform fills the space between the
two times, and it is how you seek: click anywhere on it to jump there, or drag
across it and let go to jump once. The part already played is dimmed. The
keyboard and screen readers seek exactly as they did with the slider, which is
still there underneath. Until the waveform is ready, the bar shows the plain
slider, and hovering it says why. See [Playing music](player.md#waveforms).

**The Inspector.** The selected track's waveform sits under its title, with its
hot cues (each with its letter), memory cues, loops and beat grid. When that
track is the one playing, the playhead is drawn and a click seeks; otherwise
the waveform is only a picture, and clicking it does not start playback
(double-click the row for that). A track without a waveform says why in words:
"Waiting for analysis", "Analysis paused", "File missing", "This file could not
be read" and so on.

**The Library.** **Columns…** offers a **Waveform** column, hidden until you
choose it. Each row draws its track at the column's width; drag the column wider
for more detail. A row without one shows a single muted word ("Waiting",
"Paused", "Missing", "Unreadable", "Unchecked"), with the reason on hover.

**Prepare.** **View ▾ → Show transition strip** draws the selected entry's
waveform beside the next one's, so you can see how one track ends and the next
begins. See [Prepare](prepare.md#the-transition-strip).

## Loudness

The pass that draws a track's waveform also measures how loud the track is, as
a single number for the whole track, the way mastering engineers and streaming
services measure it. CuePoint shows it in three places:

- **The Inspector**, on one line under the waveform: "Loudness −8.4 LUFS ·
  Peak −0.3 dBFS".
- **The Library**: **Columns…** offers a **Loudness** column, hidden until you
  choose it. It shows the number alone ("−8.4"), with the whole line on hover. A
  copy of the rows carries it with its unit ("−8.4 LUFS").
- **Prepare's transition strip**: each track's loudness ends its title line, and
  the words between the two halves say how much louder or quieter the next
  track is: "+2.1 LU". See [Prepare](prepare.md#the-transition-strip).

**Reading the numbers.**

- **LUFS** is loudness as you hear it, over the whole track: closer to zero is
  louder. A loud club master sits around −6 to −9 LUFS; a dynamic one, or an
  older record, around −12 to −16.
- **The peak, in dBFS,** is the single highest sample in the file. 0.0 dBFS is
  the most a file can hold, so a peak at or next to 0.0 means the track was
  mastered to the top.
- **LU** is a difference in loudness: "+2.1 LU" means the next track is 2.1 LU
  louder than the one before it, which you would hear when you mix from one to
  the other.

Some tracks have no number, and say why:

- **"Too quiet or too short to measure"** (the column says "Quiet"): silence, or
  a file shorter than four tenths of a second, which is the shortest stretch
  the measurement works on.
- **"Silent"**: not one sample above zero.
- **"Loudness is measured with the next analysis"**: the waveform is there, and
  the loudness is still to come (see below).

**It changes nothing.** CuePoint never turns a track up or down for its
loudness, in the player or anywhere else, and never writes it to your files or
to Rekordbox. The number is there for you to read; gain is yours and the
mixer's. The column cannot be sorted by, for now.

**A library analyzed before CuePoint measured loudness** keeps every waveform.
Each track is measured once more, in the background, after any track that has
no waveform yet; until then its waveform is drawn as before, and the Inspector
says the loudness is still to come. A track you select or play while it waits
is measured first.

## What the colors mean

**Settings → Waveforms → Colors** chooses one of two looks; the choice is
remembered on this computer. **Reset to defaults** goes back to Three bands,
after asking, with **Undo**.

- **Three bands** draws the lows, the mids and the highs in colors of their
  own, layered as Rekordbox's three-band view is: the lows in blue, the mids in
  amber over them, the highs in white over those. A kick-heavy section is wide
  and blue; hats and air show as white on top.
- **One color** draws the whole sound in one color.

Each column is as tall as the loudest moment in its stretch of the track, so a
short peak is never lost in a narrow column. On top of the waveform:

| You see | It is |
| --- | --- |
| A dimmed part | Already played (the bar and the Inspector), or outside an entry's planned times (Prepare) |
| A thin bright line | Where playback is |
| A colored line with a lettered flag | A hot cue, A–H, in the color Rekordbox gave it |
| A thin line without a flag | A memory cue |
| A tinted stretch | A loop |
| Faint vertical lines behind the waveform | The beat grid: a line every bar, or every 4, 8, 16 or 32 bars when bars are too close to draw |

Every theme has its own version of these colors, each readable against its
panels, and a custom theme gets them worked out from its colors. Settings shows
a preview: the track in the player, with its cues, grid and playhead, so you can
judge the choice on music you know.

## How they are made

CuePoint works waveforms out itself, from your audio files, with the same
decoder the player uses. It reads none of Rekordbox's own analysis files.

**It starts on its own.** After every import, refresh or file check, CuePoint
analyses each file that check found in its place, in the background, at low
priority, so playback and browsing are not held up. Tracks in your Sets come
first, then tracks in your Collections, then the rest, newest first. A track
you play or select while it waits jumps the queue.

**How long it takes.** A first analysis reads every file once, measuring its
loudness as it goes. On a recent desktop that is about 6,000 six-minute tracks
an hour, so a 50,000-track library takes about eight and a half hours, and a few
thousand tracks take minutes. The
status strip counts it as **Analyzing waveforms · 1,234 of 50,000**; hover over
it for the rate and the time left. After that, only new and changed files are
analyzed, and a library that has not changed is checked in moments.

**A changed file is analyzed again** by itself after the next file check. A file
that could not be read is not tried again until it changes. A file that is
missing (an unplugged drive, say) is not counted as a failure: it is analyzed
when it is back.

## Pausing it

The analysis can be paused, and stays paused, after a restart too, until you
resume it:

- from the status strip while it runs (its button is **Pause**);
- from **Settings → Waveforms**;
- from **Clean → Health**, where **Waveforms analysed** says how far it has got.

A paused analysis keeps everything it did. Resuming carries on where it
stopped, not from the start. A track you play or select is still analyzed while
the rest is paused, so the waveform you are looking at appears.

It also steps aside on its own for an import, a refresh, a file check or a tag
write, and carries on after them.

## Cue points and beat grids are Rekordbox's

The cues, loops and beat grids on a waveform are the ones in your Rekordbox
export, read on every import and refresh. CuePoint shows them and never changes
them: there is nowhere to edit one, and an export to Rekordbox never writes them.
To move a cue, move it in Rekordbox and refresh. The Inspector lists them in
words under the waveform.

## Where the data lives

Waveforms are kept in `waveforms.db`, beside your library in CuePoint's folder
(`~/.cuepoint/` on macOS and Linux, `%USERPROFILE%\.cuepoint\` on Windows).

- **It is not part of your backups.** It can always be made again from your
  files, so the launch backup leaves it out rather than copying a few hundred
  megabytes every time. Restoring a backup keeps it, and every track finds its
  waveform again by its file.
- **"Clear cache" leaves it alone**, and so does clearing the cache on exit:
  making it again takes hours.
- **It is not in the support bundle.**
- **About 5 KB a track**, its loudness included: about 250 MB for 50,000
  tracks, and less for real music, which packs tighter than the test data
  this was measured with.

**Settings → Waveforms → Disk space → Delete waveform data…** (under the
**Disk space** disclosure, which says how much room waveforms take) deletes it, the loudness
measured with each waveform too, after saying how much space it takes and that
the whole library will be analyzed again; unless
the analysis is paused, that starts at once. Your cue points, beat grids and
everything else in your library are untouched. You never need this to fix a
changed file.

## When there are no waveforms

A build without the player's decoder says so once, in words: "Waveforms need the
player's decoder, which this build does not include". Nothing else errors, and
the bar keeps its plain slider. On Linux, CuePoint does not include the player;
name your own `mpv` with `CUEPOINT_MPV_PATH` and both playback and waveforms
work.

## See also

- [Playing music](player.md) — the player bar.
- [Your library](library.md) — the Inspector and the columns.
- [Prepare](prepare.md) — the transition strip.
- [Clean](clean.md) — the Health view.
- [Performance](performance.md#waveforms) — the measurements.
