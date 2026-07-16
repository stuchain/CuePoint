# src directory

This directory contains the source code for the CuePoint application.

## Structure

```
src/
├── __init__.py              # Package initialization
├── gui_app.py               # Legacy Qt fallback entry point
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

- **Desktop Application**: Run `cd apps/desktop-electron && npm run electron:dev`
- **CLI Application**: Run `python main.py` with appropriate arguments

## Main Application Code

All working application code is in the `cuepoint/` package:
- `cuepoint/core/` - Core business logic (matcher, query generator, text processing)
- `cuepoint/data/` - Data access (Beatport, Rekordbox)
- `cuepoint/services/` - Service layer (processor, matcher, export, config)
- `cuepoint/ui/` - Legacy Qt user interface components (Phase 10 removal)
- `cuepoint/models/` - Data models
- `cuepoint/utils/` - Utility functions
- `cuepoint/cli/` - CLI processor

## Legacy Code

Old module files that have been migrated to the new structure are kept in `cuepoint/legacy/old_modules/` for reference.

## Development Scripts

Development and test scripts have been moved to:
- `scripts/` (project root) - Development and analysis scripts
- `tests/` - Test scripts and runners

