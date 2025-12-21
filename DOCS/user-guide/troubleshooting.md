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

### Import Takes Too Long

**Problem**: Import process is slow.

**Solutions**:
- Large XML files take time to parse
- Check available disk space
- Close other applications
- Wait for import to complete

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

