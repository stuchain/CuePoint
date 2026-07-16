# Phases 6–10 — completion roadmap

Tracks remaining work to finish the full UI overhaul per `docs/ui-overhaul/`.

**Current gate:** Phase 8 manual RC sign-off only (code cutover complete).

---

## Phase 6 — GUI parity (verify + gaps)

| Status | Item |
|--------|------|
| Done | Core routes: Tools, inKey, Results, Settings, inCrate |
| Done | Run summary dialog (Electron) |
| Done | Support bundle export (Electron Help menu) |
| Done | Production app title + Help menu bar |
| Done | Onboarding, privacy, shortcuts, about, diagnostics dialogs |
| Done | Playlist export instructions + Rekordbox help dialogs |
| Done | Log viewer (renderer) + engine logs/privacy clear endpoints |
| Done | Parity matrix rows marked `implemented` / `waived` (Electron mapping) |
| Pending | Mark matrix rows `implemented` → `verified` (after Phase 8 RC) |

See [phase-6-gui-parity.md](phase-6-gui-parity.md).

---

## Phase 7 — Observability

| Status | Item |
|--------|------|
| Done | Engine `POST /api/v1/support/bundle` |
| Done | Electron Help → Export Support Bundle |
| Done | Session correlation ID (shell → engine via `CUEPOINT_SESSION_ID` / `X-Session-Id`) |
| Done | Bundle redaction for `Bearer` and `token=` in logs |
| Done | Log viewer + privacy clear in renderer |

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
| Done | `electron-builder` dist on 3 OSes |
| Done | Installers + SHA256SUMS artifact upload |
| Pending | Code signing / notarization (needs signing keys) |

See [phase-9-ci-release.md](phase-9-ci-release.md).

---

## Phase 10 — Cutover & Qt removal

| Status | Step |
|--------|------|
| Done | `cuepoint.compat` extracted; engine/services off `cuepoint.ui` |
| Done | PySide6 moved to `requirements-qt.txt` |
| Done | `gui_app.py` is Electron-only (no PySide6) |
| Done | `src/cuepoint/ui/` archived to `archive/legacy-pyside6-ui/` |
| Done | Legacy Qt tests gated / archived |
| Pending | RC tag + burn-in |
| Pending | Win / macOS / Linux manual sign-off → mark parity `verified` |

See [phase-10-cutover-remove-qt.md](phase-10-cutover-remove-qt.md).

---

## Suggested remaining work

1. Phase 8 manual RC sign-off (human)
2. Phase 6 parity matrix `verified` after RC
3. Phase 9 code signing when certs are available
