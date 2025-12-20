# Python 3.14 DLL Fix

## Issue

After building with Python 3.14, the application fails to start with error:
```
Failed to load Python DLL
'C:\Users\Stelios\AppData\Local\Temp\_MEI216922\python314.dll'.
LoadLibrary: The specified module could not be found.
```

## Root Cause

The executable was built with Python 3.14, but `python314.dll` is not being bundled or extracted correctly by PyInstaller.

## Solution Applied

### 1. Enhanced Runtime Hook

Updated `build/runtime_hook_python_dll.py` to:
- Dynamically detect Python version (works with 3.13, 3.14, etc.)
- Search multiple locations for the DLL:
  - Base Python installation (`sys.base_prefix`)
  - Executable directory
  - Common installation paths (C:/Python314, etc.)
- Copy DLL to `_MEIPASS` if missing
- Set PATH environment variable to help Windows find it

### 2. Improved DLL Detection in Spec File

Enhanced the spec file to:
- Better handle base_prefix detection
- Search multiple locations if DLL not found
- Add DLL as both binary and data file

## Testing

1. **Rebuild the application**:
   ```bash
   python scripts/build_pyinstaller.py
   ```

2. **Check build logs** for:
   ```
   [PyInstaller] Detected Python version: 3.14
   [PyInstaller] Looking for DLL: python314.dll
   [PyInstaller] Including Python DLL in binaries: python314.dll
   ```

3. **Test the executable**:
   - The runtime hook should automatically copy the DLL if missing
   - Check `_MEI*` temp directory for `python314.dll`

## If Still Failing

### Option 1: Verify Python 3.14 Installation

```bash
# Check if python314.dll exists
dir C:\Python314\python314.dll
# or
dir C:\Users\Stelios\AppData\Local\Programs\Python\Python314\python314.dll
```

### Option 2: Use One-Directory Mode

If the DLL still isn't extracted, switch to one-directory mode:

1. **Edit `build/pyinstaller.spec`**:
   ```python
   noarchive=True,  # Change from False
   ```

2. **Rebuild**:
   ```bash
   python scripts/build_pyinstaller.py
   ```

3. **Result**: Creates `dist/CuePoint/` with DLL in `_internal/` directory

### Option 3: Check PyInstaller Version

Ensure you're using a recent PyInstaller version:

```bash
pip install --upgrade pyinstaller
pyinstaller --version  # Should be 6.10.0+ for Python 3.13/3.14 support
```

## Files Modified

- `build/runtime_hook_python_dll.py` - Enhanced to handle Python 3.14 and search multiple locations
- `build/pyinstaller.spec` - Improved base_prefix detection
