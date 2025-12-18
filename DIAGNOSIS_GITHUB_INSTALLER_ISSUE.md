# Diagnosis: GitHub Installer Matching Fewer Tracks

## Problem
- **GitHub installer**: Matches 5 out of 10 tracks
- **Local build**: Matches all 10 tracks

## Root Cause Analysis

The difference suggests that the GitHub installer is missing some dependencies or search engines that are present in your local build. The most likely causes are:

### 1. Missing ddgs Engine Modules ⚠️ **MOST LIKELY**

The app uses multiple DuckDuckGo search engines (`ddgs.engines.*`) for track matching. If some engines are missing, the app will:
- Have fewer search methods available
- Find fewer candidate tracks
- Match fewer tracks overall

**Check**: Run the diagnostic script on the GitHub installer:
```bash
# In the installed app, run:
CuePoint.exe --test-search-dependencies
```

Look for missing engine imports.

### 2. Missing fake_useragent Data Files

The `ddgs` package uses `fake_useragent` to generate user agent strings. If the data files (`browsers.json`) are missing:
- Some search engines may fail
- Search requests may be blocked
- Fewer tracks will be found

**Check**: The spec file should include:
```python
fake_useragent_datas = collect_data_files('fake_useragent')
datas.extend(fake_useragent_datas)
```

### 3. Missing duckduckgo_search Compatibility Shim

The app includes a compatibility shim at `SRC/duckduckgo_search.py`. If this is missing:
- The app may fall back to a different search method
- Some queries may fail
- Fewer tracks will be matched

**Check**: The spec file should include:
```python
(str(project_root / 'SRC' / 'duckduckgo_search.py'), 'SRC'),
```

### 4. Older Build with Outdated Spec File

The GitHub installer might have been built with an older version of `pyinstaller.spec` that:
- Doesn't include `collect_submodules('ddgs')`
- Doesn't include all engine modules explicitly
- Doesn't include fake_useragent data files

## Diagnostic Steps

### Step 1: Check the GitHub Installer

Run the diagnostic script on the installed GitHub version:

```bash
# If you have the installed app:
"C:\Users\...\CuePoint.exe" --test-search-dependencies
```

Or use the diagnostic script:
```bash
python scripts/diagnose_search_issues.py
```

### Step 2: Compare Build Specs

Check if the GitHub build used the same spec file:
- Compare `build/pyinstaller.spec` with what was used in CI
- Check GitHub Actions logs to see what spec file was used
- Verify that `collect_submodules('ddgs')` was included

### Step 3: Check Version/Build Number

Compare the build numbers:
- Local build: Check `SRC/cuepoint/version.py` for `__build_number__`
- GitHub installer: Check the app's About dialog or version info

If the GitHub installer has an older build number, it may be missing recent fixes.

## Solutions

### Solution 1: Rebuild with Updated Spec (Recommended)

Ensure the GitHub build uses the current `pyinstaller.spec`:

1. **Verify the spec file includes**:
   ```python
   # Collect all ddgs submodules
   *collect_submodules('ddgs'),
   
   # Include fake_useragent data
   fake_useragent_datas = collect_data_files('fake_useragent')
   datas.extend(fake_useragent_datas)
   
   # Include compatibility shim
   (str(project_root / 'SRC' / 'duckduckgo_search.py'), 'SRC'),
   ```

2. **Rebuild the installer** in GitHub Actions

3. **Test the new installer** with the same 10 tracks

### Solution 2: Add Explicit Engine Imports

If `collect_submodules('ddgs')` isn't working, explicitly list all engines:

```python
hiddenimports = [
    # ... existing imports ...
    'ddgs.engines.duckduckgo',
    'ddgs.engines.duckduckgo_images',
    'ddgs.engines.duckduckgo_news',
    'ddgs.engines.duckduckgo_videos',
    'ddgs.engines.bing',
    'ddgs.engines.bing_news',
    'ddgs.engines.google',
    'ddgs.engines.brave',
    'ddgs.engines.yahoo',
    'ddgs.engines.yahoo_news',
    'ddgs.engines.yandex',
    'ddgs.engines.mojeek',
    'ddgs.engines.wikipedia',
    'ddgs.engines.annasarchive',
    # ... etc ...
]
```

### Solution 3: Verify fake_useragent Data

Ensure fake_useragent data files are collected:

```python
try:
    from PyInstaller.utils.hooks import collect_data_files
    fake_useragent_datas = collect_data_files('fake_useragent')
    datas.extend(fake_useragent_datas)
    print(f"Included {len(fake_useragent_datas)} fake_useragent data files")
except Exception as e:
    print(f"Warning: Could not collect fake_useragent data: {e}")
```

## Testing

After rebuilding, test with the same 10 tracks:

1. **Run the diagnostic**:
   ```bash
   CuePoint.exe --test-search-dependencies
   ```

2. **Process the same playlist** and verify all 10 tracks are matched

3. **Compare results**:
   - GitHub installer: Should match all 10 tracks
   - Local build: Should match all 10 tracks
   - Both should produce identical results

## Prevention

To prevent this in the future:

1. **Add tests** that verify all search engines are available (already added)
2. **Run diagnostic script** in CI before building installer
3. **Compare build outputs** between local and CI builds
4. **Document required dependencies** in the spec file comments

## Quick Check Commands

```bash
# Check what's in the current spec file
grep -A 5 "collect_submodules" build/pyinstaller.spec

# Check if fake_useragent data is collected
grep -A 3 "fake_useragent" build/pyinstaller.spec

# Check if compatibility shim is included
grep "duckduckgo_search.py" build/pyinstaller.spec

# Test locally built executable
dist\CuePoint.exe --test-search-dependencies

# Compare with GitHub installer (if you have it)
"C:\Program Files\CuePoint\CuePoint.exe" --test-search-dependencies
```
