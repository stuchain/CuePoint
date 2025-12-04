# Organize Old Files - Quick Guide

## What This Does

The organization scripts **move** old files into organized folders instead of deleting them. This lets you review everything before deciding what to keep or delete.

## How to Use

### Windows
Double-click or run:
```batch
organize_old_files.bat
```

### macOS/Linux
```bash
chmod +x organize_old_files.sh
./organize_old_files.sh
```

## What Gets Organized

### 📁 ARCHIVE/old_status_reports/
- `PHASE_5_*.md` - Old phase completion status
- `STEP_5.*_*.md` - Old step completion summaries
- `MIGRATION_*.md` - Migration status reports

**These are safe to delete** - they're just old status reports from completed work.

### 📁 ARCHIVE/old_how_to_guides/
- `HOW_TO_*.md` - Old how-to guides
- `AUTO_FIX_*.md` - Old troubleshooting guides
- `COVERAGE_IMPROVEMENT_PLAN.md` - Old improvement plans
- `QUALITY_CHECKS_*.md` - Old quality check guides
- `NEXT_STEPS_OPTIONS.md` - Old planning docs

**Review these** - some might still be useful, but most are outdated.

### 📁 ARCHIVE/development_tools/
- `*.bat` files (except `run_gui.bat`) - Development automation scripts
- `fix_*.py` - Code fix scripts
- `test_*.py` - Old test scripts
- `write_interfaces.py` - Interface generator

**Review these** - keep any you actively use, delete the rest.

### 📁 ARCHIVE/temporary_files/
- `test.csv` - Test file
- `quality_check_results.txt` - Generated report
- `coverage.xml` - Generated coverage file

**Safe to delete** - these are temporary/generated files.

## After Organization

1. **Review** the files in each `ARCHIVE/` subfolder
2. **Move back** any files you want to keep to the project root
3. **Delete** the `ARCHIVE` folder (or individual subfolders) when ready

## What Stays in Project Root

All essential files remain untouched:
- ✅ `README.md`
- ✅ `requirements*.txt`
- ✅ `run_gui.bat`, `run_gui.sh`, `run_gui.command`
- ✅ `install_requirements.sh`
- ✅ `INSTALL_MACOS.md`, `FIX_PYSIDE6_MACOS.md`
- ✅ All `SRC/`, `DOCS/`, `config/` directories
- ✅ Project config files (`pyproject.toml`, `pytest.ini`, etc.)

## Quick Delete (After Review)

Once you've reviewed and are ready to delete everything in ARCHIVE:

### Windows
```batch
rmdir /s /q ARCHIVE
```

### macOS/Linux
```bash
rm -rf ARCHIVE
```

Or delete individual folders:
```bash
rm -rf ARCHIVE/old_status_reports
rm -rf ARCHIVE/old_how_to_guides
# etc.
```

