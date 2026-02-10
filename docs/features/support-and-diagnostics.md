# Support and Diagnostics

## What it is (high-level)

- **Support bundle**: the user (or CLI with `--export-support-bundle`) can **generate a support bundle**: a zip (or folder) containing **diagnostics** (platform, version, config summary), **logs** (recent log files), and **config** (sanitized). Used for support and bug reports.
- **Log viewer**: in-app **log viewer** (Help → Log viewer or Support menu) shows recent application logs in a scrollable view; may filter by level or search.
- **Open logs folder / exports folder**: menu actions to **open** the logs directory or exports directory in the system file manager (e.g. Finder, Explorer).
- **Report issue**: **Report issue** dialog (or menu) opens the default browser to the project’s GitHub issues (or similar) and may pre-fill title/body with version and context (e.g. “CuePoint 1.0.0-feb14”); optionally copies support bundle path or attaches context.
- **Diagnostics panel**: a **diagnostics** dialog (e.g. for support staff) shows connection state, update button state, config flags, and other technical details.
- **Crash handler**: on **uncaught exception**, a **crash dialog** is shown (instead of silent exit): message, optional “Send report” (if implemented), “Restart” or “Quit”. Crash handler may log the traceback and write a minidump or report file .
- **Error reporting preferences**: user can opt in/out of **automatic error reporting** (e.g. send crash reports or telemetry); preferences stored in config or a dedicated prefs file.

## How it is implemented (code)

- **Support bundle**  
  - **File:** `src/cuepoint/utils/support_bundle.py` — **SupportBundleGenerator.generate_bundle(output_dir, include_logs, include_config, sanitize)** (or similar): gathers app version, platform, Python version (if applicable), list of config keys (values sanitized), recent log file paths; copies logs and writes a manifest; zips or writes to output_dir. Returns path to bundle.  
  - **File:** `src/main.py` — when `--export-support-bundle` is set, calls SupportBundleGenerator.generate_bundle(AppPaths.exports_dir(), ...) and prints path, then exits.  
  - **File:** `src/cuepoint/ui/main_window.py` — `on_export_support_bundle()` opens a save dialog or uses default exports dir and calls the generator, then shows success message or “Open folder”.

- **Log viewer**  
  - **File:** `src/cuepoint/ui/widgets/log_viewer.py` — widget or dialog that reads log files (from AppPaths or logging config), displays lines in a QTextEdit or list; optional level filter and search.  
  - **File:** `src/cuepoint/ui/main_window.py` — `on_show_log_viewer()` opens the log viewer dialog.

- **Open folders**  
  - **File:** `src/cuepoint/ui/main_window.py` — `on_open_logs_folder()`, `on_open_exports_folder()` call `_open_folder(path)` which uses `subprocess.Popen(["open", path])` (macOS) or `explorer path` (Windows) or `xdg-open` (Linux). Paths from **AppPaths** (e.g. `AppPaths.logs_dir()`, `AppPaths.exports_dir()`).

- **Report issue**  
  - **File:** `src/cuepoint/ui/dialogs/report_issue_dialog.py` — builds URL (e.g. GitHub new issue with query params or body template); includes version, OS; may copy support bundle path to clipboard.  
  - **File:** `src/cuepoint/ui/main_window.py` — `on_report_issue()` opens report issue dialog or directly opens URL via QDesktopServices.openUrl.

- **Diagnostics panel**  
  - **File:** `src/cuepoint/ui/dialogs/diagnostics_panel_dialog.py` — shows update manager state, download button connected, config snippets, network state (if available).  
  - **File:** `src/cuepoint/ui/main_window.py` — `_on_show_diagnostics_panel()` opens this dialog.

- **Crash handler**  
  - **File:** `src/cuepoint/utils/crash_handler.py` — installs sys.excepthook (and possibly Qt message handler): on uncaught exception, log traceback, show **CrashDialog** (message, “Restart”, “Quit”, optional “Send report”). Restart may relaunch the app via subprocess.  
  - **File:** `src/cuepoint/ui/dialogs/crash_dialog.py` — crash dialog UI.  
  - **File:** `src/cuepoint/utils/error_reporting_prefs.py` (or similar) — get/set “send crash reports” / “send telemetry”; used by crash handler and telemetry.

- **Paths**  
  - **File:** `src/cuepoint/utils/paths.py` — **AppPaths**: logs_dir(), exports_dir(), config path; ensures directories exist.

So: **what the feature is** = “support bundle, log viewer, open logs/exports folders, report issue, diagnostics panel, crash dialog and excepthook”; **how it’s implemented** = support_bundle.py + main.py (--export-support-bundle) + main_window (export bundle, log viewer, open folders, report issue, diagnostics) + log_viewer + report_issue_dialog + diagnostics_panel_dialog + crash_handler + crash_dialog + error_reporting_prefs + paths.AppPaths.
