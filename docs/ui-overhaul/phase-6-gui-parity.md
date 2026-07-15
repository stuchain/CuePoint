# Phase 6 — GUI parity matrix

## Purpose

Enumerate **every** current Qt GUI surface under `src/cuepoint/ui/` and map it to a **parity requirement** for the Electron UI: **route/modal ID**, **engine API** dependency, and **acceptance notes**. **Full parity** is required before Qt removal (Phase 10).

**Canonical source tree:** `src/cuepoint/ui/` (if `SRC/` duplicates exist, reconcile to **one**).

**Prerequisites:** Phases 1, 3, 5.

**Outcomes:** Checklist with **IDs** for traceability in design (Phase 1) and tests (Phase 8).

---

## Requirements taxonomy

| Level | Meaning | Verification |
|-------|---------|----------------|
| **P0** | Ship blocker | Automated or rigorous manual |
| **P1** | Should match Qt unless waived by ADR | Manual checklist |
| **P2** | Nice-to-have / cosmetic | Sample-based review |

**Default:** All rows start as **P0** until explicitly downgraded with **ADR** (e.g. deprecated dialog).

---

## Epic grouping (for incremental delivery)

| Epic | Row IDs (prefix) | User journey |
|------|------------------|--------------|
| E1 Shell | P-MW, P-W-TOOL, P-W-STATUS | Open app, pick tool |
| E2 Match | P-W-BATCH, P-W-RESULTS, P-W-HIST, P-W-CAND | Core workflow |
| E3 Export | P-DLG-EXPORT, P-CTL-EXP | Output |
| E4 Settings | P-DLG-SETTINGS, P-W-CFG, P-W-PRIV | Preferences |
| E5 inCrate | P-W-INC-* | Secondary product surface |
| E6 Support | P-DLG-SUPPORT, P-DLG-DIAG, P-W-LOG | Diagnostics |

---

## Row template (apply when expanding a row)

Each **parity ID** SHOULD eventually include:

| Field | Description |
|-------|-------------|
| **Route / modal** | Where it lives in React |
| **opIds** | OpenAPI operations |
| **P0/P1/P2** | Priority |
| **Happy path test** | Link to Phase 8 case id |
| **Edge cases** | From Qt code comments or issues |

---

## How to use this matrix

- **Status:** `pending` → `implemented` → `verified` (manual or automated).
- **API:** Link to OpenAPI operation IDs when defined (Phase 3).
- **Suggested commits:** One feature slice per row group, e.g. `feat(ui): parity for export dialog (P-DLG-EXPORT)`.

---

## Core shell and navigation

| ID | Module | Description | API / events | Status |
|----|--------|-------------|--------------|--------|
| P-MW-01 | `main_window.py` | Main window, menus, page stack, update system hooks | Multiple | pending |
| P-GUI-01 | `gui_interface.py` | GUI/controller interface boundaries | — | pending |
| P-STR-01 | `strings.py` | Centralized UI strings / i18n readiness | — | pending |

**Priority default:** Unless an ADR demotes an item, treat every matrix row as **P0** (ship blocker for parity).

---

## Widgets — main workflow

| ID | Module | Description | Status |
|----|--------|-------------|--------|
| P-W-TOOL | `widgets/tool_selection_page.py` | Tool selection landing | pending |
| P-W-BATCH | `widgets/batch_processor.py` | Batch / processing workflow | pending |
| P-W-RESULTS | `widgets/results_view.py` | Results table / view | pending |
| P-W-HIST | `widgets/history_view.py` | History | pending |
| P-W-CFG | `widgets/config_panel.py` | Configuration panel | pending |
| P-W-PERF | `widgets/performance_view.py` | Performance view | pending |
| P-W-LOG | `widgets/log_viewer.py` | Log viewer | pending |
| P-W-PROG | `widgets/progress_widget.py` | Progress | pending |
| P-W-PLAYLIST | `widgets/playlist_selector.py` | Playlist selector | pending |
| P-W-PLAYFILE | `widgets/playlist_file_selector.py` | Playlist file selector | pending |
| P-W-FILE | `widgets/file_selector.py` | Generic file selection | pending |
| P-W-STATUS | `widgets/status_bar.py` | Status bar | pending |
| P-W-SHORT | `widgets/shortcut_manager.py` | Shortcuts | pending |
| P-W-SHORTCUST | `widgets/shortcut_customization_dialog.py` | Shortcut customization | pending |
| P-W-DIALOGS | `widgets/dialogs.py` | Shared dialog helpers | pending |
| P-W-CAND | `widgets/candidate_dialog.py` | Candidate selection | pending |
| P-W-CHANGE | `widgets/changelog_viewer.py` | Changelog viewer | pending |
| P-W-PRIV | `widgets/privacy_settings.py` | Privacy settings widget | pending |
| P-W-ICON | `widgets/icon_manager.py` | Icons | pending |
| P-W-FOCUS | `widgets/focus_manager.py` | Focus management | pending |
| P-W-A11Y | `widgets/accessibility.py` | Accessibility helpers | pending |
| P-W-THEME | `widgets/theme.py`, `theme_tokens.py`, `styles.py` | Theming (replace with pixel system) | pending |

---

## Widgets — inCrate

| ID | Module | Description | Status |
|----|--------|-------------|--------|
| P-W-INC-PAGE | `widgets/incrate_page.py` | inCrate page shell | pending |
| P-W-INC-INV | `widgets/incrate_inventory_section.py` | Inventory | pending |
| P-W-INC-IMP | `widgets/incrate_import_section.py` | Import | pending |
| P-W-INC-DISC | `widgets/incrate_discover_section.py` | Discover | pending |
| P-W-INC-PL | `widgets/incrate_playlist_section.py` | Playlist section | pending |
| P-W-INC-RES | `widgets/incrate_results_section.py` | Results section | pending |

---

## Dialogs (`src/cuepoint/ui/dialogs/`)

| ID | Module | Description | Status |
|----|--------|-------------|--------|
| P-DLG-EXPORT | `export_dialog.py` | Export | pending |
| P-DLG-SETTINGS | `settings_dialog.py` | Settings | pending |
| P-DLG-ONBOARD | `onboarding_dialog.py` | Onboarding | pending |
| P-DLG-FIRSTERR | `first_run_error_reporting_dialog.py` | First-run error reporting | pending |
| P-DLG-BEATPORT | `beatport_token_dialog.py` | Beatport token | pending |
| P-DLG-BEATPL | `beatport_playlist_signin_dialog.py` | Beatport playlist sign-in | pending |
| P-DLG-DL | `download_progress_dialog.py` | Download progress | pending |
| P-DLG-PREFLIGHT | `preflight_dialog.py` | Preflight | pending |
| P-DLG-SYNC-TAGS | `sync_tags_dialog.py` | Sync tags | pending |
| P-DLG-SYNC-COMP | `sync_complete_dialog.py` | Sync complete | pending |
| P-DLG-RUNSUM | `run_summary_dialog.py` | Run summary | pending |
| P-DLG-REPORT | `report_issue_dialog.py` | Report issue | pending |
| P-DLG-SUPPORT | `support_dialog.py` | Support | pending |
| P-DLG-PRIV | `privacy_dialog.py` | Privacy | pending |
| P-DLG-SHORT | `shortcuts_dialog.py` | Shortcuts | pending |
| P-DLG-CRASH | `crash_dialog.py` | Crash | pending |
| P-DLG-DIAG | `diagnostics_panel_dialog.py` | Diagnostics | pending |
| P-DLG-TELEM | `telemetry_dashboard_dialog.py` | Telemetry dashboard | pending |
| P-DLG-UPD | `update_diagnostic_dialog.py` | Update diagnostics | pending |
| P-DLG-RB-INST | `rekordbox_instructions_dialog.py` | Rekordbox instructions | pending |
| P-DLG-PL-INST | `playlist_export_instructions_dialog.py` | Playlist export instructions | pending |

---

## Controllers

| ID | Module | Role in parity | Status |
|----|--------|----------------|--------|
| P-CTL-MAIN | `controllers/main_controller.py` | Orchestration | pending |
| P-CTL-RES | `controllers/results_controller.py` | Results | pending |
| P-CTL-EXP | `controllers/export_controller.py` | Export | pending |
| P-CTL-CFG | `controllers/config_controller.py` | Config | pending |

---

## Assets

| ID | Path | Notes | Status |
|----|------|-------|--------|
| P-ASSET-ICON | `ui/assets/icons/*.svg` | Replace or rasterize for pixel theme | pending |

---

## Alternatives considered

| Strategy | Pros | Cons |
|----------|------|------|
| Screen-by-screen | Incremental | Integration gaps |
| **API-first** then UI | Stable contract | Slower visible UI |

**Recommendation:** Parallel **API** (Phase 3) with **shell** (Phase 4), then parity by **user journey**: tool selection → match → results → export → settings.

---

## Measurable acceptance criteria

- [ ] **100%** rows above `verified` for required release (P0 set).
- [ ] **No** `QMessageBox` code paths left for that release (grep).
- [ ] **Epic coverage:** each epic E1–E6 has at least one **end-to-end** manual or automated run before RC.
- [ ] **Traceability:** ≥ **80%** of P-DLG-* rows have `opIds` filled before feature-complete (adjust target if ADR changes).

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Hidden dialogs only reachable by edge case | Code search for `QDialog` subclasses |

---

## Substeps and suggested commits

| ID | Description | Suggested commit message | Verification |
|----|-------------|---------------------------|--------------|
| 6.1 | Add parity matrix (this file) | `docs(ui-overhaul): add phase 6 gui parity matrix` | |
| 6.2 | Mark first journey verified (future) | `test(ui): verify parity for tool selection and match flow` | Checklist |
| 6.3 | Add script to list Qt dialog classes (future) | `chore: add script to enumerate pyqt dialog subclasses` | |

---

## Revision history

| Date | Change | Author |
|------|--------|--------|
| 2026-04-03 | Initial matrix from `src/cuepoint/ui/` | — |
| 2026-04-03 | Added requirements taxonomy, epics, row template, stricter acceptance criteria | — |
