# Scripts Directory

This folder collects helper scripts used for development, testing, and maintenance.

## Setup

- `setup/install_requirements.sh`: Installs Python requirements on Linux/macOS.

## Notes

- Scripts are grouped by intent; prefer `main.py` and `run_gui.*` for normal usage.
- For legacy or one-off test runners, see `ARCHIVE/tests/`.
# Utility Scripts

This directory contains utility scripts for maintenance and organization.

## File Organization Scripts

- **`organize_old_files.bat`** / **`organize_old_files.sh`** - Move old files to ARCHIVE folders for review
- **`cleanup_files.bat`** / **`cleanup_files.sh`** - Delete old files (use after reviewing ARCHIVE)

## Usage

### Windows
Double-click the `.bat` files or run them from command prompt.

### macOS/Linux
Make scripts executable and run:
```bash
chmod +x *.sh
./organize_old_files.sh
```

## Note

These scripts are for maintenance purposes. The main application launch scripts (`run_gui.bat`, `run_gui.sh`, `run_gui.command`) remain in the project root for easy access.

