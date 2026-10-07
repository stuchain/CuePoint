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

### Missing dependencies

**Cause**: The requirements are not installed in the active environment.

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

**Fix**: Check `.github/workflows/test.yml` and `release-gates.yml` for the Python and OS matrix (Python 3.11 and 3.12 on Linux, macOS and Windows). Run the same Python version locally.

### "Missing DLL" or PyInstaller errors when building the engine sidecar

**Cause**: PyInstaller version mismatch or missing system libs.

**Fix**: Use the PyInstaller version pinned in `requirements-build.txt`. On Windows, ensure Visual C++ Redistributable is installed.

### The packaged engine behaves differently from a development run

**Cause**: PyInstaller bundles what the *module graph* references — `import`
statements, followed transitively. Anything loaded another way is invisible to
it and simply will not be there:

- a package imported dynamically (`importlib.import_module` with a name built at
  runtime) needs `collect_submodules("package")` in the spec's `hiddenimports`
- a non-`.py` file a package reads at runtime needs an entry in `datas`

Both fail *only* in packaged builds, and usually silently — the build succeeds
and the missing code or file surfaces as an unrelated error later. This has
happened here: `cuepoint.migrations` is dynamically imported, so a bundle
without it shipped no migrations and would have created a database with no
tables on a fresh install.

**Fix**: Add it to `build/engine-sidecar.spec`. The guards are
`src/tests/unit/scripts/test_engine_sidecar_datas.py` and
`test_engine_sidecar_imports.py`; extend those rather than relying on someone
remembering. To check a real bundle:

```bash
python scripts/build_engine_sidecar.py    # builds, then smoke-tests /health
```

## Lint / Type Errors

### Ruff fails on new code

**Fix**:
```bash
ruff check src/ --fix
ruff format src/
```

### The mypy gate fails

**Fix**: Run the gate, not a bare `mypy src/`, which still reports older errors the gate does not cover:
```bash
python -m pytest src/tests/integration/test_mypy_foundation.py -q
```

### Ruff formats differently than CI

**Fix**: Install the ruff version pinned in `requirements-dev.txt` and run `ruff format --check src/`, which is what CI runs.

## Desktop app errors

### The app crashes on launch

**Cause**: A missing sidecar, a bad config, or an engine that did not start.

**Fix**: Run `npm run electron:dev` from `apps/desktop-electron` and read the terminal output. Delete or rename `~/.cuepoint/config.yaml` and retry. Check the logs with **Help > Log Viewer...**, then **Open logs folder**.

## Network / Beatport

### "DuckDuckGo search failed" or timeouts

**Cause**: Network block (VPN, firewall, corporate proxy).

**Fix**: Try different network. Or put `DDG_ENABLED: false` in a YAML file and pass it to the CLI with `--config` to skip DuckDuckGo and use direct Beatport search.

### Beatport parsing returns empty data

**Cause**: Beatport HTML/JSON structure changed.

**Fix**: See [Beatport Parsing](beatport-parsing.md). Update parser and fixtures.

## Quick Checklist

- [ ] Python 3.11+
- [ ] Venv activated
- [ ] `pip install -r requirements.txt -r requirements-dev.txt`
- [ ] Running from project root
- [ ] `python src/main.py --help` works
