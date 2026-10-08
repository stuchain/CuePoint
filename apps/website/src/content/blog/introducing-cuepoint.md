---
title: "Introducing CuePoint"
description: "CuePoint is a free desktop app that cleans up a Rekordbox library: it matches your tracks to Beatport, fills in what is missing, and keeps your own values."
date: 2026-10-08
image: "../../assets/og/default.png"
imageAlt: "The CuePoint card: the pixel mark and the name CuePoint on a violet background."
tags: ["announcement", "rekordbox", "beatport"]
# Held back until the author approves the text (SITE-10): a draft shows only in preview builds.
draft: true
---

If you have played for a few years, your Rekordbox collection has a few years of mess in it. Keys that are blank. Tempos that are off. Labels spelled three ways. Files that moved when you changed drives.

CuePoint is a free desktop app that helps you clean that up. It does not replace Rekordbox. It sits beside it, reads your collection, and gives you a tidy version to take back.

## How it works

You export your collection from Rekordbox as an XML file and import it into CuePoint. That is the only link between the two. CuePoint never writes to the file you imported, and it never touches Rekordbox's own database.

Then you pick what to clean. Choose a playlist, one of your own Collections, or the whole library, and CuePoint looks each track up on Beatport. It runs in the background, so you can keep working while it goes.

## You decide what changes

CuePoint keeps every Beatport candidate it finds for a track, with a score. When one is a certain match, it accepts it for you and says so. Everything else waits in a review queue. You see your track beside Beatport's candidates, with the differences marked, and you move through them with the keyboard: pick a candidate, accept it or reject it, go to the next.

Once you accept a match, you choose which of Beatport's values to use: key, tempo, genre, label or year. Your choice goes into your own values. Rekordbox's values stay underneath, every change is in the track's history, and you can take any change back.

## Beyond matching

Matching is where most people start, but the app does more around the same library.

- **Keep it clean.** CuePoint checks that your files are where Rekordbox says they are, groups possible duplicates, and counts everything that needs you. It never deletes or moves a file.
- **Find new music.** Discover looks at the artists and labels already in your library and shows you their new tracks and releases on Beatport. It tells you which ones you already own, and keeps a wantlist for the rest.
- **Plan a set.** Prepare lays a set out as a running order, in chapters, with the times you plan. It checks each transition for a tempo jump or a key clash on the Camelot wheel, and suggests tracks that fit a gap. A warning never stops you.
- **Take it back to Rekordbox.** When you are done, CuePoint writes a new Rekordbox XML file with your values, made from a copy of the file you imported, so your cue points and beat grids stay as Rekordbox wrote them. A preview tells you what will be written first.

## What it will not do

It will not delete, move or rename your tracks. It will not write to your audio files unless you choose to write tags, and then only after a preview. It will not change the file you exported from Rekordbox.

## Try it

CuePoint is free. It runs on Windows 10 or newer, and on macOS 12 or newer on Apple Silicon (an Intel build is planned). The site does not offer a download yet: 1.0 is coming, and test builds are on [GitHub Releases](https://github.com/stuchain/CuePoint/releases) for anyone who wants to try one early. The [changelog](../../changelog/) will list what changed in each version.

Start with one playlist, so you can see how matching behaves on your own music. Questions and ideas are welcome as [issues on GitHub](https://github.com/stuchain/CuePoint/issues).
