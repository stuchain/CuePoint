# Getting Started

This guide takes you from installing CuePoint to a first set of matched, reviewed tracks.

## Install

Download the installer for your system from [GitHub Releases](https://github.com/stuchain/CuePoint/releases). The [Support Policy](support-policy.md) lists the supported systems.

- **macOS**: open the DMG, drag CuePoint to Applications, and open it from there. Use the Apple Silicon download on a Mac with an M-series chip and the Intel download on an Intel Mac. Apple menu > About This Mac shows which you have.
- **Windows**: run the installer and follow the steps. Start CuePoint from the Start menu.
- **Linux**: make the AppImage executable with `chmod +x <file>.AppImage`, then run it. The Linux build is experimental and has no bundled player.

If macOS says the app is damaged or cannot be opened, the build is unsigned. Run `xattr -cr /Applications/CuePoint.app` in Terminal and open it again. You do this for the first download only. Windows builds are unsigned too, so SmartScreen may warn you: choose **More info**, then **Run anyway**.

This is the only time you need to do that. After the first install, CuePoint finds and installs new versions itself on Windows and Mac, and your library stays where it is. See [Updates](updates.md). On Linux, you download new versions yourself.

## First run

CuePoint opens with a short guide of four steps: what CuePoint does; how to bring in your Rekordbox file (four small drawings show the export from Rekordbox step by step; **Import a Rekordbox file...** closes the guide and starts the import, and **How do I get one?** shows the same steps in words); matching your tracks on Beatport (**Match on Beatport...** is off until a library is imported, and says so; once on, it closes the guide and opens Clean's match window); and signing in to Beatport, which is optional (**Sign in to Beatport** opens Beatport's own page and the guide stays open). A step that is already done says so, for example "306 tracks imported", "236 confirmed" or "Signed in", each with a tick. While a step's own job is still to do, its button is the main one and **Next** sits beside it. Clicking outside the guide does not close it. The **×** in its corner, or **Esc**, ends it, and so does **Done** on the last step; there is no separate Skip button. Open it again, always from its first step, with **Help > Getting started…**.

On a new install CuePoint also picks a size for your screen: Small (1.25×) on a screen shorter than 860 pixels, Medium (1.5×) otherwise. Change it in **Settings > Appearance** or **View > Size**.

Once the guide is closed, the Library also shows **First steps**, a checklist that ticks itself: import your collection, match your tracks on Beatport, play a track, and sign in to Beatport (optional). Before you import it is the whole page below the header, and its first step has **Import a Rekordbox file…** and **How do I get one?**. After you import, it is a small **First steps 2/4** chip beside the Library heading; click it to see the list (with **Match on Beatport...**), and press **Esc** or click elsewhere to close it. Once all four are done it never shows again.

If you updated from an earlier version, CuePoint shows one note the first time you start it, **What changed**. It says that CuePoint is now Medium size (1.5×) with **Change size** (only if you never chose a size), and that keys now come only from Beatport, with how many of your tracks have a key and **Match tracks...**. It does not appear again.

### 1. Export your collection from Rekordbox

In Rekordbox, choose **File > Export Collection in xml format** and save the file somewhere easy to find. **Help > How to get your Rekordbox file...** shows the same steps.

### 2. Import it

1. Open CuePoint and go to **Library**.
2. Choose **Import a Rekordbox file...** and pick the XML file.
3. Your tracks and playlists appear when the import finishes. The status strip at the bottom shows its progress, and **Activity** in the sidebar lists each step.

CuePoint then checks, in the background, that your files are where Rekordbox says they are.

### 3. Match on Beatport

1. Go to **Clean**.
2. Clean opens on **Playlists**, step 1 of 3 (**Tick playlists**). Tick the playlists you want (or **All tracks** to match everything) and press **Match N playlists**. When it ends, a **Review** opens for each playlist (step 3, **Check and sync**). Later, come back here and do the same.

Matching runs in the background, so you can keep working. Tracks CuePoint is certain about are confirmed for you. The rest are marked **To check** in the review that opens when the match ends.

### 4. Check the matches

1. When a match ends on Clean, it opens **Review** for each playlist: a plain table with your track, the Beatport match (the part that differs is marked) and a tick. **Confirmed** tracks start ticked; tracks with **No match** cannot be.
2. **Untick** a track to leave it out. Click a row to open a side panel on the Beatport candidates: **Use this match** picks another one, **Search Beatport** looks for it yourself, **None of these, leave it out** unticks it. **Up** and **Down** move along the table, **Enter** plays a track, **Space** ticks it and **Esc** closes the panel.
3. Press the green **Sync to files…** at the bottom right. Choose which values go into the files (BPM, Genre, Label, Year, Key), look at **See every change**, then **Sync N files** (it reads **Nothing to sync** when no file would change). Nothing is written before that, and **Undo this sync** puts the files back.

### 5. Beatport's values

Syncing copies the values of the Beatport matches you left ticked into your own values and then into the files, in one recorded step. The key needs no choice beyond its tick: a confirmed match gives it, and a key you typed yourself is never replaced. Rekordbox's values stay underneath, and you can undo any change from the track's History.

CuePoint never deletes or moves tracks or files, and never writes to your Rekordbox file.

## Good habits

- **Start small.** Match one playlist first, so you see how matching behaves on your music.
- **Review before you apply.** Look at each candidate beside your track before you correct it.
- **Find a track fast.** Press **Ctrl+K** to search your whole library (**Enter** opens a result in the Library, **Shift+Enter** plays it), or **Ctrl+F** to search the table in front of you. All shortcuts are in [The CuePoint window](the-window.md#keyboard-shortcuts).
- **Save your work.** **Save review list as a file…** on the Clean page saves the list as a spreadsheet or JSON. To put your values into the audio files, see [Syncing to files](library.md#syncing-to-files); Rekordbox shows them after **Reload Tag**.

## CLI quick start

The command line works on an XML file directly:

```bash
python main.py --xml "collection.xml" --playlist "My Playlist"
```

Optional flags:

- `--output-dir PATH` sets where the output goes. The default folder is `Documents/CuePoint_Output` on Windows, macOS and Linux.
- `--preflight-only` (or `--dry-run`) runs the preflight checks and exits.
- `--run-summary-json PATH` writes the run summary as JSON.
- `--preflight-report PATH` writes the preflight report as JSON.

## Configuration examples

Settings live in `~/.cuepoint/config.yaml`. These are some of the keys (the desktop app keeps whether you have seen the guide in its own storage, not here):

```yaml
product:
  preflight_enabled: true
  last_xml_path: ""
  last_output_dir: ""
  default_playlist: ""

run_summary:
  write_json: true
  json_path: ""
```

## Help and privacy

Use **Help > Privacy** to open Settings → Privacy, where the data-handling controls are; its **More about this** button explains what a report carries and has a **Privacy details** link.

If something goes wrong, see [Troubleshooting](troubleshooting.md) and the [FAQ](../faq/index.md). You can also [report an issue](https://github.com/stuchain/CuePoint/issues) or ask in [Discussions](https://github.com/stuchain/CuePoint/discussions).

## Next steps

- [Your library](library.md): importing, browsing and Track details.
- [Keys](keys.md): the keys in your playlists, Collections and Sets.
- [Clean](clean.md): matching and review in detail.
- [The CuePoint window](the-window.md): the sidebar, the status strip and shortcuts.
