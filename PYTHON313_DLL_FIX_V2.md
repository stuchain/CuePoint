# Python 3.13 DLL Fix - Updated Approach

## Issue
After installing an update, the application fails to start with error:
```
Failed to load Python DLL
'C:\Users\Stelios\AppData\Local\Temp\_MEI155682\python313.dll'.
LoadLibrary: The specified module could not be found.
```

## Root Cause
PyInstaller with Python 3.13 has a known issue where `python313.dll` is not automatically detected and bundled correctly, even when explicitly added to the binaries list.

## Solution Applied

### 1. Pre-Analysis Binary Collection
Added Python DLL to `binaries` list before Analysis phase:
```python
binaries = []
if is_windows:
    python_dll_name = f'python{sys.version_info.major}{sys.version_info.minor}.dll'
    python_dll_path = python_dir / python_dll_name
    if python_dll_path.exists():
        binaries.append((str(python_dll_path), '.'))
```

### 2. Post-Analysis Verification and Addition
After Analysis, verify DLL is included, and add it if missing:
```python
if is_windows:
    dll_found = False
    for binary in a.binaries:
        if python_dll_name.lower() in str(binary[0]).lower():
            dll_found = True
            break
    
    if not dll_found:
        a.binaries.append((python_dll_name, str(python_dll_path), 'BINARY'))
```

### 3. Pre-EXE Creation Verification
Before creating the EXE, verify the DLL is in the binaries list:
```python
dll_in_binaries = any(python_dll_name.lower() in str(b[0]).lower() for b in a.binaries)
if not dll_in_binaries:
    print(f"WARNING: {python_dll_name} not found in binaries!")
```

## Additional Troubleshooting

If the issue persists after rebuilding:

1. **Check PyInstaller Version**: Ensure you're using a recent version that supports Python 3.13
   ```bash
   pip install --upgrade pyinstaller
   ```

2. **Verify DLL Location**: Check that `python313.dll` exists in your Python installation:
   ```bash
   dir C:\Python313\python313.dll
   ```

3. **Check Build Logs**: Look for messages like:
   ```
   [PyInstaller] Including Python DLL: python313.dll
   [PyInstaller] Verified: python313.dll is in binaries list
   ```

4. **Alternative: Use One-Directory Mode**: If one-file mode continues to have issues, consider using one-directory mode temporarily:
   - Change `noarchive=False` to `noarchive=True` in the spec file
   - This creates a directory with the exe and all dependencies

5. **Check VC++ Redistributable**: Ensure Visual C++ Redistributable is installed on the target system

## Next Steps

1. Rebuild the application with the updated spec file
2. Check build logs for DLL inclusion messages
3. Test the built executable
4. If still failing, check the `_MEI*` temp directory to see if the DLL is actually extracted

## Related Files
- `build/pyinstaller.spec` - Updated with triple-check for Python DLL inclusion
- `.github/workflows/build-windows.yml` - Build workflow
