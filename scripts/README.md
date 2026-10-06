# Scripts Directory

This folder collects helper scripts used for development, testing, and maintenance.

## Setup

- `setup/install_requirements.sh`: Installs Python requirements on Linux/macOS.

## Repository audit

- `audit_dead_code.py`: Reports what nothing shipped or run reaches (Python modules, scripts,
  workflows, Electron and renderer files, exports, CSS, docs, dependencies) and changes nothing.
  `python scripts/audit_dead_code.py --output report.md`. Phase 12's audit
  (`docs/v1/PHASE12_AUDIT.md`) is written from it.
- `bench_engine_start.py`: Times the engine from launch to a healthy `/health`, each run in a
  fresh temporary home. `python scripts/bench_engine_start.py [--exe <packaged engine>]`.

## Notes

- Scripts are grouped by intent. Run the CLI with `main.py`, and the desktop app with
  `npm run electron:start` in `apps/desktop-electron`.
