# Workflow Updates for PyInstaller 6.10.0+ Requirement

## Summary
Updated GitHub Actions workflows to ensure PyInstaller >= 6.10.0 is installed and verified during CI builds. This is required for Python 3.13 support.

## Changes Made

### 1. Windows Workflow (`build-windows.yml`)
- ✅ Already had `pip install --upgrade pyinstaller`
- ✅ Added version verification step that:
  - Extracts version from `pyinstaller --version`
  - Parses major.minor.patch version numbers
  - Fails build if version < 6.10.0
  - Provides clear error message if version is too old

### 2. macOS Workflow (`build-macos.yml`)
- ✅ Changed from `pip install pyinstaller` to `pip install --upgrade pyinstaller`
- ✅ Added version verification step that:
  - Extracts version from `pyinstaller --version`
  - Parses version using Python (no external dependencies)
  - Fails build if version < 6.10.0
  - Provides clear error message if version is too old

## Why These Changes?

1. **Python 3.13 Support**: PyInstaller 6.10.0+ (released Aug 2024) is the first version with official Python 3.13 support
2. **Early Failure**: Better to fail fast during CI than discover DLL issues after deployment
3. **Consistency**: Both workflows now use the same upgrade strategy and verification

## Version Check Implementation

### Windows (PowerShell)
```powershell
$pyinstallerVersion = (pyinstaller --version).Trim()
$versionParts = $pyinstallerVersion -split '\.'
$major = [int]$versionParts[0]
$minor = [int]$versionParts[1]
$patch = [int]$versionParts[2]

if ($major -lt 6 -or ($major -eq 6 -and $minor -lt 10)) {
    Write-Error "PyInstaller version must be >= 6.10.0 for Python 3.13 support. Found: $pyinstallerVersion"
    exit 1
}
```

### macOS (Bash)
```bash
PYINSTALLER_VERSION=$(pyinstaller --version 2>&1 | head -n1 | tr -d ' ')
VERSION_NUM=$(echo "$PYINSTALLER_VERSION" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1)
python -c "
v = '$VERSION_NUM'.split('.')
major, minor, patch = int(v[0]), int(v[1]), int(v[2])
if (major, minor, patch) < (6, 10, 0):
    print(f'Error: PyInstaller {major}.{minor}.{patch} is too old. Need >= 6.10.0')
    exit(1)
"
```

## Testing

When workflows run, you should see:
1. PyInstaller installation with upgrade
2. Version output: `PyInstaller version: 6.10.0` (or higher)
3. Version check confirmation: `✅ PyInstaller version check passed (>= 6.10.0)`

If version is too old, the build will fail with a clear error message.

## Related Files
- `.github/workflows/build-windows.yml` - Windows CI workflow (updated)
- `.github/workflows/build-macos.yml` - macOS CI workflow (updated)
- `requirements-dev.txt` - Development dependencies (already updated to `>=6.10.0`)
- `build/pyinstaller.spec` - PyInstaller spec file (already includes DLL fix)

## Next Steps

1. ✅ Workflows updated
2. ✅ Version checks added
3. ⏭️ Next CI run will verify PyInstaller version
4. ⏭️ Build will fail early if PyInstaller < 6.10.0

No further action needed - the workflows are now configured to enforce the PyInstaller version requirement.
