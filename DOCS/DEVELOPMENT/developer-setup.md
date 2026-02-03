# Developer Setup

Design 10.5, 10.14. Get from clone to running app in under 30 minutes.

## Prerequisites

- **Python 3.11+** (3.12 or 3.13 recommended)
- **Git**

## Quick Setup (Automated)

```bash
# 1. Clone
git clone https://github.com/stuchain/CuePoint.git
cd CuePoint

# 2. Run setup script
python scripts/dev_setup.py

# 3. Activate venv (Windows)
.venv\Scripts\activate

# 3. Activate venv (macOS/Linux)
source .venv/bin/activate

# 4. Run app
python SRC/gui_app.py
```

## Manual Setup

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate      # macOS/Linux
pip install -r requirements.txt -r requirements-dev.txt
```

## Verify Setup

| Check | Command |
| --- | --- |
| Python OK | `python --version` (3.11+) |
| Dependencies | `pip list \| grep -E "PySide6|pytest"` |
| Tests | `python scripts/run_tests.py --unit --no-slow` |
| App runs | `python SRC/gui_app.py` |

## Developer Tooling

| Tool | Purpose | Command |
| --- | --- | --- |
| Ruff | Linting | `ruff check SRC/` |
| Black | Formatting | `black SRC/` |
| Mypy | Type checking | `mypy SRC/ --ignore-missing-imports` |
| Pytest | Tests | `python scripts/run_tests.py` |

## Environment Variables

| Variable | Description |
| --- | --- |
| `CUEPOINT_DEBUG` | Set to `1` for debug logs |
| `CUEPOINT_ENV` | Set to `dev` for development mode |

## Common Commands

```bash
# Run unit tests only
python scripts/run_tests.py --unit

# Run all tests (unit, integration, system)
python scripts/run_tests.py --all

# Run CLI with sample XML
python SRC/main.py --xml SRC/tests/fixtures/rekordbox/minimal.xml --playlist "Test Playlist" --out test

# Run GUI
python SRC/gui_app.py
```

## Optional: Playwright (Browser Search)

For full Beatport search support (JavaScript-rendered content):

```bash
playwright install chromium
```

## Troubleshooting

See [Common Dev Errors](common-errors.md).
