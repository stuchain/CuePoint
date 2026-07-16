# Legacy Code Module

This directory contains legacy code that has been replaced by the Phase 5 architecture.

## ⚠️ Deprecation Notice

**DO NOT USE THESE MODULES IN NEW CODE**

All code in this directory is deprecated and kept only for:
- Backward compatibility with old test files
- Reference during migration
- Historical record

## Modules

### `processor.py`

**Status**: ❌ Deprecated  
**Replaced by**: `ProcessorService` (via DI container) and `CLIProcessor`

**What it was**: Old processor implementation that directly handled CLI processing, file output, and progress display.

**Why it was moved**: 
- Mixed concerns (processing + CLI + file I/O)
- Didn't use dependency injection
- Used old data models
- Not compatible with Phase 5 architecture

**Migration path**:
- For CLI: Use `CLIProcessor` from `cuepoint.cli.cli_processor`
- For processing: Use `ProcessorService` from DI container
- For file output: Use `ExportService` from DI container

**Example migration**:
```python
# OLD (deprecated - now in legacy):
from cuepoint.legacy.processor import run  # Still works but deprecated
run(xml_path, playlist_name, out_csv_base)

# NEW (Phase 5 - recommended):
from cuepoint.cli.cli_processor import CLIProcessor
from cuepoint.utils.di_container import get_container
from cuepoint.services.interfaces import (
    IProcessorService, IExportService, IConfigService, ILoggingService
)

container = get_container()
cli_processor = CLIProcessor(
    processor_service=container.resolve(IProcessorService),
    export_service=container.resolve(IExportService),
    config_service=container.resolve(IConfigService),
    logging_service=container.resolve(ILoggingService),
)
cli_processor.process_playlist(xml_path, playlist_name, out_csv_base)
```

---

### `gui/` (Directory)

**Status**: ❌ Deprecated  
**Replaced by**: `apps/desktop-electron/` for the shipped desktop UI.
Qt sources live under `archive/legacy-pyside6-ui/` (not importable).

**What it was**: Old GUI implementation with widgets and controllers in `src/gui/` directory.

**Why it was moved**: 
- Used legacy processor (`gui_controller.py` used `legacy.processor`)
- Not using Phase 5 architecture
- Replaced by the Electron desktop shell
- No longer on the product path

**Migration path**:
- For desktop UI work: use `apps/desktop-electron/`
- Historical Qt sources: `archive/legacy-pyside6-ui/`

**Example migration**:
```python
# OLD (deprecated - now in legacy):
from gui.main_window import MainWindow
from gui_controller import GUIController

# NEW (current product):
# Desktop shell lives in apps/desktop-electron/
# python src/gui_app.py  # launches Electron
```

### `gui_controller.py`

**Status**: ❌ Deprecated  
**Replaced by**: Electron shell + engine HTTP APIs (`apps/desktop-electron`)

**What it was**: Old GUI controller that used legacy processor.

**Why it was moved**: 
- Used `legacy.processor` instead of `ProcessorService`
- Part of old GUI structure
- Replaced by new controller in Phase 5, then Electron

**Migration path**:
- Use Electron + engine APIs
- New controller uses `ProcessorService` via DI container

## Removal Plan

These modules will be removed in a future version after:
1. All test files are updated to use new architecture
2. All external dependencies are migrated
3. A deprecation period has passed

## Questions?

See:
- `docs/phases/05_Phase_5_Code_Restructuring/11_Step_5.11_CLI_Migration.md` - CLI migration guide
- `docs/designs/05_CLI_Migration_Design.md` - Design document
- `src/cuepoint/cli/cli_processor.py` - New CLI implementation
- `src/cuepoint/services/processor_service.py` - New processor service

