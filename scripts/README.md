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

