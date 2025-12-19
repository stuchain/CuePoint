# Build Differences Between Local and GitHub

## Key Differences Identified

### 1. Python Version
- **GitHub Actions**: Python 3.11
- **Local Build**: Python 3.13 (from your build output)

This difference could potentially affect:
- PyInstaller behavior
- Module bundling
- Runtime behavior

### 2. Build Process
- **GitHub**: Creates an installer (NSIS) that packages the exe
- **Local**: Builds the exe directly

The installer might:
- Extract files to a different location
- Set different permissions
- Create different file paths

### 3. Dependencies
Both use `requirements-build.txt`, but:
- GitHub installs fresh dependencies each time
- Local might have cached or different versions

## Diagnostic Tools Added

### 1. Diagnostic Dialog on Button Click
When you click "Download & Install", you'll see:
- Button connection status
- Update info availability
- Parent window references
- Any errors that occurred

### 2. Right-Click Context Menu
Right-click the "Download & Install" button to see:
- "Show Diagnostics (Test Connection)" - shows connection status without triggering download

### 3. Enhanced Logging
All button clicks and errors are now logged with:
- Build environment info
- Full tracebacks
- Connection status

## How to Debug

### Step 1: Check the Diagnostic Dialog
1. Run the GitHub-built app
2. Check for updates
3. Click "Download & Install"
4. Review the diagnostic information shown

### Step 2: Check Logs
Logs are written to:
- Windows: `%APPDATA%\CuePoint\logs\cuepoint.log`
- Or check the diagnostic dialog for log file location

### Step 3: Compare Builds
Run this script on both builds:
```bash
python scripts/compare_build_environments.py
```

## What to Look For

The diagnostic dialog will show:
1. **Button Connection Status**
   - ✓ Connected: Button should work
   - ✗ NOT Connected: This is the problem!

2. **Update Info Status**
   - ✓ Available: Download URL is present
   - ✗ Missing: Update info wasn't stored properly

3. **Parent Window Status**
   - ✓ References dialog: Main window knows about the dialog
   - ✗ Missing reference: Dialog wasn't registered with main window

## Common Issues

### Issue 1: Button Not Connected
**Symptom**: Diagnostic shows "✗ NOT CONNECTED"
**Cause**: `_on_update_available` callback wasn't called or failed silently
**Fix**: Check if `update_manager.set_on_update_available()` was called

### Issue 2: Update Info Missing
**Symptom**: Diagnostic shows "✗ update_info is None"
**Cause**: `set_update_found()` wasn't called or update_info wasn't stored
**Fix**: Check if `_on_update_available` callback received update_info

### Issue 3: Parent Window Missing
**Symptom**: Diagnostic shows "✗ No parent window"
**Cause**: Dialog wasn't created with parent parameter
**Fix**: Ensure `show_update_check_dialog()` is called with `parent=self`

## Next Steps

1. **Test the GitHub build** with the new diagnostic dialog
2. **Share the diagnostic output** - it will show exactly what's wrong
3. **Check the logs** for any errors that occurred during button connection
4. **Compare environments** using the comparison script

The diagnostic dialog should reveal the exact issue preventing the button from working in the GitHub build.
