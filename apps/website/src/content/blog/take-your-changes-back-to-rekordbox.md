---
title: "Take your CuePoint changes back to Rekordbox"
description: "How Export to Rekordbox writes your keys, BPMs and Collections into a new XML file, keeps your cue points and beat grids, and how to open it in Rekordbox."
date: 2026-11-02
image: "../../assets/og/default.png"
imageAlt: "The CuePoint card: the pixel mark and the name CuePoint on a violet background."
tags: ["how-to", "rekordbox", "export"]
---

Cleaning a library is only half the job. The keys you corrected, the ratings you gave and the Collections you built are worth most when they are back in Rekordbox, where you play from.

Everything you do in CuePoint stays in CuePoint until you export it. **Export to Rekordbox** writes it into a new Rekordbox XML file that you then open in Rekordbox. This post walks through what goes into that file, how to make one, and how to bring it into Rekordbox.

## Your cue points and beat grids are safe

This is the part people worry about first, so it comes first. CuePoint does not rebuild your collection from its own database. It takes the XML file you imported, copies it, and changes only the values you changed in CuePoint. Hot cues, memory cues, beat grids and everything else Rekordbox wrote are carried over exactly as they were, because nothing touches them.

It also never writes over the file you imported. Choosing that file as the destination is refused.

## What goes into the file

**Exported:**

- Your own **key, BPM, genre, label and year**, and your **rating**, on every track where they differ from what the file holds. A track you never changed is not touched at all.
- The **Collections and Smart Collections you tick**, as playlists in a folder called `CuePoint` at the top of the playlist tree. A Collection keeps your order. A Smart Collection is exported as the tracks it matches at that moment.
- The **Sets you tick**, each as one playlist in its running order.

**Not exported:**

- **Tags, notes and favorites.** Rekordbox's XML has nowhere to put them. A handy trick: make a [Smart Collection](../../guide/organization/) whose rule is that tag, and export it as a playlist.
- **A Set's plan.** Chapters, planned times and notes stay in CuePoint. The playlist is the running order and nothing else.
- **Your audio files.** An export writes one file, the XML you choose, and never opens an audio file.

## Making an export

1. On the **Library** page, click **Export to Rekordbox…** in the header. You can also right-click a Collection, Smart Collection, Set or folder in the left pane and choose **Export to Rekordbox…**, which opens with that one already ticked.
2. **Choose…** where to save the file. The save dialog suggests a name with today's date, and never the last file's name, so an export never quietly replaces the previous one.
3. **Read the summary.** One line says how many tracks the export holds, how many get your values and how many playlists it adds.
4. **Open Details** to tick the Collections and Sets you want as playlists, or none to export only your values. Details also shows each playlist, where it lands and how many tracks it holds.
5. **Export.** The button says what it will do, for example "Export 3,880 tracks and 4 playlists". Nothing is written before you press it.

The export runs in the background and you can stop it. A stopped export leaves nothing behind: the file only appears once it is complete.

## When the preview warns you

The preview checks your library against the file as it is now, and a few warnings always show:

- **The file has changed since you imported it.** Maybe you saved a new export from Rekordbox. The preview offers **Refresh first**, which brings your library in step before you export.
- **Tracks have missing audio files.** They are exported unchanged, and Rekordbox will show them as missing too. **Show missing files** opens them on the Clean page. Our post on [a library check before every gig](../a-library-check-before-every-gig/) covers fixing them.
- **Your file already has a top-level folder called `CuePoint`.** The playlists go into `CuePoint (2)` instead, and nothing is added to your existing folder.

## Choosing a key notation

Keys are written the way Rekordbox writes them (`Am`, `C#`) unless you choose **Camelot** (`8A`) or **short** (`Amin`) under Details. The key written is the track's own, yours or else its confirmed Beatport match's. A track with neither keeps the key Rekordbox already has in the file, so the export never blanks a key.

One thing to know: if you choose Camelot or short and later import the exported file back into CuePoint, the rewritten tracks read `8A` while the rest still read `Am`. The dialog tells you this when you choose. If you only open the file in Rekordbox, it does not come up.

## Opening it in Rekordbox

Rekordbox does not merge an XML file into your collection. It shows it as a second library in the tree, called **rekordbox xml**:

1. In Rekordbox, open **Preferences → Advanced → Database**, and under **rekordbox xml** choose the exported file as the **Imported Library**.
2. If the tree does not show **rekordbox xml**, turn it on under **Preferences → View → Layout**.
3. Your playlists are in the `CuePoint` folder inside it. Drag the tracks or playlists into your collection to keep them.

The [export guide](../../guide/rekordbox-export/) has every detail, including where **Settings → Rekordbox** lists your recent exports. Questions and ideas are welcome as [issues on GitHub](https://github.com/stuchain/CuePoint/issues).
