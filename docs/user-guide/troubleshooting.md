# Troubleshooting

Common issues and solutions.

## Import Issues

### XML File Not Loading

**Problem**: XML file doesn't import or shows error.

**Solutions**:
- Verify XML file is valid Rekordbox format
- Check file isn't corrupted
- Check the file is no larger than 100 MiB. CuePoint refuses bigger XML files
- Try exporting XML from Rekordbox again

### Preflight Errors

**Problem**: A command-line run stops at the preflight checks, or `--preflight-only` reports errors.

The desktop app does not run preflight. The CLI runs it when `product.preflight_enabled` is `true` in `~/.cuepoint/config.yaml`, and always for `--preflight-only` (or `--dry-run`). `--no-preflight` skips it. Each issue prints as `code: message`. `--preflight-report PATH` writes them as JSON.

**Solutions**:
- **XML file not found**: reselect the XML export file and confirm the path
- **XML unreadable**: check file permissions and ensure the file isn't locked
- **Playlist not found**: choose a playlist name that exists in the XML
- **Playlist empty**: export a playlist that contains tracks
- **Output not writable**: pick a writable folder (Documents/CuePoint_Output by default)
- **Config invalid** (`CONFIG_INVALID`): the message names the key, for example `beatport.max_retries must be >= 0`. Correct that value in your configuration file, or remove it to get the default

**Common Error Codes**:

| Code | Meaning | Fix |
| --- | --- | --- |
| P001 | XML file not found | Reselect the XML file |
| P002 | XML path is a directory | Select the XML file, not a folder |
| P003 | XML unreadable | Check permissions and file lock |
| P004 | XML empty, extension is not `.xml`, or over 100 MiB (a warning) | Re-export from Rekordbox |
| P005 | XML parse error / invalid root | Re-export from Rekordbox |
| P006 | Path too long | Move file to a shorter path |
| P010 | Playlist not found | Select a valid playlist |
| P011 | Playlist empty | Pick a playlist with tracks |
| P012 | Playlist name duplicated/invalid | Rename playlist in Rekordbox |
| P020 | Output folder not found, or it cannot be created | Choose a folder whose parent exists |
| P021 | Output not writable | Choose a writable folder |
| P022 | Insufficient free space | Free disk space or change output folder |
| P023 | Output path too long | Use a shorter output path |
| P024 | Output in install path | Choose a user-owned folder |
| P030 | A worker count is below 1 | Set `performance.track_workers`, `performance.candidate_workers` and `performance.max_workers` to 1 or more |
| P031 | The per-track time budget is below 1 second | Set `performance.time_budget_sec` to 1 or more |
| P032 | Retry count is below 0 | Set `beatport.max_retries` to 0 or more |
| P033 | A cache setting is invalid, or the cache folder is not writable | Use cache TTLs of 0 or more and `performance.cache_max_mb` of 100 or more, and make the cache folder writable |
| P034 | Output format invalid | Set `export.default_format` to `csv`, `json`, `excel` or `xlsx` |
| P050 | Network unavailable | Connect to the internet to search Beatport |
| P001 (perf) | Runtime budget exceeded | The run stops after 120 minutes (`performance.runtime_max_minutes`); split it into smaller batches |
| P002 (perf) | Memory budget exceeded | The run stops at 2048 MB; lower `--max-workers` or process fewer tracks |

P001 (perf) and P002 (perf) appear in the log, not in the preflight output.

### Import Takes Too Long

**Problem**: Import process is slow.

**Solutions**:
- Large XML files take time to parse
- Check available disk space
- Close other applications
- Wait for import to complete

## Network and Reliability

### Retry and Backoff Policy (External Search)

The command line retries a failed Beatport search or track fetch, with exponential backoff. This helps recover from short network problems.

**Policy**:
- **Max retries**: 3 by default (`reliability.max_retries`). `--max-retries N` sets it for one run.
- **Backoff**: The delay starts at 0.5 seconds and doubles on each retry, plus up to 0.25 seconds of random jitter.

**Time budget**:
- Per track: 45 seconds by default (`performance.time_budget_sec`). `--fast` lowers it to 15 seconds.

### Circuit Breaker

After 5 failed requests in a row, CuePoint stops sending Beatport requests for 30 seconds. During that time they fail at once with "Paused due to repeated failures." After 30 seconds it tries one request, and if that works, searching carries on. There is no dialog and nothing to click.

### Network Offline / Limited Connectivity

If you start processing with no internet connection:
- **Preflight** blocks a command-line run with P050: "Network unavailable. Connect to the internet to search Beatport." This check runs only when preflight is on, and `product.preflight_network_check: false` turns it off
- Ensure your network is stable before starting long runs

### Resume After Interruption

If a Beatport match is interrupted in the desktop app, it is listed in **Activity** with **Resume**, which matches only the tracks it had not reached. See [Clean](clean.md#matching).

If a command-line run is interrupted:
- Run the same command again with `--resume` to continue from the last checkpoint. `--no-resume` ignores the checkpoint and starts fresh.
- Checkpoints are saved every 50 tracks by default (`--checkpoint-every N`, or `reliability.checkpoint_every`).

## Processing Issues

### No Matches Found

**Problem**: No tracks are matched during processing.

**Solutions**:
- Check internet connection
- Verify track names are correct
- Some tracks may not be on Beatport
- Try processing again

### Low Match Scores

**Problem**: Match scores are consistently low.

**Solutions**:
- Track names may have typos in XML
- Remix names may not match exactly
- Some tracks may not be on Beatport
- Manual review may be needed

### Processing Stuck

**Problem**: Processing appears to hang.

**Solutions**:
- Wait a few minutes (processing can be slow)
- Check internet connection
- Check logs for errors
- Restart application if needed

## Export Issues

### Export Fails

**Problem**: Export doesn't complete or shows error.

**Solutions**:
- Check disk space
- Verify destination folder is writable
- Check file isn't open in another program
- Try different export format

### Export File Empty

**Problem**: Exported file has no data.

**Solutions**:
- Check that there are match results to export
- Verify export format is correct
- Try exporting again

## Performance Issues

### Application Slow

**Problem**: Application is slow or unresponsive.

**Solutions**:
- Close other applications
- Check available RAM
- Process smaller batches
- Restart application

### High Memory Usage

**Problem**: Application uses too much memory.

**Solutions**:
- Process tracks in smaller batches
- Close other applications
- Restart application periodically
- Check for memory leaks (report if found)

## Known Issues

### No in-app updates

**Problem**: There is no "Check for updates" action, and the app never offers a new version.

**Cause**: The app has no auto-updater yet. It is planned for a later release.

**Workaround**: Download the latest installer from [Releases](https://github.com/stuchain/CuePoint/releases) and install it over your current version.

### Large XML Exports May Be Slow

**Problem**: Processing stalls or takes very long for large XML files.

**Cause**: Memory and disk reads grow with the size of the file.

**Workaround**: Split the work by playlist, use `--fast` from the CLI (`python main.py --fast ...`), and make sure there is enough free RAM.

## Diagnostics and Support

The **Help** menu has the tools you need to find out what went wrong and to report it.

- **Diagnostics...** shows whether the engine is connected, its version and the session ID.
- **Log Viewer...** shows the application log. Filter by **Level**, **Search** the text, turn on **Auto-refresh**, or use **Refresh**, **Clear logs**, **Export...** (saves what you see to a text file) and **Open logs folder**.
- **Export support bundle...** (then **Generate Bundle**) saves a ZIP with diagnostics, logs and your configuration with sensitive values removed, and shows it in your file manager. From the CLI, run `python main.py --export-support-bundle`; it prints the path of the bundle.
- **Privacy...** sets whether the cache and logs are cleared when you quit, and clears them now. See the [Privacy Notice](../policy/privacy-notice.md).

If something goes wrong, the log and the support bundle are the first things to look at. The CLI prints a run ID and the log path at the start and end of a run.

## Getting More Help

If these solutions don't help:

1. Generate a support bundle (**Help > Export support bundle...**)
2. Check the logs (**Help > Log Viewer...**, then **Open logs folder**)
3. [Report Issue](https://github.com/stuchain/CuePoint/issues/new?template=bug_report.yml) on GitHub and attach the bundle
4. Ask in [Discussions](https://github.com/stuchain/CuePoint/discussions)

How quickly to expect an answer is in the [Support SLA](../policy/support-sla.md).
