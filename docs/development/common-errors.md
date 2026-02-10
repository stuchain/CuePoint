# Common Dev Errors

Design 10.6, 10.22. Troubleshooting developer environment issues.

## Setup Errors

### "Python 3.11+ required"

**Cause**: Older Python version.

**Fix**: Install Python 3.11 or newer. Check with `python --version`.

### "No module named 'cuepoint'"

**Cause**: Running from wrong directory or venv not activated.

**Fix**:
```bash
# Ensure you're in project root
cd CuePoint

# Activate venv
.venv\Scripts\activate   # Windows
source .venv/bin/activate # macOS/Linux

# Run with project root as cwd
python src/main.py --help
```

### "No module named 'PySide6'" or missing deps

**Cause**: Dependencies not installed.

**Fix**:
```bash
pip install -r requirements.txt -r requirements-dev.txt
```

### Import error for `ddgs` or `duckduckgo_search`

**Cause**: DuckDuckGo package changed. We use `ddgs>=9.0.0`.

**Fix**:
```bash
pip install ddgs>=9.0.0
```

## Test Errors

### "ModuleNotFoundError" when running pytest

**Cause**: `pythonpath` or `PYTHONPATH` not set.

**Fix**: Run from project root. `pytest.ini` sets `pythonpath = src`. Use:
```bash
python scripts/run_tests.py --unit
```
or
```bash
pytest src/tests/unit/ -v
```
from project root.

### Tests pass locally but fail in CI

**Cause**: Different Python version, OS, or env.

**Fix**: Check `.github/workflows/test.yml` for matrix (e.g. Python 3.11, Windows/macOS). Run same Python version locally.

### "Missing DLL" or PyInstaller errors

**Cause**: PyInstaller version mismatch or missing system libs.

**Fix**: Use PyInstaller 6.17+ (see `requirements-dev.txt`). On Windows, ensure Visual C++ Redistributable is installed.

## Lint / Type Errors

### Ruff or mypy fails on new code

**Fix**:
```bash
ruff check src/ --fix
mypy src/ --ignore-missing-imports
```

### Black reformats differently than CI

**Fix**: Use same Black version as in `requirements-dev.txt` (25.12.0). Run `black src/` before committing.

## GUI Errors

### "Qt platform plugin" or "Could not find the Qt platform plugin"

**Cause**: PySide6 not fully installed or wrong Qt env.

**Fix**:
```bash
pip install --force-reinstall PySide6
```

### GUI crashes on launch

**Cause**: Missing dependency or bad config.

**Fix**: Delete or rename `config.yaml` in user config dir and retry. Check logs in Help > Open Logs Folder.

## Network / Beatport

### "DuckDuckGo search failed" or timeouts

**Cause**: Network block (VPN, firewall, corporate proxy).

**Fix**: Try different network. Or set `DDG_ENABLED: false` in config to rely on direct Beatport search (if available).

### Beatport parsing returns empty data

**Cause**: Beatport HTML/JSON structure changed.

**Fix**: See [Beatport Parsing](beatport-parsing.md). Update parser and fixtures.

## Quick Checklist

- [ ] Python 3.11+
- [ ] Venv activated
- [ ] `pip install -r requirements.txt -r requirements-dev.txt`
- [ ] Running from project root
- [ ] `python src/main.py --help` works
