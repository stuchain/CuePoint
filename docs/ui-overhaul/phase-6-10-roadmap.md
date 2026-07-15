# Phases 6–10 — completion roadmap

Tracks remaining work to finish the full UI overhaul per `docs/ui-overhaul/`.

**Current gate:** Phases 7–9 slices landing (support bundle, Playwright smoke, Electron CI).

---

## Phase 6 — GUI parity (verify + gaps)

| Status | Item |
|--------|------|
| Done | Core routes: Tools, inKey, Results, Settings, inCrate |
| Done | Run summary dialog (Electron) |
| Done | Support bundle export (Electron Help menu) |
| Done | Production app title + Help menu bar |
| Done | Onboarding, privacy, shortcuts, about, diagnostics dialogs |
| Pending | Instruction dialogs (Rekordbox, playlist export) |
| Pending | Log viewer, crash handler |
| Pending | Mark matrix rows `implemented` → `verified` |

See [phase-6-gui-parity.md](phase-6-gui-parity.md).

---

## Phase 7 — Observability

| Status | Item |
|--------|------|
| Done | Engine `POST /api/v1/support/bundle` |
| Done | Electron Help → Export Support Bundle |
| Done | Session correlation ID (shell → engine via `CUEPOINT_SESSION_ID` / `X-Session-Id`) |
| Done | Bundle redaction for `Bearer` and `token=` in logs |
| Pending | Log viewer + diagnostics panel in renderer |

See [phase-7-observability.md](phase-7-observability.md).

---

## Phase 8 — Testing

| Status | Item |
|--------|------|
| Done | Lab RC matrix ([manual-test-matrix-lab-rc.md](manual-test-matrix-lab-rc.md)) |
| Done | Playwright Electron smoke (`e2e/smoke.spec.ts`) |
| Pending | 3-OS manual sign-off |
| Pending | OpenAPI contract tests (optional nightly) |

See [phase-8-testing.md](phase-8-testing.md).

---

## Phase 9 — CI & release

| Status | Item |
|--------|------|
| Done | Electron CI workflow (3-OS matrix) |
| Done | Engine `/health` smoke in CI |
| Done | Shell ↔ engine version coupling check |
| In progress | `electron-builder` pack script (engine bundling pending) |
| Pending | Installers + SHA256SUMS for Electron artifacts |

See [phase-9-ci-release.md](phase-9-ci-release.md).

---

## Phase 10 — Cutover & Qt removal

Blocked until Phases 6–9 gates pass.

| Step | Action |
|------|--------|
| 1 | RC tag + burn-in |
| 2 | Win / macOS / Linux sign-off |
| 3 | Repoint/remove `src/gui_app.py` |
| 4 | Delete `src/cuepoint/ui/` |
| 5 | Drop PySide6 from packaging |
| 6 | Update install docs |

See [phase-10-cutover-remove-qt.md](phase-10-cutover-remove-qt.md).

---

## Suggested commit order (remaining)

1. Phase 7 support bundle (engine + Electron + Help menu)
2. Phase 6 run summary + production shell title
3. Phase 8 Playwright smoke skeleton
4. Phase 9 Electron CI workflow
5. Phase 6 secondary dialogs (privacy, shortcuts, onboarding)
6. Phase 10 cutover PR
