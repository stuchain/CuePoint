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

## What the colours mean

**Settings → Waveforms** chooses one of two looks; the choice is remembered on
this computer.

- **Three bands** draws the lows, the mids and the highs in colours of their
  own, layered as Rekordbox's three-band view is: the lows in blue, the mids in
  amber over them, the highs in white over those. A kick-heavy section is wide
  and blue; hats and air show as white on top.
- **One colour** draws the whole sound in one colour.

Each column is as tall as the loudest moment in its stretch of the track, so a
short peak is never lost in a narrow column. On top of the waveform:

| You see | It is |
| --- | --- |
| A dimmed part | Already played (the bar and the Inspector), or outside an entry's planned times (Prepare) |
| A thin bright line | Where playback is |
| A coloured line with a lettered flag | A hot cue, A–H, in the colour Rekordbox gave it |
| A thin line without a flag | A memory cue |
| A tinted stretch | A loop |
| Faint vertical lines behind the waveform | The beat grid: a line every bar, or every 4, 8, 16 or 32 bars when bars are too close to draw |

Every theme has its own version of these colours, each readable against its
panels, and a custom theme gets them worked out from its colours. Settings shows
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

**How long it takes.** A first analysis reads every file once. On a recent
desktop that is about 8,000 six-minute tracks an hour, so a 50,000-track
library takes about six hours, and a few thousand tracks take minutes. The
status strip counts it as **Analysing waveforms · 1,234 of 50,000**; hover over
it for the rate and the time left. After that, only new and changed files are
analysed, and a library that has not changed is checked in moments.

**A changed file is analysed again** by itself after the next file check. A file
that could not be read is not tried again until it changes. A file that is
missing (an unplugged drive, say) is not counted as a failure: it is analysed
when it is back.

## Pausing it

The analysis can be paused, and stays paused, after a restart too, until you
resume it:

- from the status strip while it runs (its button is **Pause**);
- from **Settings → Waveforms**;
- from **Clean → Health**, where **Waveforms analysed** says how far it has got.

A paused analysis keeps everything it did. Resuming carries on where it
stopped, not from the start. A track you play or select is still analysed while
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
- **About 5 KB a track**: under 250 MB for 50,000 tracks.

**Settings → Waveforms → Delete waveform data…** deletes it, after saying how
much space it takes and that the whole library will be analysed again; unless
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
