# Milestone — Phase 9 electron-builder scaffold

**Status:** In progress

## Scope

| Slice | Status |
| --- | --- |
| `electron-builder` config in `package.json` | Done |
| `npm run pack` (unpacked dir) | Done |
| PyInstaller engine sidecar (`build/engine-sidecar.spec`) | Done (Windows validated) |
| `extraResources` bundles `resources/engine/${os}` | Done |
| `npm run pack:full` (sidecar + pack) | Done (script) |
| CI sidecar build step | Done (Windows required; macOS/Linux best-effort) |
| CI publish installers + SHA256SUMS | Pending |

## Usage

```bash
# Dev: Python on PATH
cd apps/desktop-electron && npm run electron:dev

# Build sidecar + copy to resources/engine/<os>/
python scripts/build_engine_sidecar.py

# Full production pack (sidecar + Electron)
cd apps/desktop-electron && npm run pack:full
```

Output: `release/` (platform-specific unpacked app). Packaged builds spawn `resources/engine/cuepoint-engine(.exe)` — no Python install required.
