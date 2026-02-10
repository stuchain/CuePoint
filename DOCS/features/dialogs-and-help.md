# Dialogs and Help

## What it is (high-level)

CuePoint uses several **dialogs** and **help** flows:

- **Settings**: paths, export defaults, performance presets, integrity options, telemetry; persisted.
- **Run summary**: after a run, show path, track count, run id; **Verify** (schema + checksums) and **Open folder**.
- **Preflight**: before start, show validation issues (missing playlist, empty tracks, etc.); user can cancel or proceed.
- **Export**: choose format (CSV/Excel), path, options; triggers export_service.
- **Onboarding**: first-run or “How to get started” — steps like “Export your Rekordbox collection to XML”, “Select playlist”, “Start”. May include **Rekordbox instructions** (screenshots: export XML, where to find the file).
- **User guide**: open the user guide (e.g. markdown or HTML in docs).
- **Shortcuts**: list or customize keyboard shortcuts.
- **Privacy / Terms / Licenses / Support policy**: show policy documents (from docs or embedded).
- **About**: app name, version, build, link to changelog or repo.
- **Changelog**: in-app viewer for CHANGELOG or release notes.
- **Update**: “Update Available” dialog (version, download size, Update Now / Update Later / Open Release Page); download progress dialog; “Installation Not Supported” or “Update manually” with Cancel / Update manually (open folder).
- **Crash / error**: crash dialog with “Send report” or “Restart”; report issue dialog (pre-filled context, link to GitHub issues).
- **Diagnostics**: diagnostics panel (for support) and telemetry dashboard (if telemetry is enabled).

## How it is implemented (code)

- **Dialogs**  
  - **File:** `src/cuepoint/ui/dialogs/settings_dialog.py` — settings dialog.  
  - **File:** `src/cuepoint/ui/dialogs/run_summary_dialog.py` — run summary, Verify, Open folder.  
  - **File:** `src/cuepoint/ui/dialogs/preflight_dialog.py` — preflight issues.  
  - **File:** `src/cuepoint/ui/dialogs/export_dialog.py` — export format and path.  
  - **File:** `src/cuepoint/ui/dialogs/onboarding_dialog.py` — onboarding steps.  
  - **File:** `src/cuepoint/ui/resources/images/rekordbox_instructions/` — step1.png, step2.png, step3.png; **rekordbox_instructions_dialog.py** shows “How to export from Rekordbox”.  
  - **File:** `src/cuepoint/ui/dialogs/shortcuts_dialog.py` — shortcuts list.  
  - **File:** `src/cuepoint/ui/dialogs/privacy_dialog.py` — privacy notice.  
  - **File:** `src/cuepoint/ui/widgets/dialogs.py` — `AboutDialog`, `UserGuideDialog`, `ErrorDialog` (or similar).  
  - **File:** `src/cuepoint/ui/main_window.py` — `on_show_about()`, `on_show_changelog()`, `on_show_user_guide()`, `on_show_onboarding()`, `on_show_shortcuts()`, `on_show_privacy()`, `on_show_terms()`, `on_show_licenses()`, `on_show_support_policy()`, `on_open_settings()`, `on_export_results()`.  
  - **File:** `src/cuepoint/ui/dialogs/update_diagnostic_dialog.py` — “Update Available” with version, download size, Update Now / Update Later / Open Release Page.  
  - **File:** `src/cuepoint/ui/dialogs/download_progress_dialog.py` — download progress for update.  
  - **File:** `src/cuepoint/ui/main_window.py` — `_show_manual_install_dialog()`, `_open_installer_folder()` for “Update manually” flow.  
  - **File:** `src/cuepoint/ui/dialogs/crash_dialog.py` — crash dialog.  
  - **File:** `src/cuepoint/ui/dialogs/report_issue_dialog.py` — report issue with context.  
  - **File:** `src/cuepoint/ui/dialogs/diagnostics_panel_dialog.py` — diagnostics panel.  
  - **File:** `src/cuepoint/ui/dialogs/telemetry_dashboard_dialog.py` — telemetry dashboard.

- **Policy docs**  
  - **File:** `src/cuepoint/utils/policy_docs.py` — `find_privacy_notice()`, `find_terms_of_use()`, `load_policy_text()`; points to docs/policy or packaged files.

- **Changelog**  
  - **File:** `src/cuepoint/ui/widgets/changelog_viewer.py` — loads and displays CHANGELOG (e.g. from docs/release/CHANGELOG.md or bundled).

So: **what the feature is** = “settings, run summary, preflight, export, onboarding, user guide, shortcuts, privacy/terms/licenses/support, about, changelog, update dialogs, crash/report issue, diagnostics and telemetry”; **how it’s implemented** = various files under `ui/dialogs/` and `ui/widgets/` + main_window handlers + policy_docs + changelog_viewer.
