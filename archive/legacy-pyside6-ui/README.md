# Legacy Qt desktop UI

This package contains the **deprecated PySide6 GUI**. The shipped desktop app is
[`apps/desktop-electron`](../../../apps/desktop-electron).

## Running the legacy UI

Install optional Qt dependencies, then pass `--legacy-qt`:

```bash
pip install -r requirements-qt.txt
python src/gui_app.py --legacy-qt
```

## Shared types moved out of `cuepoint.ui`

Engine, services, and tests should import compatibility helpers from
[`cuepoint.compat`](../compat/) instead of this package:

- `cuepoint.compat.gui_types` — progress/result types, processing controller protocol
- `cuepoint.compat.export_controller` — export orchestration used by engine/CLI

The modules `cuepoint.ui.gui_interface` and `cuepoint.ui.controllers.export_controller`
remain as thin re-export shims during removal.

## Removal plan (Phase 10)

1. Extract any remaining non-Qt helpers into `cuepoint.compat` or engine APIs.
2. Retire Qt-only tests or gate them behind `requirements-qt.txt`.
3. Delete this package once Electron is the only desktop entry point.
