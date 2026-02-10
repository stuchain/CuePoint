# Troubleshooting

Common issues and solutions.

## Import Issues

### XML File Not Loading

**Problem**: XML file doesn't import or shows error.

**Solutions**:
- Verify XML file is valid Rekordbox format
- Check file isn't corrupted
- Ensure file isn't too large (> 100MB)
- Try exporting XML from Rekordbox again

### Preflight Errors

**Problem**: Preflight checks block the run.

**Solutions**:
- **XML file not found**: reselect the XML export file and confirm the path
- **XML unreadable**: check file permissions and ensure the file isn't locked
- **Playlist not found**: choose a playlist name that exists in the XML
- **Playlist empty**: export a playlist that contains tracks
- **Output not writable**: pick a writable folder (Documents/CuePoint_Output by default)
- **Config invalid**: reset to defaults in Settings and retry

**Common Error Codes**:

| Code | Meaning | Fix |
| --- | --- | --- |
| P001 | XML file not found | Reselect the XML file |
| P002 | XML path is a directory | Select the XML file, not a folder |
| P003 | XML unreadable | Check permissions and file lock |
| P004 | XML empty or extension mismatch | Re-export from Rekordbox |
| P005 | XML parse error / invalid root | Re-export from Rekordbox |
| P006 | Path too long | Move file to a shorter path |
| P010 | Playlist not found | Select a valid playlist |
| P011 | Playlist empty | Pick a playlist with tracks |
| P012 | Playlist name duplicated/invalid | Rename playlist in Rekordbox |
| P020 | Output folder not found | Choose/create a valid folder |
| P021 | Output not writable | Choose a writable folder |
| P022 | Insufficient free space | Free disk space or change output folder |
| P023 | Output path too long | Use a shorter output path |
| P024 | Output in install path | Choose a user-owned folder |
| P030 | Concurrency invalid | Reset settings to defaults |
| P031 | Timeout invalid | Reset settings to defaults |
| P032 | Retry invalid | Reset settings to defaults |
| P033 | Cache TTL invalid | Reset settings to defaults |
| P034 | Output format invalid | Reset export format to CSV |
| P040 | Preflight unknown error | Try again or re-export XML |
| P050 | Network unavailable | Connect to the internet to search Beatport |
| P001 (perf) | Runtime budget exceeded | Run stopped after 2 hours; split into smaller batches |
| P002 (perf) | Memory budget exceeded | Lower concurrency or process fewer tracks |
| O001 | Crash captured | Crash log saved; use Help > Export Support Bundle |
| O002 | Support bundle creation failed | Check disk space; open logs folder manually |
| O003 | Redaction failure | Logs may contain paths; sanitize before sharing |

### Import Takes Too Long

**Problem**: Import process is slow.

**Solutions**:
- Large XML files take time to parse
- Check available disk space
- Close other applications
- Wait for import to complete

## Network and Reliability

### Retry and Backoff Policy (External Search)

CuePoint uses automatic retries with exponential backoff when searching Beatport or fetching track data. This helps recover from transient network issues.

**Policy**:
- **Max retries**: 3 attempts (configurable in Settings > Advanced > Reliability)
- **Backoff**: Delay doubles each retry (0.5s, 1s, 2s...) with random jitter
- **Retried errors**: Timeouts, connection errors, 5xx server errors, rate limits (429)
- **Not retried**: 404 (not found), invalid responses

**Timeouts**:
- Connect: 5 seconds
- Read: 30 seconds
- Per-track budget: 60 seconds (configurable)

### Circuit Breaker

After 5 consecutive network failures, processing pauses for 30 seconds. A dialog appears: "Paused due to repeated failures." Click **Retry now** to resume, or wait for the automatic recovery period.

### Network Offline / Limited Connectivity

If you start processing with no internet connection:
- **Preflight** will warn or block: "Network unavailable - connect to the internet to search Beatport"
- During processing, status may show "Retrying..." or "Limited connectivity" while the app retries
- Ensure your network is stable before starting long runs

### Resume After Interruption

If the app crashes or is closed during processing:
- On next launch, you may see "Resume previous run?"
- Checkpoints are saved every 50 tracks (configurable)
- Output files are never left partially corrupted (atomic writes)

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
- Ensure tracks are selected
- Check match results exist
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

## Getting More Help

If these solutions don't help:

1. Generate support bundle (Help > Export Support Bundle)
2. Check logs (Help > Open Logs Folder)
3. [Report Issue](https://github.com/stuchain/CuePoint/issues/new?template=bug_report.yml) on GitHub
4. Ask in [Discussions](https://github.com/stuchain/CuePoint/discussions)

