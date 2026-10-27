# Workflows

The usual way through CuePoint, from your Rekordbox file to a Set you can play.

## From Rekordbox to a cleaned library

Each step has its own page in this guide; this is the order they come in.

1. **Import.** In Rekordbox, choose **File > Export Collection in XML format**. In
   CuePoint, go to **Library** and choose **Import a Rekordbox file…** (**Ctrl+O**).
   Your tracks and playlists appear when the import finishes, and CuePoint checks in
   the background that your files are where Rekordbox says. See
   [Getting started](getting-started.md#2-import-it).
2. **Clean › Match.** Go to **Clean**. Match opens on **Playlists** (step 1 of 3): tick
   the playlists you want, or **All tracks**, and press **Match N playlists**. Matching
   runs in the background; you can keep working. See [Clean](clean.md#match).
3. **To check.** When the match ends, a **Review** opens for each playlist (step 3 of
   3, **Check and sync**). Tracks CuePoint is certain about are confirmed for you; the
   rest are **To check**. Turn on **To check only**, click a row to open its side
   panel on the Beatport candidates, and untick anything that is wrong. The sidebar's
   **Clean** shows how many tracks still wait. See [Clean](clean.md#review).
4. **Sync to files, or Export to Rekordbox.** Two ways to use what you confirmed:
   - **Sync to files…**, at the bottom right of the Review, writes the ticked values
     (BPM, Genre, Label, Year, Key) into the audio files. Nothing is written before
     **Sync N files**, and **Undo this sync** puts the files back. See
     [Saving values into your files](clean.md#saving-values-into-your-files).
   - **Export to Rekordbox…**, in the Library's header, writes a new Rekordbox XML
     file for Rekordbox to import. Your own Rekordbox file is never changed. See
     [Exporting to Rekordbox](rekordbox-export.md).
5. **Prepare.** Plan a Set from the tracks you cleaned (below).

CuePoint never deletes or moves tracks or files. Every change is listed in
**Activity** (**Ctrl+Shift+A**), where a change to many tracks can be undone.

## Preparing a Set

See [Prepare](prepare.md) for each step in full.

1. Right-click the Collection or playlist the night starts from and choose
   **New Set from a list…**, or select tracks in the Library and choose **New Set
   from these…**
2. On **Prepare**, right-click where each section begins and choose **Start a
   chapter here**; give a chapter a target length and a BPM range from its
   heading's menu
3. Select a track and type its mix-in and mix-out times in the table; the running
   time and **Starts at** follow
4. Select the track before a gap and take a track from **Suggestions**, with
   **Insert here** or a drag
5. Read the **Transition** column; **Mark OK** a warning you have heard and
   are happy with
6. **Play Set** to hear it through, then **Export ▾** to save a set list or
   export it to Rekordbox as one playlist

## Working from the keyboard

The window is a row of panes: the sidebar, the page (and its panes), Track details
or the queue, and the player. The keys work the same on every page:

| Key | Does |
| --- | --- |
| **F6** / **Shift+F6** | Go to the next or previous pane |
| **Up** / **Down** | In a list or table: select the previous or next row |
| **Ctrl+Up** / **Ctrl+Down** | In a track table: move without selecting |
| **Enter** | In the playlist tree: open the playlist. In a track table: play the track |
| **Space** | Play or pause, on every page |
| **Ctrl+Space** | Tick or untick the track, or add it to the selection (on a Mac, **Cmd+click**) |
| **Alt+T** | Go to the newest message, to reach its **Undo** before it goes |
| **Esc** | Close what is open, or let go of the selection |

**F1** lists every key, by page. See [Keyboard shortcuts](the-window.md#keyboard-shortcuts).

## Troubleshooting

1. Check the [Troubleshooting guide](troubleshooting.md)
2. Save a help file (**Help > Get help > Save a help file…**)
3. Check the logs (**Help > Get help > Open logs folder**)
4. Report the problem with the help file attached
