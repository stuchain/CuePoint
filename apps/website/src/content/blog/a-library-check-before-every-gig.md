---
title: "A library check before every gig"
description: "A short routine for the day before a gig: find missing files, fix them in Rekordbox, and sort out possible duplicates with CuePoint's Clean page."
date: 2026-10-26
image: "../../assets/og/default.png"
imageAlt: "The CuePoint card: the pixel mark and the name CuePoint on a violet background."
tags: ["workflow", "rekordbox", "library"]
---

Most library problems do not show up at home. They show up in the booth: a track that will not load because its file moved when you tidied a folder, or two copies of the same tune, one with your cue points and one without, and you picked the wrong one.

None of that is hard to fix. It is just easy to forget to look. This post is a short routine you can run the day before a gig, using two tabs on CuePoint's [Clean](../../guide/clean/) page: **Missing files** and **Duplicates**.

## Start with a fresh export

CuePoint works from the XML file you export from Rekordbox, so it can only see your library as it was at the last export. If you have added or moved tracks since then, export your collection from Rekordbox again (File, then Export Collection in xml format), open the Library in CuePoint and press **Check for changes**. A preview shows what will change before anything does. The [Library guide](../../guide/library/#refreshing-after-rekordbox-changes) explains the refresh in full.

## Missing files: is everything where Rekordbox says?

After every import and every refresh, CuePoint looks for each track's file where Rekordbox says it is. It runs in the background, so you can keep working. It only looks: nothing is read, moved, renamed or deleted.

Open **Clean ▸ Missing files**. When all is well, the tab says so plainly, "No missing files", with when the last check ran and a **Check again** button. When something is wrong, you get a table of the tracks and the steps to fix them.

There are two kinds of problem:

- **Missing** means nothing is at that path.
- **Unreadable** means something is there but CuePoint cannot open it, usually a permissions problem, or a folder where the file should be.

One thing that saves a lot of worry: an unplugged drive is reported once, not as thousands of missing files. If your music lives on an external drive, plug it in and check again before you read anything into the list.

## Fixing a moved file

The path belongs to Rekordbox, so the fix happens there. CuePoint gives you the three steps on the page:

1. In Rekordbox, right-click the track, choose **Relocate** and point it at the file. **Show in folder** in CuePoint helps you find where it was.
2. In Rekordbox, export your collection as XML again.
3. In CuePoint, choose **Check for changes**. The refresh brings in the new path, and the check that follows confirms the file.

If you have selected a few rows, **Check 12 again** (with your own count) checks only those. In the Library you can also filter by **File status** (Present, Missing, Unreadable or Not checked) to see the same picture alongside your playlists. The [Library guide](../../guide/library/) has the details.

## Duplicates: the same tune, twice

Next, open **Clean ▸ Duplicates**. CuePoint groups tracks that may be the same recording and says why for each group: the same file, the same Beatport track, or the same artist, title and mix. The search runs again after every import, refresh and match, and **Find duplicates** looks again whenever you like.

Not every group is a mistake. You may keep an extended mix and a radio edit on purpose, or a second copy in a different format. For a group you know is fine, choose **Not duplicates** and it stays hidden until its tracks change. **Show groups marked not duplicates** lists them if you change your mind.

For the groups that are real, you can tag them or add them to a Collection straight from the tab, so you can deal with them later in one go. Before it changes many tracks, CuePoint names what it will do and how many, for example **Tag 340 tracks**.

**Nothing is ever merged or deleted.** To remove a duplicate, remove it in Rekordbox and refresh. Your library stays as Rekordbox has it until you decide otherwise.

## Why it is worth doing

A clean run of both tabs means every track you plan to play is where your software thinks it is, and you are not choosing between two copies under pressure. Because the checks repeat after every refresh, the first pass does most of the work, and later ones only show what changed since.

If something on either tab does not make sense, the [troubleshooting guide](../../guide/troubleshooting/) is the next stop, and questions are welcome as [issues on GitHub](https://github.com/stuchain/CuePoint/issues).
