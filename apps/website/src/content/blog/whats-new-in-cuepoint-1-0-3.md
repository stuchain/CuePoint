---
title: "What's new in CuePoint 1.0.1 to 1.0.3"
description: "Three quick updates since 1.0: big Rekordbox exports import, the Windows player starts on more PCs, and the app stays responsive while it makes waveforms."
date: 2026-11-16
image: "../../assets/og/default.png"
imageAlt: "The CuePoint card: the pixel mark and the name CuePoint on a violet background."
tags: ["release", "update"]
---

CuePoint 1.0 came out on 2 November. Since then there have been three small updates, 1.0.1, 1.0.2 and 1.0.3, each fixing problems people ran into with the version before. None of them changes how you use the app. They make it start, play and import more reliably.

If you already have CuePoint on Windows or a Mac, you do not need to do anything: installed copies offer the update on their own. If you have not tried it yet, the [download page](../../download/) has 1.0.3.

## Bigger Rekordbox exports now import (1.0.1)

A large collection could be turned away. One 2.6 GB Rekordbox export was refused as too large. The desktop app now reads a collection of up to 4 GB for an import, a refresh and an export. A file bigger than that gets a plain message saying so, with a reminder to check that it is your Rekordbox collection export.

Large imports also need far less memory. Before, every track's cue points and beat grid stayed in memory until the tracks were written, which added up quickly on a big library with detailed beat grids. They now go to a temporary file as they are read and are written back in batches, so memory no longer grows with the file. What is stored is the same.

Exporting back to Rekordbox got lighter too. It now needs about the size of the source file in memory, not three times it, and the file it writes is byte for byte the same as before. If you have not used the export yet, our post on [taking your changes back to Rekordbox](../take-your-changes-back-to-rekordbox/) walks through it.

## A steadier player on a Mac (1.0.1)

On a Mac, a Stop from Control Center, headphones or a remote could make the player quit. It now ignores those, and CuePoint keeps handling media keys itself.

## The Windows player starts on more PCs (1.0.2 and 1.0.3)

Two missing Windows parts could stop the player before it played a note.

- **The Visual C++ runtime.** Windows does not include it, and on a PC without it the player stopped at once. CuePoint 1.0.2 ships the files the player needs alongside it.
- **The Vulkan loader.** It normally comes with the graphics driver, and on some PCs it was not there. CuePoint 1.0.3 ships it next to the player.

If Windows still cannot start the player, CuePoint now says so plainly and suggests reinstalling, or updating Windows and the graphics driver, instead of retrying.

## Large libraries stay responsive (1.0.2 and 1.0.3)

Two fixes help most with a big, freshly imported library:

- **The artwork scan** no longer holds every cover of a batch in memory at once. It keeps only what it needs from each picture as it reads, and records the same result.
- **Waveform progress** is now asked for once for the whole app, not by every open view on its own. Before, a large library could keep the engine too busy to answer while waveforms were being made.

## A patient start (1.0.3)

On a slow PC, CuePoint's engine could take a while to start, and the app gave up too early and stayed on "Starting". The app now waits longer, picks the engine up as soon as it answers, and tries one fresh start before saying it failed.

## One change for older Macs

From 1.0.2, **Macs with Apple Silicon need macOS 15 or newer**, like Intel Macs already did. The player inside CuePoint moved to a newer build that is no longer made for macOS 14 on Apple Silicon. A Mac on macOS 14 keeps 1.0.1, and its update check says why instead of installing.

## The full list

The [changelog](../../changelog/) has every detail for each version. If something still does not work for you, please tell us as an [issue on GitHub](https://github.com/stuchain/CuePoint/issues).
