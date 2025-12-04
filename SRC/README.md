# SRC Directory

This directory contains the source code for the CuePoint application.

## Structure

```
SRC/
├── __init__.py              # Package initialization
├── gui_app.py               # GUI application entry point
├── main.py                  # CLI application entry point
├── cuepoint/                # Main application package
│   ├── cli/                 # CLI components
│   ├── core/                # Core business logic
│   ├── data/                # Data access layer
│   ├── models/              # Data models
│   ├── services/            # Service layer
│   ├── ui/                  # User interface
│   ├── utils/               # Utility functions
│   ├── exceptions/          # Exception definitions
│   └── legacy/              # Legacy code (for reference)
│       └── old_modules/     # Old module files (migrated to new structure)
└── tests/                   # Test suite
    ├── unit/                # Unit tests
    ├── integration/         # Integration tests
    ├── ui/                  # UI tests
    └── performance/         # Performance tests
```

## Entry Points

- **GUI Application**: Run `python gui_app.py` or use `run_gui.bat`/`run_gui.sh` from project root
- **CLI Application**: Run `python main.py` with appropriate arguments

## Main Application Code

All working application code is in the `cuepoint/` package:
- `cuepoint/core/` - Core business logic (matcher, query generator, text processing)
- `cuepoint/data/` - Data access (Beatport, Rekordbox)
- `cuepoint/services/` - Service layer (processor, matcher, export, config)
- `cuepoint/ui/` - User interface components
- `cuepoint/models/` - Data models
- `cuepoint/utils/` - Utility functions
- `cuepoint/cli/` - CLI processor

## Legacy Code

Old module files that have been migrated to the new structure are kept in `cuepoint/legacy/old_modules/` for reference.

## Development Scripts

Development and test scripts have been moved to:
- `scripts/` (project root) - Development and analysis scripts
- `tests/` - Test scripts and runners

