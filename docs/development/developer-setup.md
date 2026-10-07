# Developer Setup

Design 10.5, 10.14. Get from clone to running app in under 30 minutes.

## Prerequisites

- **Python 3.11+** (`.python-version` pins the version used for development; CI tests 3.11 and 3.12)
- **Node.js 22+** (the version desktop CI uses), for the desktop app
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

# 4. Install the desktop dependencies and run the desktop app
cd apps/desktop-electron && npm ci && npm ci --prefix renderer
npm run electron:start
```

## Manual Setup

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate      # macOS/Linux
pip install -r requirements.txt -r requirements-dev.txt
```

## A Python environment on macOS

You need a Python 3.11 or newer that you can create a virtualenv from. The system Python on macOS is linked against LibreSSL, which makes `urllib3` print a warning; a Python built against OpenSSL (python.org, Homebrew or `pyenv`) does not. To use `pyenv` and match the pinned version:

```bash
brew install pyenv openssl@3 readline xz zlib
cd /path/to/CuePoint
pyenv install "$(cat .python-version)"
pyenv local "$(cat .python-version)"
python -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt -r requirements-dev.txt
```

`scripts/setup/install_requirements.sh` is a helper that installs the requirements for you. If you run the CLI from source with Beatport browser search, also run `python -m playwright install chromium`.

## Run from source

From the repository root, with the virtualenv active:

```bash
# The CLI
python main.py --xml collection.xml --playlist "My Playlist" --auto-research

# The desktop app (builds the shell, then starts Electron)
cd apps/desktop-electron
npm ci && npm ci --prefix renderer
npm run electron:start
```

`npm run electron:dev` builds only the Electron shell and runs it in development mode against the renderer dev server, so start `npm run dev:renderer` in a second terminal first. Windows users can also run `run.bat` from the repository root: it installs missing desktop dependencies, then builds and launches the desktop app on the repository's `.venv`. Released installers are on the [GitHub Releases](https://github.com/stuchain/CuePoint/releases) page.

## Verify Setup

| Check | Command |
| --- | --- |
| Python OK | `python --version` (3.11+) |
| Dependencies | `pip list \| grep -E "pytest|playwright"` |
| Tests | `python scripts/run_tests.py --unit --no-slow` |
| App runs | `cd apps/desktop-electron && npm run electron:start` |

## Developer Tooling

| Tool | Purpose | Command |
| --- | --- | --- |
| Ruff | Linting | `ruff check src/` |
| Ruff | Formatting | `ruff format src/` (CI runs `ruff format --check src/`) |
| Mypy | Type checking (the gate) | `python -m pytest src/tests/integration/test_mypy_foundation.py -q` |
| Pytest | Tests | `python scripts/run_tests.py` |
| oxlint | Renderer lint | `npm run lint` in `apps/desktop-electron/renderer` |
| tsc | Renderer and shell types | `npm run typecheck` in `apps/desktop-electron/renderer` and in `apps/desktop-electron` |
| pre-commit | Runs the Ruff hooks and file hygiene on each commit | `pre-commit install` once, then `pre-commit run --all-files` |

## Coding Standards

- **Formatting and linting**: Ruff does both (`ruff check src/` and `ruff format --check src/`); CI runs them on every push and pull request. `.pre-commit-config.yaml` runs `ruff-check --fix` and `ruff-format` on each commit, along with whitespace, YAML, TOML, JSON and merge-conflict checks. `.editorconfig` sets UTF-8, LF line endings and a final newline.
- **Typing**: Add type hints to public APIs and keep types practical; do not over-annotate. The mypy gate is `src/tests/integration/test_mypy_foundation.py`. A bare `mypy src/` still reports older errors that the gate does not cover, so do not use its output as the gate. It is not part of pre-commit.
- **Security**: Do not log secrets or tokens. Validate and sanitize untrusted input (files, URLs, external data).
- **Testing**: New or changed logic needs unit tests. Give a regression a test before the fix.
- **Errors**: Raise the domain exceptions in `cuepoint.exceptions` (for example `ExportError` and `ConfigurationError`) with an `error_code` and useful context.

## Environment Variables

| Variable | Description |
| --- | --- |
| `CUEPOINT_HOME` | Directory for CuePoint's state (config, library database, backups, logs). Defaults to `~/.cuepoint`; point it elsewhere to try a second profile |
| `CUEPOINT_PYTHON` | The Python the desktop app starts the engine with in development. Defaults to the repository's `.venv`, then `python3` |
| `CUEPOINT_RENDERER_URL` | The renderer dev server `npm run electron:dev` loads. Defaults to `http://localhost:5173` |
| `CUEPOINT_MPV_PATH` | Path to an mpv binary to use instead of the bundled player sidecar |
| `CUEPOINT_PARENT_PID` | Set by the desktop app to its own process id; the engine exits when that process has gone. Leave unset when running the engine by hand |

## Engine sidecar layout

`python scripts/build_engine_sidecar.py` writes to
`apps/desktop-electron/resources/engine/<os>-<arch>/` (`win-x64`, `mac-arm64`, ...). These names are
electron-builder's `${os}-${arch}` macros, not Python's `sys.platform`, because `extraResources`
expands them when packaging; a mismatch makes the packaged app silently omit the sidecar. If you
have a `resources/engine/win32/` or `resources/engine/darwin/` directory from an older checkout it
is stale build output and can be deleted.

## Packaging on Windows

`npm run pack` and `npm run dist` need **Developer Mode** on (Settings → System → For developers).
electron-builder downloads a tools archive the first time it packages, and that archive contains
symbolic links, which Windows lets an ordinary account create only in Developer Mode. Without it
the pack fails with "Cannot create symbolic link: A required privilege is not held by the client"
and retries. CI's Windows runners are not affected. If a failed attempt left partial extractions
behind, delete `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign` and pack again.

## Player sidecar (mpv)

The desktop app plays audio through a bundled `mpv` binary run as a second
sidecar (DEC-005/DEC-049, ADR-004). It is downloaded rather than committed, so a
fresh checkout has to fetch it once before packaging or running playback:

```bash
python scripts/fetch_player_sidecar.py            # this platform
python scripts/fetch_player_sidecar.py --target all   # every pinned platform
python scripts/fetch_player_sidecar.py --verify-only  # re-check an install
python scripts/fetch_player_sidecar.py --check-formats  # decode the fixtures
```

The download is pinned in `scripts/player_sidecar_manifest.json` and verified
against the SHA-256 GitHub publishes for the asset; a mismatch fails rather than
warns. It installs into `apps/desktop-electron/resources/player/<os>-<arch>/`
(`win-x64`, `mac-arm64`, `mac-x64`), which is git-ignored build output.

Notes:

- **Linux pins nothing.** The script exits 0 with a notice; install mpv from your
  distribution and point CuePoint at it with `CUEPOINT_MPV_PATH`.
- **Pins expire.** mpv publishes binaries only on a rolling tag, so a pinned
  asset eventually disappears. When it does, the fetch fails saying so; re-pin
  with `python scripts/fetch_player_sidecar.py --update-manifest` and commit the
  reviewed diff.
- `npm run pack:full` runs the fetch as part of packaging.
- The audio test fixtures are regenerated by
  `python scripts/make_audio_fixtures.py` (needs the sidecar installed).

## Common Commands

```bash
# Run unit tests only
python scripts/run_tests.py --unit

# Run all tests (unit, integration, system)
python scripts/run_tests.py --all

# Run CLI with sample XML (from project root)
python main.py --xml src/tests/fixtures/rekordbox/minimal.xml --playlist "Test Playlist" --out test

# Run the desktop app (builds the renderer and shell, then starts Electron)
cd apps/desktop-electron && npm run electron:start
```

## Optional: Playwright (Browser Search)

`requirements.txt` installs the `playwright` package. For the CLI's browser-based Beatport search (JavaScript-rendered content), install its browser once:

```bash
python -m playwright install chromium
```

## Troubleshooting

See [Common Dev Errors](common-errors.md).
