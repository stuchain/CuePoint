# Python 3.13 DLL Fix - Comprehensive Solution (V3)

## Issue
After installing an update, the application fails to start with error:
```
Failed to load Python DLL
'C:\Users\Stelios\AppData\Local\Temp\_MEI31162\python313.dll'.
LoadLibrary: The specified module could not be found.
```

## Root Cause
PyInstaller with Python 3.13 has a known issue where `python313.dll` is not automatically detected and bundled correctly, even when explicitly added to the binaries list. This is a known limitation even in PyInstaller 6.10.0+ which officially supports Python 3.13. The DLL may be included in the bundle but not properly extracted to the temporary directory (`_MEI*`) when the application runs, or PyInstaller may fail to detect it during the analysis phase.

**Community Solution**: The recommended approach is to manually include the DLL in the spec file's `binaries` list using the 2-tuple format: `(src_path, dest_dir)` where `dest_dir` is `'.'` to place it in the root of the bundle.

## Solution Applied (V3)

### 1. Enhanced Spec File Configuration
Updated `build/pyinstaller.spec` with multiple layers of DLL inclusion:

#### Pre-Analysis Binary Collection
- Adds Python DLL to `binaries` list before Analysis phase
- Uses 2-tuple format: `(src_path, dest_dir)` for Analysis constructor
- Places DLL in root (`.`) so it extracts to `_MEIPASS` root

#### Post-Analysis Verification and Addition
- After Analysis, verifies DLL is in binaries list
- If missing, adds it using 3-tuple format: `(name_in_bundle, full_path, 'BINARY')`
- Checks both exact name match and case-insensitive match

#### Duplicate Removal and Final Verification
- Removes duplicate binaries to avoid conflicts
- Performs final verification before PYZ creation
- Emergency re-addition if DLL is still missing after cleanup

#### Pre-EXE Creation Verification
- Final check before EXE creation
- Logs warning if DLL is not found
- Provides detailed debugging information

### 2. Custom Hook File
Created `build/hook-python313.py` as a PyInstaller hook:
- Automatically collects Python DLLs for Windows
- Includes both `python313.dll` and `python3.dll`
- Includes critical VCRUNTIME DLLs if needed
- Hook is automatically loaded via `hookspath` in spec file

### 3. Build Process Improvements
- Spec file now includes hooks directory in `hookspath`
- Multiple verification points throughout build process
- Detailed logging at each step for debugging

## Code Changes

### `build/pyinstaller.spec`
1. Added hooks directory to `hookspath`:
   ```python
   hooks_dir = project_root / 'build'
   hookspath = [str(hooks_dir)] if hooks_dir.exists() else []
   ```

2. Enhanced duplicate removal and final verification:
   ```python
   # Remove duplicate binaries
   seen_binaries = {}
   unique_binaries = []
   for binary in a.binaries:
       binary_name = binary[0].lower() if isinstance(binary[0], str) else str(binary[0]).lower()
       if binary_name not in seen_binaries:
           seen_binaries[binary_name] = True
           unique_binaries.append(binary)
   a.binaries = unique_binaries
   
   # Final verification with emergency re-addition
   if not dll_found:
       a.binaries.insert(0, (python_dll_name, str(python_dll_path), 'BINARY'))
   ```

### `build/hook-python313.py` (NEW)
- PyInstaller hook that automatically includes Python DLLs
- Runs during Analysis phase
- Provides additional layer of DLL inclusion

## Testing Steps

1. **Rebuild the application**:
   ```bash
   python scripts/build_pyinstaller.py
   ```

2. **Check build logs** for messages like:
   ```
   [PyInstaller] Including Python DLL in binaries: python313.dll
   [PyInstaller] Python DLL already found in binaries: python313.dll -> .
   [PyInstaller] Final check: python313.dll is in binaries list
   [PyInstaller] Verified: python313.dll is in binaries list
   ```

3. **Test the built executable**:
   - Install the update
   - Launch CuePoint from the installer
   - Verify it starts without DLL error

4. **If issue persists**, check:
   - PyInstaller version (should be >= 6.0.0 for Python 3.13 support)
   - Build logs for any warnings about missing DLL
   - Verify `python313.dll` exists in Python installation directory

## PyInstaller Version Requirements

**Minimum Version**: PyInstaller >= 6.10.0 (for Python 3.13 support)

**Important**: Python 3.13 support was officially added in PyInstaller 6.10.0, released on August 10, 2024. Earlier versions do NOT support Python 3.13.

To update PyInstaller:
```bash
pip install --upgrade pyinstaller
```

To verify your version:
```bash
pyinstaller --version
```

You should see version 6.10.0 or higher.

## Additional Troubleshooting

### If DLL is still not found after rebuild:

1. **Verify DLL exists in Python installation**:
   ```bash
   dir C:\Python313\python313.dll
   # or
   dir C:\Users\<username>\AppData\Local\Programs\Python\Python313\python313.dll
   ```

2. **Check PyInstaller version**:
   ```bash
   pyinstaller --version
   ```

3. **Try one-directory mode** (temporary workaround):
   - In `build/pyinstaller.spec`, change `noarchive=False` to `noarchive=True`
   - This creates a directory with the exe and all dependencies
   - DLL will be in the `_internal` directory

4. **Check VC++ Redistributable**:
   - Ensure Visual C++ Redistributable 2015-2022 is installed
   - Download from: https://aka.ms/vs/17/release/vc_redist.x64.exe

5. **Verify DLL in built executable** (advanced):
   - Use 7-Zip or similar to extract the executable
   - Check if `python313.dll` is present in the archive

## Related Files
- `build/pyinstaller.spec` - Main build configuration (updated)
- `build/hook-python313.py` - PyInstaller hook for DLL inclusion (new)
- `.github/workflows/build-windows.yml` - CI build workflow
- `requirements-dev.txt` - Development dependencies (check PyInstaller version)

## Next Steps After Fix

1. ✅ Rebuild application with updated spec file
2. ✅ Test update flow (install update, launch app)
3. ✅ Verify DLL error is resolved
4. ✅ If still failing, check PyInstaller version and update if needed
5. ✅ Consider reporting issue to PyInstaller if it persists with latest version

## Known Limitations

- This fix works around PyInstaller's Python 3.13 DLL detection issues
- If PyInstaller's bootloader has bugs with Python 3.13, this may not fully resolve the issue
- Consider downgrading to Python 3.12 if the issue cannot be resolved
- Alternative: Use one-directory mode instead of one-file mode
