# DLL Troubleshooting Guide

## Current Status

The DLL error is still occurring even after multiple fixes. This guide helps diagnose and resolve the issue.

## Step 1: Verify DLL is in Executable

First, check if the DLL is actually bundled:

```bash
python scripts/check_dll_in_executable.py
```

Or manually:
1. Install 7-Zip
2. Right-click `CuePoint.exe`
3. Open with 7-Zip
4. Look for `python313.dll` in the archive

### If DLL is NOT in executable:
- The bundling is failing
- Check build logs for DLL inclusion messages
- Verify spec file configuration
- Ensure PyInstaller >= 6.10.0

### If DLL IS in executable but error persists:
- The extraction is failing
- This is a PyInstaller bootloader bug
- Use one-directory mode as workaround

## Step 2: Check Build Logs

When building, look for these messages:

```
[PyInstaller] Including Python DLL in binaries: python313.dll
[PyInstaller]   Also adding as data file to ensure extraction
[PyInstaller] Final check: python313.dll is in binaries list
[PyInstaller] Verified: python313.dll is in binaries list
```

If these messages don't appear, the DLL isn't being included.

## Step 3: Verify PyInstaller Version

```bash
pyinstaller --version
```

Must be >= 6.10.0 for Python 3.13 support.

## Step 4: Try One-Directory Mode

If DLL is in bundle but not extracted, switch to one-directory mode:

1. **Edit `build/pyinstaller.spec`**:
   ```python
   noarchive=True,  # Change from False
   ```

2. **Rebuild**:
   ```bash
   python scripts/build_pyinstaller.py
   ```

3. **Result**: Creates `dist/CuePoint/` with:
   - `CuePoint.exe`
   - `_internal/` directory with DLL

4. **Test**: Run `dist/CuePoint/CuePoint.exe`

## Step 5: Check Temporary Directory

When the error occurs, check the `_MEI*` directory:

1. Error shows: `_MEI213282`
2. Navigate to: `C:\Users\Stelios\AppData\Local\Temp\_MEI213282`
3. Check if `python313.dll` exists there

If DLL is missing from temp directory:
- Extraction is failing
- Use one-directory mode

## Step 6: Alternative Solutions

### Option A: Rebuild PyInstaller Bootloader

```bash
pip uninstall pyinstaller
pip install --no-binary pyinstaller pyinstaller
```

### Option B: Use Different Python Version

Temporarily use Python 3.12 to see if issue is Python 3.13 specific.

### Option C: Report to PyInstaller

If confirmed bug, report to:
- GitHub: https://github.com/pyinstaller/pyinstaller/issues
- Include: Python version, PyInstaller version, error details

## Current Implementation Status

✅ **Implemented**:
- DLL in binaries list (pre-analysis)
- DLL verification (post-analysis)
- DLL as data file (V4)
- Runtime hook (V4)
- Duplicate removal
- Multiple verification checkpoints

⏭️ **Next Steps**:
1. Rebuild with V4 changes
2. Check if DLL is in executable
3. If in executable but not extracted → Use one-directory mode
4. If not in executable → Check build logs and spec file

## Quick Test Commands

```bash
# 1. Check if DLL is in executable
python scripts/check_dll_in_executable.py

# 2. Rebuild
python scripts/build_pyinstaller.py

# 3. Check build logs for DLL messages
# Look for: [PyInstaller] Including Python DLL

# 4. Test executable
dist/CuePoint.exe
```

## Expected Behavior

**If everything works**:
- Build logs show DLL inclusion
- DLL is in executable (verified with 7-Zip or script)
- Executable runs without DLL error
- DLL is extracted to `_MEI*` directory

**If still failing**:
- DLL might be in bundle but not extracted (bootloader bug)
- Switch to one-directory mode
- Or wait for PyInstaller fix
