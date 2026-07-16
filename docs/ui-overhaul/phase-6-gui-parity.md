# Phase 6 — GUI parity matrix

## Purpose

Enumerate **every** current Qt GUI surface under `src/cuepoint/ui/` and map it to a
**parity requirement** for the Electron UI: **route/modal ID**, **engine API**
dependency, and **acceptance notes**. **Full parity** is required before Qt
removal (Phase 10).

**Canonical Electron tree:** `apps/desktop-electron/renderer/src/`

**Prerequisites:** Phases 1, 3, 5.

**Status legend:** `pending` → `implemented` → `verified` (manual or automated).
`waived` = intentional non-parity (ADR / superseded by Electron architecture).

---

## Requirements taxonomy

| Level | Meaning | Verification |
|-------|---------|----------------|
| **P0** | Ship blocker | Automated or rigorous manual |
| **P1** | Should match Qt unless waived by ADR | Manual checklist |
| **P2** | Nice-to-have / cosmetic | Sample-based review |

**Default:** All rows start as **P0** until explicitly downgraded with **ADR**.

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

## Core shell and navigation

| ID | Module | Electron mapping | Status |
|----|--------|------------------|--------|
| P-MW-01 | `main_window.py` | `App.tsx` + `AppMenuBar` + router | implemented |
| P-GUI-01 | `gui_interface.py` | `cuepoint.compat.gui_types` + engine API | implemented |
| P-STR-01 | `strings.py` | Inline copy in React components | implemented |

---

## Widgets — main workflow

| ID | Module | Electron mapping | Status |
|----|--------|------------------|--------|
| P-W-TOOL | `tool_selection_page.py` | `ToolSelectionScreen` | implemented |
| P-W-BATCH | `batch_processor.py` | `InKeyMainScreen` + `useMatchJob` | implemented |
| P-W-RESULTS | `results_view.py` | `ResultsScreen` + `ResultsTable` | implemented |
| P-W-HIST | `history_view.py` | `PastSearchesPanel` | implemented |
| P-W-CFG | `config_panel.py` | `SettingsExportScreen` + theme panels | implemented |
| P-W-PERF | `performance_view.py` | — (dev-only Qt; not shipping) | waived |
| P-W-LOG | `log_viewer.py` | `LogViewerDialog` | implemented |
| P-W-PROG | `progress_widget.py` | `ProgressBar` + job progress UI | implemented |
| P-W-PLAYLIST | `playlist_selector.py` | `BatchPlaylistPicker` / XML playlist hooks | implemented |
| P-W-PLAYFILE | `playlist_file_selector.py` | File pickers + drop zones | implemented |
| P-W-FILE | `file_selector.py` | `useFileDrop` + native dialogs | implemented |
| P-W-STATUS | `status_bar.py` | `EngineStatusBanner` + toasts | implemented |
| P-W-SHORT | `shortcut_manager.py` | `keyboardShortcuts.ts` | implemented |
| P-W-SHORTCUST | `shortcut_customization_dialog.py` | `ShortcutsDialog` (view/edit subset) | implemented |
| P-W-DIALOGS | `dialogs.py` | Shared `Modal` / toast patterns | implemented |
| P-W-CAND | `candidate_dialog.py` | `CandidateDialog` | implemented |
| P-W-CHANGE | `changelog_viewer.py` | About / release notes (subset) | implemented |
| P-W-PRIV | `privacy_settings.py` | `PrivacyDialog` | implemented |
| P-W-ICON | `icon_manager.py` | Electron/app icons + SVG assets | implemented |
| P-W-FOCUS | `focus_manager.py` | Browser focus / a11y defaults | waived |
| P-W-A11Y | `accessibility.py` | HTML semantics + keyboard nav | implemented |
| P-W-THEME | `theme.py` / tokens | `tokens/theme.ts` + ThemeControls | implemented |

---

## Widgets — inCrate

| ID | Module | Electron mapping | Status |
|----|--------|------------------|--------|
| P-W-INC-PAGE | `incrate_page.py` | `InCrateMainScreen` | implemented |
| P-W-INC-INV | `incrate_inventory_section.py` | Inventory section in `InCrateMainScreen` | implemented |
| P-W-INC-IMP | `incrate_import_section.py` | Import section in `InCrateMainScreen` | implemented |
| P-W-INC-DISC | `incrate_discover_section.py` | Discover section in `InCrateMainScreen` | implemented |
| P-W-INC-PL | `incrate_playlist_section.py` | Playlist create section | implemented |
| P-W-INC-RES | `incrate_results_section.py` | Discovery results list | implemented |

---

## Dialogs (`src/cuepoint/ui/dialogs/`)

| ID | Module | Electron mapping | Status |
|----|--------|------------------|--------|
| P-DLG-EXPORT | `export_dialog.py` | `ExportResultsModal` | implemented |
| P-DLG-SETTINGS | `settings_dialog.py` | `SettingsExportScreen` | implemented |
| P-DLG-ONBOARD | `onboarding_dialog.py` | `OnboardingDialog` | implemented |
| P-DLG-FIRSTERR | `first_run_error_reporting_dialog.py` | Covered by `PrivacyDialog` / onboarding | implemented |
| P-DLG-BEATPORT | `beatport_token_dialog.py` | Beatport token fields in Settings | implemented |
| P-DLG-BEATPL | `beatport_playlist_signin_dialog.py` | inCrate playlist create + token gate | implemented |
| P-DLG-DL | `download_progress_dialog.py` | Progress UI during jobs | implemented |
| P-DLG-PREFLIGHT | `preflight_dialog.py` | Preflight checks in inKey flow | implemented |
| P-DLG-SYNC-TAGS | `sync_tags_dialog.py` | `SyncTagsDialog` | implemented |
| P-DLG-SYNC-COMP | `sync_complete_dialog.py` | `SyncCompleteDialog` | implemented |
| P-DLG-RUNSUM | `run_summary_dialog.py` | `RunSummaryDialog` | implemented |
| P-DLG-REPORT | `report_issue_dialog.py` | Support bundle + Help | implemented |
| P-DLG-SUPPORT | `support_dialog.py` | `SupportBundleDialog` | implemented |
| P-DLG-PRIV | `privacy_dialog.py` | `PrivacyDialog` | implemented |
| P-DLG-SHORT | `shortcuts_dialog.py` | `ShortcutsDialog` | implemented |
| P-DLG-CRASH | `crash_dialog.py` | OS/Electron crash reporting (not Qt) | waived |
| P-DLG-DIAG | `diagnostics_panel_dialog.py` | `DiagnosticsDialog` | implemented |
| P-DLG-TELEM | `telemetry_dashboard_dialog.py` | — (internal Qt dashboard) | waived |
| P-DLG-UPD | `update_diagnostic_dialog.py` | — (Qt updater diagnostics) | waived |
| P-DLG-RB-INST | `rekordbox_instructions_dialog.py` | `RekordboxInstructionsDialog` | implemented |
| P-DLG-PL-INST | `playlist_export_instructions_dialog.py` | `PlaylistExportInstructionsDialog` | implemented |

---

## Controllers

| ID | Module | Electron / engine role | Status |
|----|--------|------------------------|--------|
| P-CTL-MAIN | `main_controller.py` | React routes + engine job APIs | implemented |
| P-CTL-RES | `results_controller.py` | Results screen state + engine | implemented |
| P-CTL-EXP | `export_controller.py` | `cuepoint.compat.export_controller` + engine export API | implemented |
| P-CTL-CFG | `config_controller.py` | Settings screen + engine prefs | implemented |

---

## Assets

| ID | Path | Notes | Status |
|----|------|-------|--------|
| P-ASSET-ICON | `ui/assets/icons/*.svg` | Electron build icons + renderer assets | implemented |

---

## Measurable acceptance criteria

- [x] P0 surfaces mapped to Electron with status ≥ `implemented` (waived rows documented).
- [ ] Rows above `verified` after Phase 8 3-OS manual RC.
- [ ] **No** `QMessageBox` code paths left for GA release (grep after Qt deletion).
- [x] **Epic coverage:** E1–E6 each have an Electron surface.
- [ ] **Traceability:** ≥ **80%** of P-DLG-* rows have `opIds` filled (optional polish).

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Hidden dialogs only reachable by edge case | Code search for `QDialog` subclasses; Electron Help menu audit |
| Waived Qt-only tools regress support | Document in release notes; keep Support Bundle as primary path |

---

## Substeps and suggested commits

| ID | Description | Suggested commit message | Verification |
|----|-------------|---------------------------|--------------|
| 6.1 | Add parity matrix (this file) | `docs(ui-overhaul): add phase 6 gui parity matrix` | Done |
| 6.2 | Mark Electron mappings implemented | `docs(ui-overhaul): mark phase 6 parity rows implemented` | Done |
| 6.3 | Verify on 3-OS RC | Phase 8 manual matrix | Pending |

---

## Revision history

| Date | Change | Author |
|------|--------|--------|
| 2026-04-03 | Initial matrix from `src/cuepoint/ui/` | — |
| 2026-04-03 | Added requirements taxonomy, epics, row template, stricter acceptance criteria | — |
| 2026-07-16 | Mapped Electron surfaces; marked implemented/waived | — |
