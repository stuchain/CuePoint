# CuePoint

CuePoint enriches Rekordbox playlists with Beatport metadata and keeps each match
reviewable. It provides an Electron desktop app and a Python CLI.

<p align="center">
  <img src="docs/images/logo.png" alt="CuePoint" width="180">
</p>

## Features

- Match Rekordbox tracks against Beatport
- Fill key, BPM, label, genre, and release metadata
- Flag uncertain matches for review
- Export CSV and Excel results with an audit trail
- Discover Beatport releases with inCrate

## Install

Download a supported installer from
[GitHub Releases](https://github.com/stuchain/CuePoint/releases).

For local development, install Python 3.11+, Node.js 22+, and the project
dependencies:

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
cd apps/desktop-electron
npm install
npm install --prefix renderer
```

Run the desktop app:

```bash
npm run electron:start
```

Run the CLI from the repository root:

```bash
python main.py --xml collection.xml --playlist "My Playlist"
```

See [How to run](docs/how-to-run.md) for platform launchers and build details.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/desktop-electron/` | Electron shell and React renderer |
| `src/cuepoint/` | Python engine, domain logic, and services |
| `src/tests/` | Python test suite |
| `scripts/` | Development, build, and release utilities |
| `docs/` | User and contributor documentation |

## Development

```bash
python scripts/run_tests.py --all --no-slow
make check-format
cd apps/desktop-electron/renderer && npm test
```

Contributor guidance is in [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md),
and technical documentation starts at [docs/README.md](docs/README.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
