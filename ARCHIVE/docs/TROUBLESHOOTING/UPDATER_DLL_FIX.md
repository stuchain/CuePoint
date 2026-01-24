# Updater DLL Fix - NSIS Installer Issue

## Problem

When updating through the app's built-in updater, the application fails to start with:
```
Failed to load Python DLL
'C:\Users\Stelios\AppData\Local\Temp\_MEI223762\python313.dll'
LoadLibrary: The specified module could not be found.
```

However:
- ✅ Fresh install from GitHub = works fine
- ✅ Manual update (download and install manually) = works fine  
- ❌ Update through app's updater = DLL error

## Root Cause

The issue is with how the NSIS installer handles file replacement during updates:

1. **PyInstaller One-File Executables** are actually archives that contain:
   - The Python interpreter
   - All Python DLLs (including `python313.dll`)
   - All Python modules
   - Application code

2. **When the updater runs**, the NSIS installer uses `File` command to extract the new executable

3. **The Problem**: If the old executable is still locked or being used, NSIS may:
   - Overwrite the file while it's still in use
   - Corrupt the internal archive structure
   - Prevent proper DLL extraction when the new exe runs

4. **Why Manual Install Works**: When you manually install, you:
   - Close the app completely
   - Wait for all processes to end
   - Run the installer fresh
   - Windows has time to release all file locks

5. **Why Updater Fails**: The updater:
   - Closes the app quickly
   - Immediately launches the installer
   - Windows may not have released file locks yet
   - NSIS overwrites a locked file → archive corruption

## The Fix

Updated `scripts/installer.nsi` to:

1. **Delete the old executable BEFORE installing the new one**
   - Uses `Delete /REBOOTOK` to handle locked files
   - Ensures clean file replacement

2. **Add a delay after deletion**
   - `Sleep 500` gives Windows time to release file locks
   - Critical for PyInstaller executables with internal archives

3. **Use explicit output name**
   - `File /oname="$INSTDIR\CuePoint.exe"` ensures clean replacement
   - Prevents partial writes or corruption

## Code Changes

### Before:
```nsis
SetOutPath "$INSTDIR"
File "${DISTDIR}\CuePoint.exe"
```

### After:
```nsis
SetOutPath "$INSTDIR"

; Delete old executable first (prevents file locking issues)
Delete /REBOOTOK "$INSTDIR\CuePoint.exe"

; Wait for Windows to release file locks
Sleep 500

; Install new executable with explicit name
File /oname="$INSTDIR\CuePoint.exe" "${DISTDIR}\CuePoint.exe"
```

## Why This Works

1. **Delete First**: Removes the old file completely before writing new one
2. **/REBOOTOK Flag**: Handles cases where file is still locked (will delete on reboot)
3. **Sleep Delay**: Gives Windows time to release file handles
4. **Explicit Output Name**: Ensures clean file replacement without corruption

## Testing

After this fix:

1. **Test Update Flow**:
   - Install an older version
   - Use the app's updater to install a new version
   - Verify the app launches without DLL errors

2. **Verify File Integrity**:
   - Check that `CuePoint.exe` is properly extracted
   - Verify file size matches the source
   - Test that the app runs correctly

3. **Test Edge Cases**:
   - Update while app is running (should wait for close)
   - Update immediately after closing app
   - Update after app has been closed for a while

## Related Issues

This fix addresses:
- PyInstaller one-file executable corruption during updates
- File locking issues with NSIS installer
- DLL extraction failures after updates
- Archive corruption in PyInstaller bundles

## Prevention

To prevent similar issues in the future:
- Always delete old files before installing new ones in NSIS
- Add delays when replacing executables
- Use `/REBOOTOK` flag for locked files
- Test update flow thoroughly, not just fresh installs

