# Python 3.13 DLL Fix - Community Recommended Solution

## Issue
After installing an update, the application fails to start with error:
```
Failed to load Python DLL
'C:\Users\Stelios\AppData\Local\Temp\_MEI31162\python313.dll'.
LoadLibrary: The specified module could not be found.
```

## Official PyInstaller Support Status

**PyInstaller 6.10.0+ (released August 10, 2024) officially supports Python 3.13.**

However, even with official support, PyInstaller may still fail to automatically detect and bundle `python313.dll` in some cases.

## Community-Recommended Solution

Based on PyInstaller documentation and community discussions, the recommended approach is:

### 1. Ensure PyInstaller Version >= 6.10.0

```bash
pip install --upgrade pyinstaller
pyinstaller --version  # Should show 6.10.0 or higher
```

### 2. Manually Include DLL in Spec File

The standard solution is to modify the `.spec` file to explicitly include the Python DLL in the `binaries` list:

```python
a = Analysis(
    ['your_script.py'],
    pathex=[],
    binaries=[
        ('C:\\Python313\\python313.dll', '.'),  # 2-tuple: (src_path, dest_dir)
    ],
    datas=[],
    hiddenimports=[],
    # ... other parameters
)
```

**Key Points:**
- Use **2-tuple format**: `(src_path, dest_dir)` when passing to `Analysis()`
- Use **3-tuple format**: `(name_in_bundle, full_path, 'BINARY')` when appending to `a.binaries` after Analysis
- `dest_dir` of `'.'` places the DLL in the root of the bundle (extracts to `_MEIPASS` root)
- Use absolute paths to avoid path resolution issues

### 3. Dynamic Detection (Recommended for Our Implementation)

Instead of hardcoding the path, dynamically detect the Python DLL:

```python
import sys
from pathlib import Path

binaries = []
if sys.platform == 'win32':
    python_dir = Path(sys.executable).parent
    python_dll_name = f'python{sys.version_info.major}{sys.version_info.minor}.dll'
    python_dll_path = python_dir / python_dll_name
    
    if python_dll_path.exists():
        binaries.append((str(python_dll_path), '.'))
```

## Our Implementation

We've implemented a comprehensive solution that:

1. ✅ **Pre-Analysis**: Adds DLL to `binaries` list before Analysis (2-tuple format)
2. ✅ **Post-Analysis**: Verifies and adds DLL if missing (3-tuple format)
3. ✅ **Duplicate Removal**: Removes duplicate entries to avoid conflicts
4. ✅ **Final Verification**: Multiple checkpoints to ensure DLL is included
5. ✅ **Custom Hook**: Additional hook file for automatic inclusion

## Why Multiple Layers?

Even with PyInstaller 6.10.0+, the DLL detection can be unreliable because:
- PyInstaller's analysis phase may miss the DLL
- The DLL may be detected but not extracted properly
- One-file mode has additional complexity with DLL extraction

Our multi-layer approach ensures the DLL is included regardless of which detection method works.

## Testing the Fix

1. **Verify PyInstaller version**:
   ```bash
   pyinstaller --version
   # Should be 6.10.0 or higher
   ```

2. **Rebuild the application**:
   ```bash
   python scripts/build_pyinstaller.py
   ```

3. **Check build logs** for:
   ```
   [PyInstaller] Including Python DLL in binaries: python313.dll
   [PyInstaller] Final check: python313.dll is in binaries list
   [PyInstaller] Verified: python313.dll is in binaries list
   ```

4. **Test the executable**:
   - Install the update
   - Launch CuePoint
   - Verify no DLL error

## Alternative Solutions (If Issue Persists)

### Option 1: Use One-Directory Mode
Change `noarchive=False` to `noarchive=True` in the spec file:
- Creates a directory with exe and all dependencies
- DLL will be in `_internal` directory
- More reliable but less convenient for distribution

### Option 2: Check Bootloader
Some users report that rebuilding PyInstaller's bootloader helps:
```bash
pip uninstall pyinstaller
pip install --no-binary pyinstaller pyinstaller
```

### Option 3: Verify VC++ Redistributable
Ensure Visual C++ Redistributable 2015-2022 is installed:
- Download from: https://aka.ms/vs/17/release/vc_redist.x64.exe

## References

- PyInstaller 6.10.0 Changelog: https://pyinstaller.org/en/latest/CHANGES.html
- PyInstaller Spec File Documentation: https://pyinstaller.org/en/stable/spec-files.html
- GitHub Issues: https://github.com/pyinstaller/pyinstaller/issues

## Summary

The community-recommended solution is to manually include the DLL in the spec file, which we've already implemented with additional safeguards. The key is ensuring PyInstaller >= 6.10.0 and using the correct tuple format for DLL inclusion.
