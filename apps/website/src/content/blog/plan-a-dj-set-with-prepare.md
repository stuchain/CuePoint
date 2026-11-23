---
title: "Plan a DJ set with Prepare, from chapters to set list"
description: "How to build a Set in CuePoint's Prepare page: chapters with target lengths, planned times, transition checks, gap suggestions and a set list to take with you."
date: 2026-11-23
image: "../../assets/og/default.png"
imageAlt: "The CuePoint card: the pixel mark and the name CuePoint on a violet background."
tags: ["how-to", "prepare", "sets"]
---

Some DJs plan every transition. Others pick a pile of tracks and read the room. Most of us sit somewhere in between: a rough shape for the night, a few moments we know we want, and room to change our minds.

CuePoint's [Prepare](../../guide/prepare/) page is built for that middle ground. You lay a set out as a running order, split it into chapters, plan the times you care about, and let CuePoint point out anything that might trip you up. This post walks through it from an empty Set to a set list.

## Start a Set

A **Set** is a running order. It lives in the same tree as your Collections and can be filed in folders beside them. There are a few ways to make one:

- **New Set**, in the menu of the Set's name at the top of Prepare, makes an empty Set and asks for its name.
- **New Set from a list…** copies the tracks of something you already have, such as a Collection, a Smart Collection or a Rekordbox playlist, in its order. Refreshing from Rekordbox later never changes the Set.
- In the Library, select some tracks and choose **New Set from these…** to make a Set of just those.

A track can be in a Set more than once, for a reprise at the end or an intro used twice. Each time it plays is its own entry, with its own times and note.

## Shape it with chapters

A chapter is a part of the Set, such as a warm-up, a peak or a close. Select a track and choose **New chapter** to start one there. Every track belongs to exactly one chapter, and a chapter's tracks always stay together.

Give a chapter a **target length** and a **BPM range** in its dialog. The heading then shows the chapter's planned time against its target, for example "9:00 of 8:00", and CuePoint tells you when a chapter runs over or under, or holds a track outside its range.

If you do not need chapters, you do not have to use them: a Set with a single unnamed chapter is simply a list.

## Plan the times you care about

Each entry can carry a planned **Mix in** and **Mix out** time, typed straight into the table as `m:ss` or `h:mm:ss`, such as `0:30` or `4:30`. Times are optional. An entry is timed when it has an out time, and the running time counts timed entries only. CuePoint never guesses how long an untimed entry will play.

**Starts at** shows when each entry begins, counted from the start of the Set, up to the first entry without an out time. You can also add a note to any entry, like "loop the break", in Track details.

These are your plan, not instructions to the player. **Play Set** plays the Set's tracks in order through the ordinary player, each whole, from start to end.

## Read the warnings

CuePoint checks every transition, every entry and every chapter, and explains what it finds:

- **Into each entry:** a tempo jump, with half and double time counted as fitting, or a key clash, two keys with no relation on the Camelot wheel.
- **On each entry:** a file that was missing when files were last checked, or a planned time past the end of the track.
- **On each chapter:** over or under its target, or tracks outside its BPM range.

A warning never stops anything. You can play, save and export a Set with every warning still open. Once you have heard a mix work, choose **Mark OK** and the warning stays visible but muted. If either track or the value it compared changes later, the warning comes back, because what you marked OK is no longer what is there.

## Fill a gap with suggestions

The panel beside the Set has two tabs, **Suggestions** and **Library**. Select a track and the panel names the gap after it, for example "Insert between “Warm Two” and “Warm One” · Warm-up".

Suggestions are scored against both neighbors: a track must fit the one before the gap and the one after it. Each row shows the tempo step and the track's key, and hovering it gives the full reason, such as "Same key", "Next key" or "Relative key", and a shared genre, label or artist. When nothing fits both sides, the panel says so and offers each side's own list instead. The rule is never loosened to fill a gap.

## Take it with you

When the plan is ready, **Export → Save set list…** writes it as a file:

- **Text** (`.txt`) with each chapter as a heading and each entry with its planned times.
- **CSV** (`.csv`) with one row per entry, ready for a spreadsheet.
- **M3U8** (`.m3u8`), a playlist other players open, without times.

**Export → Copy set list** puts the text form on the clipboard for a message or a post. And **Export → Export to Rekordbox…** writes the Set as one playlist in its running order. Chapters, times and notes stay in CuePoint, since Rekordbox has nowhere to put them. Our post on [taking your changes back to Rekordbox](../take-your-changes-back-to-rekordbox/) covers the export.

Questions and ideas are welcome as [issues on GitHub](https://github.com/stuchain/CuePoint/issues).
