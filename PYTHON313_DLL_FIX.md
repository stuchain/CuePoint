# Python 3.13 DLL Fix

## Issue
After installing an update, the application fails to start with error:
```
Failed to load Python DLL
'C:\Users\Stelios\AppData\Local\Temp\_MEI267242\python313.dll'.
LoadLibrary: The specified module could not be found.
```

## Root Cause
PyInstaller with Python 3.13 sometimes fails to automatically detect and bundle `python313.dll`. This is a known issue with newer Python versions.

## Solution
Updated `build/pyinstaller.spec` to explicitly include the Python DLL in the binaries list.

### Changes Made

1. **Explicit Python DLL Inclusion**
   - Added code to detect and include `python313.dll` (or `python3XX.dll` for current version)
   - Also includes `python3.dll` if present
   - Places DLLs in the root of the bundle (`.`)

2. **Critical DLLs from DLLs Directory**
   - Includes VCRUNTIME DLLs from Python's DLLs directory
   - These are sometimes needed by Python extensions

### Code Added to `build/pyinstaller.spec`

```python
# Collect Python DLLs explicitly for Windows (Python 3.13)
# PyInstaller sometimes fails to auto-detect Python 3.13 DLLs
binaries = []
if is_windows:
    import sys
    python_dir = Path(sys.executable).parent
    dlls_dir = python_dir / 'DLLs'
    
    # Include python313.dll (or python3XX.dll for current version)
    python_dll_name = f'python{sys.version_info.major}{sys.version_info.minor}.dll'
    python_dll_path = python_dir / python_dll_name
    if python_dll_path.exists():
        binaries.append((str(python_dll_path), '.'))
        print(f"[PyInstaller] Including Python DLL: {python_dll_name}")
    
    # Also include python3.dll if it exists
    python3_dll_path = python_dir / 'python3.dll'
    if python3_dll_path.exists():
        binaries.append((str(python3_dll_path), '.'))
        print(f"[PyInstaller] Including Python3 DLL: python3.dll")
    
    # Include critical DLLs from Python's DLLs directory
    if dlls_dir.exists():
        critical_dlls = [
            'VCRUNTIME140.dll',
            'VCRUNTIME140_1.dll',
            'api-ms-win-crt-runtime-l1-1-0.dll',
        ]
        for dll_name in critical_dlls:
            dll_path = dlls_dir / dll_name
            if dll_path.exists():
                binaries.append((str(dll_path), '.'))
                print(f"[PyInstaller] Including DLL: {dll_name}")
```

## Testing
After rebuilding with this fix:
1. The build should show messages like:
   ```
   [PyInstaller] Including Python DLL: python313.dll
   [PyInstaller] Including Python3 DLL: python3.dll
   ```
2. The application should start without the DLL error
3. The DLL should be present in the PyInstaller temp directory when the app runs

## Next Steps
1. Rebuild the application with the updated spec file
2. Test that the application starts correctly
3. If the issue persists, check:
   - PyInstaller version (may need update)
   - Python installation (ensure DLLs are present)
   - System VC++ Redistributable (should be installed)

## Related Files
- `build/pyinstaller.spec` - Updated to include Python DLLs explicitly
- `.github/workflows/build-windows.yml` - Build workflow (uses the spec file)
