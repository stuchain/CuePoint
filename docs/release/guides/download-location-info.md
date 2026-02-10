# Download Location Information

## Where Downloads Are Saved

When you click "Download & Install" in the update dialog, the installer file is downloaded to:

### Windows:
```
%TEMP%\CuePoint_Updates\
```

**Full path example:**
```
C:\Users\YourUsername\AppData\Local\Temp\CuePoint_Updates\CuePoint-Setup-v1.0.1-test14.exe
```

### macOS:
```
/tmp/CuePoint_Updates/
```

**Full path example:**
```
/tmp/CuePoint_Updates/CuePoint-v1.0.1-test14.dmg
```

## How to Access

### Windows:
1. Press `Win + R` to open Run dialog
2. Type: `%TEMP%\CuePoint_Updates`
3. Press Enter

Or navigate to:
```
C:\Users\[YourUsername]\AppData\Local\Temp\CuePoint_Updates
```

### macOS:
1. Open Finder
2. Press `Cmd + Shift + G` (Go to Folder)
3. Type: `/tmp/CuePoint_Updates`
4. Press Enter

## File Cleanup

- Downloaded files are stored in the temp directory
- Old files are automatically removed before new downloads
- Cancelled downloads are cleaned up
- Files remain after successful installation (in case you need to reinstall)

## Troubleshooting

If the download doesn't start:

1. **Check the logs** - Look for error messages in the application logs
2. **Verify the download URL** - The URL should be a GitHub Releases URL
3. **Check network connectivity** - Ensure you can access GitHub
4. **Check the download directory** - Ensure the temp directory is writable

## Download URL Format

The download URL should be in this format:
```
https://github.com/stuchain/CuePoint/releases/download/v{VERSION}/{FILENAME}
```

Example:
```
https://github.com/stuchain/CuePoint/releases/download/v1.0.1-test14/CuePoint-Setup-v1.0.1-test14.exe
```
