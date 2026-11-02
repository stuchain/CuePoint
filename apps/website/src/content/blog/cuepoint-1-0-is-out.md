---
title: "CuePoint 1.0 is out"
description: "The first full release of CuePoint, the free desktop app that cleans up a Rekordbox library, is ready to download for Windows, Mac and Linux."
date: 2026-11-02
image: "../../assets/og/default.png"
imageAlt: "The CuePoint card: the pixel mark and the name CuePoint on a violet background."
tags: ["announcement", "release"]
---

CuePoint 1.0 is here. It is the first full release of the app, and you can [download it](../../download/) now for Windows, Macs with Apple Silicon, Intel Macs and, as an experiment, Linux. It is free.

If you have not met it yet: CuePoint sits beside Rekordbox and helps you clean up your collection. You export your collection as an XML file, import it, and CuePoint gives you a tidy version to take back. It never writes to the file you imported, never touches Rekordbox's own database, and never moves or deletes your music.

## What is in 1.0

- **Clean.** Match your tracks on Beatport, check each match beside your own track, and choose which of Beatport's values to keep: key, tempo, genre, label or year. Clean also finds files that went missing and groups possible duplicates.
- **Keys.** See the keys across your playlists on the Camelot wheel, and which of your tracks mix with the one you are playing.
- **Discover.** Find new tracks and releases from the artists and labels you already own, with the ones you have marked.
- **Prepare.** Plan a set in chapters with the times you want, and see a warning for every tempo jump or key clash.
- **Player.** Play your tracks with waveforms, loudness and your cue points.
- **Statistics.** See what your library holds, what you play, and what still needs you.
- **Back to Rekordbox.** Write a new XML file with your values, built from a copy of the file you imported, so your cue points and beat grids stay as Rekordbox wrote them.

Libraries of up to 50,000 tracks are supported, and every change keeps its history, so you can take any of them back.

## Since the test builds

The test builds ran from October to now, and 1.0 is better for every one of them. The app keeps backups of your library and can restore one from Settings. It checks its library after a crash and says so. It tells you plainly when the disk is full. It aims at WCAG 2.2 level AA, works with Windows high contrast, and lets you write keys as Camelot, Musical or both. The [changelog](../../changelog/) has the full list.

## Installing it

CuePoint is not signed with a paid developer certificate, so Windows and macOS warn you the first time you open it. The [download page](../../download/) says what you will see and what to choose. You only do that once: after that CuePoint finds new versions itself and installs them when you say so, on Windows and Mac.

## Tell us how it goes

Start with one playlist so you can see how matching behaves on your own music. If something does not work, the [known issues](https://github.com/stuchain/CuePoint/blob/main/docs/release/known-issues.md) list may already have it. If not, [report a bug](../../report-a-bug/) or use **Help > Get help** in the app.
