# CuePoint Version Summary

This document lists **exact versions** used by CuePoint in different scenarios.

## 📦 Current App Version

**Application Version:** `1.0.1-test21` (from `SRC/cuepoint/version.py`)

---

## 🖥️ Running Locally with `run_gui.bat`

When you run `run_gui.bat`, it uses:

### Python Version
- **Uses:** Whatever Python is in your system PATH (when you type `python`)
- **Current Local:** Python 3.13.1 (example - yours may differ)
- **Recommended:** Python 3.7 or later (minimum requirement)
- **Note:** The script simply calls `python gui_app.py`, so it uses your default Python installation

### Dependencies (from `requirements.txt`)
These are installed with **minimum version requirements** (>=), so you'll get the latest compatible versions.

**Minimum Versions Required:**
| Package | Minimum Version | Notes |
|---------|----------------|-------|
| PySide6 | >= 6.5.0 | GUI Framework |
| requests | >= 2.32.4 | HTTP requests |
| aiohttp | >= 3.13.0 | Async HTTP |
| beautifulsoup4 | >= 4.12.0 | HTML parsing |
| ddgs | >= 9.0.0 | DuckDuckGo search |
| rapidfuzz | >= 3.0.0 | Fuzzy string matching |
| python-dateutil | >= 2.8.0 | Date parsing |
| pyyaml | >= 6.0 | YAML config |
| tqdm | >= 4.66.3 | Progress bars |
| requests-cache | >= 1.1.0 | HTTP caching |
| playwright | >= 1.40.0 | Browser automation |
| selenium | >= 4.15.0 | Alternative browser automation |
| openpyxl | >= 3.1.0 | Excel export |

**Example Currently Installed Versions (Local Development):**
| Package | Installed Version | Notes |
|---------|------------------|-------|
| PySide6 | 6.10.0 | Latest compatible |
| requests | 2.32.3 | Latest compatible |
| aiohttp | 3.13.2 | Latest compatible |
| beautifulsoup4 | 4.13.4 | Latest compatible |
| ddgs | 9.6.0 | Latest compatible |
| RapidFuzz | 3.14.1 | Latest compatible |
| python-dateutil | 2.9.0.post0 | Latest compatible |
| PyYAML | 6.0.3 | Latest compatible |
| tqdm | 4.67.1 | Latest compatible |
| requests-cache | 1.2.1 | Latest compatible |
| playwright | Not shown | Latest compatible |
| selenium | 4.28.1 | Latest compatible |
| openpyxl | Not shown | Latest compatible |
| Pillow | 12.0.0 | Latest compatible |

**Note:** When you run `pip install -r requirements.txt`, pip will install the latest versions that meet these minimum requirements. The exact versions may vary over time as new versions are released.

---

## 🔨 Building Locally

If you build the app locally using PyInstaller:

### Python Version
- **Uses:** Whatever Python version you have installed locally
- **Current Local:** Python 3.13.1 (example - yours may differ)
- **Recommended:** Python 3.13 (for best compatibility with latest PyInstaller)
- **Minimum:** Python 3.7+ (but PyInstaller 6.10.0+ requires Python 3.13 for full support)

### Build Dependencies (from `requirements-build.txt`)
These are **EXACT PINNED VERSIONS** for reproducible builds:

| Package | Exact Version | Notes |
|---------|--------------|-------|
| PySide6 | **6.8.3** | Updated for Python 3.13 compatibility (6.5.0 only supports up to Python 3.12) |
| requests | **2.32.4** | |
| aiohttp | **3.13.0** | |
| beautifulsoup4 | **4.12.0** | |
| ddgs | **9.9.1** | |
| rapidfuzz | **3.0.0** | |
| python-dateutil | **2.8.0** | |
| pyyaml | **6.0.2** | Updated for Python 3.13 compatibility (6.0 has build issues with Python 3.13) |
| tqdm | **4.66.3** | |
| requests-cache | **1.1.0** | |
| playwright | **1.48.0** | Updated for Python 3.13 compatibility (1.40.0 uses greenlet 3.0.1 which doesn't build with Python 3.13) |
| selenium | **4.15.0** | |
| openpyxl | **3.1.0** | |
| Pillow | **>= 9.0.0** | Image processing (build-time dependency, not pinned) |

### Build Tools
- **PyInstaller:** Latest version (not pinned, but must be >= 6.10.0)
  - Installed via: `pip install --upgrade pyinstaller`
  - Version check ensures >= 6.10.0
  - **Current Local Example:** 6.17.0 (yours may differ)
  - **Note:** PyInstaller is not pinned to allow using the latest version with bug fixes

**Note:** The built executable will bundle Python and all dependencies, so end users don't need Python installed.

---

## ☁️ Building on GitHub Actions (Downloaded Releases)

When you download a release from GitHub, it was built using:

### Python Version
- **Python:** **3.13** (exact version from `.github/workflows/build-windows.yml` and `build-macos.yml`)
- **Platform:** Latest available on GitHub Actions runners (macos-latest, windows-latest)

### Build Dependencies (from `requirements-build.txt`)
**EXACT PINNED VERSIONS** (same as local build):

| Package | Exact Version | Notes |
|---------|--------------|-------|
| PySide6 | **6.8.3** | Python 3.13 compatible |
| requests | **2.32.4** | |
| aiohttp | **3.13.0** | |
| beautifulsoup4 | **4.12.0** | |
| ddgs | **9.9.1** | |
| rapidfuzz | **3.0.0** | |
| python-dateutil | **2.8.0** | |
| pyyaml | **6.0.2** | Python 3.13 compatible |
| tqdm | **4.66.3** | |
| requests-cache | **1.1.0** | |
| playwright | **1.48.0** | Python 3.13 compatible |
| selenium | **4.15.0** | |
| openpyxl | **3.1.0** | |
| Pillow | **>= 9.0.0** | Image processing (not pinned) |

### Build Tools
- **PyInstaller:** Latest version (not pinned, but must be >= 6.10.0)
  - Installed via: `pip install --upgrade pyinstaller`
  - Version check ensures >= 6.10.0 for Python 3.13 support
  - **Note:** Exact version may vary between builds as new versions are released

### Other CI/CD Tools
- **Test workflows:** Python **3.11** (for testing)
- **Security scans:** Python **3.11**
- **Compliance checks:** Python **3.11**

---

## 📊 Summary Comparison

| Scenario | Python Version | Dependencies | PyInstaller |
|----------|---------------|--------------|-------------|
| **run_gui.bat** | System default (3.7+) | Latest compatible (>=) | N/A (not used) |
| **Local Build** | Your local Python (3.7+) | **Exact pinned versions** (see table above) | Latest (>= 6.10.0, not pinned) |
| **GitHub Build** | **3.13** (exact) | **Exact pinned versions** (see table above) | Latest (>= 6.10.0, not pinned) |

---

## 🔍 Key Differences

1. **Development vs Production:**
   - `requirements.txt`: Flexible versions (>=) for development - gets latest compatible
   - `requirements-build.txt`: **Exact pinned versions (==)** for reproducible builds

2. **Python Version:**
   - **Local run:** Uses your system Python (any 3.7+)
   - **Local build:** Uses your system Python (any 3.7+, but 3.13 recommended)
   - **GitHub build:** Always uses **Python 3.13** (exact)

3. **Dependency Versions:**
   - **Local run:** Latest compatible versions (may vary over time)
   - **Local/GitHub build:** **Exact pinned versions** (always the same - see table above)

4. **Why Python 3.13 for builds?**
   - PyInstaller 6.10.0+ requires Python 3.13 for full support
   - Some dependencies (PySide6 6.8.3, pyyaml 6.0.2, playwright 1.48.0) are updated for Python 3.13 compatibility

5. **PyInstaller Version:**
   - **Not pinned** - always uses latest version (>= 6.10.0)
   - This allows bug fixes and improvements in PyInstaller without changing dependency pins
   - Version is verified during build to ensure >= 6.10.0

---

## 📝 Notes

- The built executable bundles Python and all dependencies, so end users don't need Python installed
- When running locally, you need to install dependencies manually: `pip install -r requirements.txt`
- For reproducible builds, always use `requirements-build.txt` which has **exact pinned versions**
- The app version is stored in `SRC/cuepoint/version.py` and follows Semantic Versioning (SemVer)

## 📋 Quick Reference: Exact Versions for Builds

When building (local or GitHub), these **exact versions** are used:

```
PySide6==6.8.3
requests==2.32.4
aiohttp==3.13.0
beautifulsoup4==4.12.0
ddgs==9.9.1
rapidfuzz==3.0.0
python-dateutil==2.8.0
pyyaml==6.0.2
tqdm==4.66.3
requests-cache==1.1.0
playwright==1.48.0
selenium==4.15.0
openpyxl==3.1.0
Pillow>=9.0.0  (not pinned)
```

**Python:** 3.13 (GitHub builds) or your local version (local builds)  
**PyInstaller:** Latest >= 6.10.0 (not pinned)

