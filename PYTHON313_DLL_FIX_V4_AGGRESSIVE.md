# Python 3.13 DLL Fix - Aggressive Solution (V4)

## Issue Still Persisting

Even after implementing multiple layers of DLL inclusion, the DLL is still not being extracted to the `_MEI*` temporary directory in one-file mode.

## Root Cause Analysis

The problem is that PyInstaller's bootloader for Python 3.13 has a bug where:
1. The DLL may be included in the bundle
2. But it's not extracted to the temporary directory
3. Or it's extracted but to the wrong location

## Aggressive Solution (V4)

### 1. Triple Inclusion Strategy

We now include the DLL in THREE ways:
- **As Binary**: Standard PyInstaller binary inclusion
- **As Data File**: Force extraction by adding as data file
- **Runtime Hook**: Copy DLL if missing at runtime

### 2. Changes Made

#### Spec File Updates
1. **Added DLL as Data File**:
   ```python
   # Also add as data file to ensure extraction
   additional_datas.append((src_path_str, '.'))
   ```

2. **Runtime Hook**:
   - Created `build/runtime_hook_python_dll.py`
   - Runs before Python code executes
   - Checks if DLL exists in `_MEIPASS`
   - Copies DLL from Python installation if missing

#### Files Modified
- `build/pyinstaller.spec` - Added DLL as data file
- `build/runtime_hook_python_dll.py` - NEW runtime hook

### 3. Why This Should Work

- **Binary inclusion**: Standard way PyInstaller handles DLLs
- **Data file inclusion**: Forces PyInstaller to extract the file
- **Runtime hook**: Last resort - copies DLL if extraction failed

## Testing

1. **Rebuild the application**:
   ```bash
   python scripts/build_pyinstaller.py
   ```

2. **Check build logs** for:
   ```
   [PyInstaller] Including Python DLL in binaries: python313.dll
   [PyInstaller]   Also adding as data file to ensure extraction
   ```

3. **Test the executable**:
   - Install the update
   - Launch CuePoint
   - Check if DLL error still occurs

## If Still Failing: One-Directory Mode Workaround

If the issue persists, switch to one-directory mode:

1. **Edit `build/pyinstaller.spec`**:
   ```python
   noarchive=True,  # Change from False to True
   ```

2. **Rebuild**:
   ```bash
   python scripts/build_pyinstaller.py
   ```

3. **Result**: Creates `dist/CuePoint/` directory with:
   - `CuePoint.exe`
   - `_internal/` directory with all dependencies
   - DLL will be in `_internal/` directory

4. **Update installer**: Modify NSIS installer to install the directory instead of single exe

## Alternative: Check if DLL is Actually in Bundle

To verify the DLL is in the bundle:

1. **Use 7-Zip** to extract the executable:
   - Right-click `CuePoint.exe`
   - Open with 7-Zip
   - Check if `python313.dll` is present

2. **If DLL is in bundle but not extracted**:
   - This confirms PyInstaller bootloader bug
   - Use one-directory mode as workaround
   - Or wait for PyInstaller fix

## Next Steps

1. ✅ Rebuild with V4 changes
2. ✅ Test executable
3. ⏭️ If still failing, switch to one-directory mode
4. ⏭️ Report issue to PyInstaller if confirmed bug

## Known Limitations

- One-file mode with Python 3.13 has known extraction issues
- PyInstaller 6.10.0+ supports Python 3.13 but may have bugs
- One-directory mode is more reliable but less convenient
