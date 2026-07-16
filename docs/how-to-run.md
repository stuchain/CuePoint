# How to run

Use one of the paths below depending on how you want to run CuePoint.

## Install from GitHub Releases (recommended)

1. Go to the GitHub Releases page for this repo: https://github.com/stuchain/CuePoint/releases
2. Download the installer for your OS.
3. Install and run the app.

## Build locally

1. Install Python 3.11+.
2. Install dependencies:

```bash
pip install -r requirements.txt
playwright install chromium
```

3. Run the CLI (from project root):

```bash
python main.py --xml collection.xml --playlist "My Playlist" --auto-research
```

## Run the GUI directly

- Windows: `run_gui.bat`
- macOS: `run_gui.command`
- Linux: `run_gui.sh`

These scripts launch the **Electron desktop shell** via `src/gui_app.py`.

Prerequisites for local Electron dev:

```bash
cd apps/desktop-electron
npm install
```

The legacy PySide6 GUI is deprecated. To run it for debugging only:

```bash
pip install -r requirements-qt.txt
python src/gui_app.py --legacy-qt
```
