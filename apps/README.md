# CuePoint apps

| App | Purpose |
|-----|---------|
| [desktop-electron](desktop-electron/) | Electron shell + React pixel UI renderer (UI overhaul) |

The UI lab was promoted to `desktop-electron/renderer/`. Run `npm run dev` from `desktop-electron/` or `desktop-electron/renderer/`.

Legacy Qt GUI remains at `src/gui_app.py` only as a temporary fallback during
Phase 10 removal work. New desktop UI changes should target `desktop-electron/`.
