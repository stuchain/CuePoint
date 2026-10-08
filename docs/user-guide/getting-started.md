# Getting Started

This guide takes you from installing CuePoint to a first set of matched, reviewed tracks.

## Install

Download the installer for your system from [GitHub Releases](https://github.com/stuchain/CuePoint/releases). The [Support Policy](support-policy.md) lists the supported systems.

- **macOS**: open the DMG, drag CuePoint to Applications, and open it from there.
- **Windows**: run the installer and follow the steps. Start CuePoint from the Start menu.
- **Linux**: make the AppImage executable with `chmod +x <file>.AppImage`, then run it. The Linux build is experimental and has no bundled player.

If macOS says the app is damaged or cannot be opened, the build is unsigned. Run `xattr -cr /Applications/CuePoint.app` in Terminal and open it again. Windows builds are unsigned too, so SmartScreen may warn you: choose **More info**, then **Run anyway**.

CuePoint does not update itself yet. To get a new version, download the new installer and install it over the old one. Your library stays where it is.

## First run

CuePoint opens with a short guide of five screens: what CuePoint does, how to get your collection out of Rekordbox (**Show me how**), how to import it (**Import your Rekordbox collection...** closes the guide and starts the import), how to match your tracks on Beatport (**Match tracks...** opens Clean's match window), and where everything is. Clicking outside the guide does not close it. **Skip** ends it, and **Esc** or the close button closes it for now and shows it again at the next start. Open it again, always from its first screen, with **Help > Getting started**.

The Library also shows **First steps**, a checklist that ticks itself: import your collection, match your tracks, play a track, and add your Beatport token. Before you import it is listed on the page. After you import, it is one entry on the line above the filters, **First steps: 2 of 4 done**; click it to see the list (with **Match tracks...**), and press **Esc** or click elsewhere to close it. When another note, such as the one about your music files being checked, is on that line, that note stays and First steps comes back when the line is free. Once all four are done it never shows again.

If you updated from an earlier version, CuePoint shows one note the first time you start it, **What changed**. It says that CuePoint is now Medium size (1.5×) with **Change size** (only if you never chose a size), and that keys now come only from Beatport, with how many of your tracks have a key and **Match tracks...**. It does not appear again.

### 1. Export your collection from Rekordbox

In Rekordbox, choose **File > Export Collection in xml format** and save the file somewhere easy to find. **Help > Troubleshooting > How to export from Rekordbox...** shows the same steps.

### 2. Import it

1. Open CuePoint and go to **Library**.
2. Choose **Import your Rekordbox collection...** and pick the XML file.
3. Your tracks and playlists appear when the import finishes. The status strip at the bottom shows its progress.

CuePoint then checks, in the background, that your files are where Rekordbox says they are.

### 3. Match on Beatport

1. Go to **Clean**.
2. In **In**, choose the playlist to match, or leave it on the whole library.
3. The first time, choose **Match all N tracks**, then **Start matching** with **Tracks not looked up yet** chosen. To start with one playlist instead, choose **Match tracks…** in the header, then **Tracks in chosen playlists, Collections or Sets**, and tick the playlist. Later, use **Match tracks…** the same way.

Matching runs in the background, so you can keep working. Tracks CuePoint is certain about are accepted for you. The rest wait under **Waiting for you**.

### 4. Review

1. In **Show**, choose **Waiting for you**.
2. Select a track. The comparison below shows it beside Beatport's candidates, with differences marked.
3. Press **Left** or **Right** to choose a candidate and **A** to accept it, or **R** to reject the match. **Down** moves to the next track.

### 5. Use Beatport's values

For an accepted match, **Apply from the accepted match** copies the fields you tick (BPM, genre, label, year) into your own values. The key needs no apply: an accepted match gives it. Rekordbox's values stay underneath, and you can revert any change from the track's History.

CuePoint never deletes or moves tracks or files, and never writes to your Rekordbox export.

## Good habits

- **Start small.** Match one playlist first, so you see how matching behaves on your music.
- **Review before you apply.** Look at each candidate beside your track before you accept it.
- **Find a track fast.** Press **Ctrl+K** to search your whole library (**Enter** opens a result in the Library, **Shift+Enter** plays it), or **Ctrl+F** to search the table in front of you. All shortcuts are in [The CuePoint window](the-window.md#keyboard-shortcuts).
- **Save your work.** **Save review list as a file…** on the Clean page saves the list as a spreadsheet or JSON. To put your values into the audio files, see [Writing tags to files](library.md#writing-tags-to-files); Rekordbox shows them after **Reload Tag**.

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

Use **Help > Privacy** to open Settings → Privacy, where the data-handling controls are; its **Privacy details** button gives a summary.

If something goes wrong, see [Troubleshooting](troubleshooting.md) and the [FAQ](../faq/index.md). You can also [report an issue](https://github.com/stuchain/CuePoint/issues) or ask in [Discussions](https://github.com/stuchain/CuePoint/discussions).

## Next steps

- [Your library](library.md): importing, browsing and Track details.
- [Keys](keys.md): the keys in your playlists, Collections and Sets.
- [Clean](clean.md): matching and review in detail.
- [The CuePoint window](the-window.md): the sidebar, the status strip and shortcuts.
