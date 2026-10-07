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

CuePoint opens with a short tour. You can skip it, and open it again from **Help > Getting started...**.

### 1. Export your collection from Rekordbox

In Rekordbox, choose **File > Export Collection in xml format** and save the file somewhere easy to find. The **Help** menu in CuePoint has the same steps under **Rekordbox XML export...**.

### 2. Import it

1. Open CuePoint and go to **Library**.
2. Choose **Import a collection...** and pick the XML file.
3. Your tracks and playlists appear when the import finishes. The status strip at the bottom shows its progress.

CuePoint then checks, in the background, that your files are where Rekordbox says they are.

### 3. Match on Beatport

1. Go to **Clean**.
2. In **In**, choose the playlist to match, or leave it on the whole library.
3. Choose **Show what is not matched**, then **Match all**.

Matching runs in the background, so you can keep working. Tracks CuePoint is certain about are accepted for you. The rest wait under **Needs review**.

### 4. Review

1. In **Show**, choose **Needs review**.
2. Select a track. The comparison below shows it beside Beatport's candidates, with differences marked.
3. Press **Left** or **Right** to choose a candidate and **A** to accept it, or **R** to reject the match. **Down** moves to the next track.

### 5. Use Beatport's values

For an accepted match, **Apply from the accepted match** copies the fields you tick (key, BPM, genre, label, year) into your own values. Rekordbox's values stay underneath, and you can revert any change from the track's History.

CuePoint never deletes or moves tracks or files, and never writes to your Rekordbox export.

## Good habits

- **Start small.** Match one playlist first, so you see how matching behaves on your music.
- **Review before you apply.** Look at each candidate beside your track before you accept it.
- **Find a track fast.** Press **Ctrl+K** to search your whole library, or **Ctrl+F** to search the table in front of you. All shortcuts are in [The CuePoint window](the-window.md#keyboard-shortcuts).
- **Save your work.** **Export review list...** on the Clean page saves the list as CSV, JSON or Excel. To put your values into the audio files, see [Writing tags to files](library.md#writing-tags-to-files); Rekordbox shows them after **Reload Tag**.

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

Settings live in `~/.cuepoint/config.yaml`. These are some of the keys:

```yaml
product:
  onboarding_seen: false
  preflight_enabled: true
  last_xml_path: ""
  last_output_dir: ""
  default_playlist: ""

run_summary:
  write_json: true
  json_path: ""
```

## Help and privacy

Use **Help > Privacy...** for a summary of data handling and controls.

If something goes wrong, see [Troubleshooting](troubleshooting.md) and the [FAQ](../faq/index.md). You can also [report an issue](https://github.com/stuchain/CuePoint/issues) or ask in [Discussions](https://github.com/stuchain/CuePoint/discussions).

## Next steps

- [Your library](library.md): importing, browsing and the Inspector.
- [Clean](clean.md): matching and review in detail.
- [The CuePoint window](the-window.md): the sidebar, the status strip and shortcuts.
