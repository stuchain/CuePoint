# Known Issues in 1.0.0

What is known not to work as well as it should in CuePoint 1.0.0, and what to do meanwhile. None of these loses data or stops the app being used. Each was checked against the code of this release before it was listed. If you find something that is not here, [open an issue](https://github.com/stuchain/CuePoint/issues/new?template=bug_report.yml) or use **Help > Get help** in the app.

## In the app

### Values written to M4A and MP4 files are not stored where players look

**What happens.** When you sync to files, a track in an M4A or MP4 file gets its Key, Comment, Year, Label, BPM and Genre written, and the file is checked after the write. But the values are stored in the file under CuePoint's own names (`COMM`, `GENR`, `DATE`, `LABE`, `BPM`, `KEY`), not under the names M4A uses for a comment, a genre or a year (`©cmt`, `©gen`, `©day`). So the Comment in particular does not show in Rekordbox or in a player after **Reload Tag**. MP3, FLAC, WAV, AIFF and OGG files are not affected.

**What to do.** Keep the values in CuePoint, or edit an M4A's comment in Rekordbox itself.

### The Missing files list has no right-click menu and no double-click to play

**What happens.** On **Clean > Missing files** a row can be selected, but right-clicking it opens no menu and double-clicking it does nothing, unlike the Library's table. A missing file has nothing to play, so the double-click matters less; the missing piece is a menu with the choices the buttons carry.

**What to do.** Select the row and use the buttons under the list, for example to copy the file's path or show it in its folder.

### Past matches cannot be deleted

**What happens.** **Clean > Past matches** lists every match you ran. A past match can be opened, resumed, matched again and its review list saved, but it cannot be deleted. (A Discover dig can be deleted from Discover.) The list only grows.

**What to do.** Nothing is needed to keep using Clean; a past match you no longer want simply stays in the list.

### The seek slider's tooltip does not say its name

**What happens.** The player's timeline is a slider that a screen reader announces as **Seek**. Its tooltip, shown when you point at it or tab to it, is not "Seek": it says why there is no waveform to draw, and shows nothing when there is one. Every button in the player bar has a tooltip that starts with its spoken name; this is the one control where the two differ.

**What to do.** Nothing needed to use it. See [Accessibility](../user-guide/accessibility.md).

### A stopped engine takes a minute and a half to be restarted

**What happens.** If CuePoint's engine hangs without exiting, the app finds out by asking it whether it is well every 15 seconds and giving up after three misses in a row. A hung engine is restarted about 75 to 85 seconds after it stops answering. An engine that exits is restarted within a few seconds. Nothing saved is lost either way.

**What to do.** Wait; the app restarts it and carries on. **Help > Get help** is there if it happens twice.

## Slower than designed on some systems

### The Statistics Health tab, on Windows

**What happens.** Opening **Statistics > Health** on a 50,000-track library reads in about 640 ms on the Windows build machine; the design target is 500 ms. It reads in 491 ms on Linux and 428 ms on a Mac with Apple Silicon. It is held to a limit of 620 ms (800 ms on Windows) so that it does not fail from noise.

### The waveform work list, on every system

**What happens.** Refilling and counting the waveform analysis work list at 50,000 tracks reads 428 to 476 ms against a 500 ms target, within about 6% of it on every system. It is held to 600 ms.

Both are listed under `above_spec` in `scripts/budgets.json`. Neither is something you would notice while using the app: both happen in the background or on opening a tab.

## About how this release was checked

### The Intel Mac is covered by CI, not by hand

The Intel Mac build is built and tested on every change and has its own scale run, but a person did not check it on a real Intel Mac before release (DEC-308). The Intel Mac runner is 3 to 4 times slower than the other three, so its numbers in [Performance](../user-guide/performance.md) are a worst case. If you use an Intel Mac and something is wrong, please tell us.

### The whole packaged suite does not run in the scale workflow

The scale workflow (`scale.yml`) runs one end-to-end journey against the packaged app, the 50,000-track Library (`libraryScale.spec.ts`), and not the rest of the end-to-end suite. The rest of the suite runs in `desktop-electron.yml`, on every change. So a break that only shows in the packaged app, outside that journey, is not caught by the Monday scale run.
