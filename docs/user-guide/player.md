# Playing music

CuePoint plays your tracks. Not a preview and not a browser's audio player —
the same engine the audiophile players use, playing the file on your disk at
its own sample rate, gaplessly, and out of whichever audio device you choose.

Nothing plays until you ask it to, and until then the player takes no space at
all. The bar along the bottom appears the first time you play something and
stays for the rest of the session.

## Playing a track

Double-click any row in [your library](library.md). That track starts, and
**the view you were looking at becomes the queue** — filtered, sorted, scoped
to a playlist, in the order on screen. If you had narrowed the library to 40
Techno tracks between 122 and 126 BPM and sorted them by key, that is what is
now queued, in that order.

Right-click a row for the rest:

| Action | What it does |
| --- | --- |
| **Play** | Plays that row, with the current view as the queue |
| **Play next** | Puts it straight after the track playing now |
| **Add to queue** | Puts it at the end |
| **Show in folder** | Opens the file's folder |
| **Copy** | Copies the row as text |

Select several rows first and every one of those acts on the selection, in the
order the table shows them. Right-clicking a row that is *not* part of your
selection acts on that row alone — the same as everywhere else on your
computer.

## The player bar

Along the bottom: what is playing, how far through it is, and the controls.

- **Play/pause, previous, next.** Previous within the first few seconds goes
  back a track; after that it restarts the one playing, which is what you
  meant if you just missed the intro.
- **The position bar** can be dragged to seek.
- **Shuffle** reorders the queue without changing the view it came from.
- **Repeat** cycles off → all → one. Repeat-one replays the current track when
  it *ends*; pressing next still moves on.
- **Volume** is CuePoint's own, separate from your system volume.

Shuffle and repeat are remembered between sessions. What was playing, and where
you had got to, is not — CuePoint starts each session silent, on purpose.

## The queue

Open the queue from the bar. It is a place to work rather than a list to look
at: what has played stays above what is playing, so you can see where you have
been and jump back.

- **Enter** plays the selected track.
- **Alt+Up** / **Alt+Down** move a track through the queue.
- **Delete** removes one.
- Dragging works too.

## From the keyboard

| Key | What it does |
| --- | --- |
| **Space** | Play or pause |
| **Ctrl+Right** / **Ctrl+Left** | Next / previous track |
| **Ctrl+Up** / **Ctrl+Down** | Volume |
| **Alt+Up** / **Alt+Down** | Move a track in the queue |
| **Delete** | Remove a track from the queue |

Space is ignored while you are typing, while a button or a list row has focus,
and while a dialog is open — so it never stops the music halfway through a
search.

Your keyboard's **media keys** (play/pause, next, previous) drive CuePoint
while its window is in front. When you switch to something else they go back to
whatever you switch to: CuePoint does not keep them while it is in the
background.

## Audio output

**Settings → Audio.**

**Output device.** Pick the interface you actually listen through. The list is
read from your machine each time you open the panel, so an interface you just
plugged in is there.

**Exclusive output** (Windows and macOS) takes the device for CuePoint alone
and plays to it directly, bypassing the system mixer: no resampling, no volume
applied by anything else, the file's own format handed to the hardware. While
it is on, other applications cannot use that device. Linux has no equivalent,
so the control is switched off there.

If exclusive output is not available — because another application already has
the device — CuePoint plays through the shared device instead and says so. If
the interface you chose is unplugged, it falls back to your system default and
says that. In both cases **your choice is kept**: plug the interface back in,
restart CuePoint, and it is used again.

## When a track will not play

Files move, drives get unplugged, and CuePoint finds out when it tries to play
one. A track that will not play is skipped, marked in the queue, and the next
one starts.

You get **one message**, not one per track: a disconnected drive with a
thousand tracks queued says "1,000 tracks could not be played" once. If a
single track is the problem it is named. If everything left in the queue fails,
playback stops and says so rather than racing through the rest in silence.

Nothing about this is permanent. A track that failed is played normally the
next time you ask for it — the drive may well be back.

## What CuePoint does not do

- **No crossfade.** Tracks follow each other gaplessly, which is what a
  continuously mixed album or a recorded set needs. Beat-matched crossfading is
  a DJ deck's job, not a library tool's.
- **No resume.** Quitting loses the queue and the position, deliberately.
- **No play counts.** Playing a track in CuePoint changes nothing in your
  library or your Rekordbox collection.
