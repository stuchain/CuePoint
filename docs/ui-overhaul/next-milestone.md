# Next milestone

**Gate:** Rollout Phase D complete — theme and UI scale live in Qt Settings only.

---

## Rollout Phase D — Appearance (done)

- **Appearance** section at top of Settings dialog (`AppearanceSettingsWidget`)
- Five built-in themes (default **neoDark**) + custom theme CRUD
- UI scale **1× / 2× / 3×** (default **2×**) with integer pixel scaling
- QSettings: `appearance/theme`, `appearance/uiScale`, `appearance/customThemes`
- Applied on startup via `init_appearance()` in `gui_app.py`

---

## Next slices

| Priority | Scope |
| --- | --- |
| Phase 6 | Full GUI parity checklist ([parity-matrix.md](parity-matrix.md)) |
| Phase E | Electron renderer wiring for remaining screens |
| Phase 10 | Qt removal (post-parity) |

---

## Engine / Electron (stable)

Phase 3 P1 complete (jobs, export, inCrate, cancel, SSE). See [tracking/milestone-5.md](tracking/milestone-5.md).
