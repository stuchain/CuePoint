 # Step 7: Observability and Supportability Design
 
 ## Purpose
 Provide diagnostics, crash reporting, and support tooling to reduce MTTR.
 
 ## Current State
 - Logging exists.
 - Limited diagnostics export.
 
 ## Proposed Implementation
 
 ### 7.1 Structured Logs
 - Standard format with version, OS, and run ID.
 - Rotate logs with size limits and count.
 
 ### 7.2 Crash Reporting
 - Global exception handler.
 - Optional, opt-in crash reporting.
 - Crash bundle zip (logs + diagnostics JSON).
 
 ### 7.3 Support UX
 - “Report Issue” in Help menu.
 - “Export Support Bundle” action.
 
 ## Code Touchpoints
 - `SRC/cuepoint/services/logging_service.py`
 - `SRC/gui_app.py` (exception hook)
 - `SRC/cuepoint/ui/` (Help menu actions)
 
 ## Example Crash Bundle Structure
 ```
 support_bundle.zip
 ├─ diagnostics.json
 ├─ logs/cuepoint.log
 └─ crashes/crash-YYYYMMDD-HHMMSS.log
 ```
 
 ## Testing Plan
 - Induce a controlled exception and verify crash bundle creation.
 - Validate support bundle includes required files.
 
 ## Acceptance Criteria
 - Crashes generate actionable diagnostics.
 - Users can export support bundles easily.
 
 ---
 
 ## 7.4 Observability Principles
 
 - Structured logs.
 - Minimal PII.
 - Diagnostics export.
 
 ## 7.5 Log Schema
 
 - `timestamp`
 - `level`
 - `event`
 - `run_id`
 
 ## 7.6 Support Bundle Contents
 
 - Logs
 - Crash reports
 - Diagnostics JSON
 
 ## 7.7 Support UX
 
 - Help menu actions.
 - "Report issue" link.
 
 ## 7.8 Tests
 
 - Crash bundle generation.
 - Log rotation.
 
 ## 7.9 Observability Architecture
 
 - Central logging service.
 - Crash handler hook.
 - Diagnostics exporter.
 - Optional telemetry (opt-in).
 
 ## 7.10 Observability Data Flow
 
 - App events → logger.
 - Errors → crash handler.
 - Diagnostics → support bundle.
 
 ## 7.11 Observability Goals
 
 - Reduce mean time to detect.
 - Reduce mean time to resolve.
 - Provide actionable artifacts.
 
 ## 7.12 Log Levels
 
 - DEBUG: verbose details.
 - INFO: normal events.
 - WARNING: recoverable issues.
 - ERROR: failures.
 - CRITICAL: crash-level.
 
 ## 7.13 Log Format (Text)
 
 ```
 2026-01-31T12:00:00Z INFO run_started run_id=abc123
 ```
 
 ## 7.14 Log Format (JSON)
 
 ```json
 {"ts":"2026-01-31T12:00:00Z","lvl":"INFO","event":"run_started","run_id":"abc123"}
 ```
 
 ## 7.15 Log Rotation Policy
 
 - Max size: 5MB.
 - Max files: 5.
 - Oldest deleted first.
 
 ## 7.16 Log Redaction Rules
 
 - Replace home directory with `~`.
 - Redact full XML paths.
 
 ## 7.17 Log Redaction Tests
 
 - No `C:\\Users\\` in logs.
 - No `/Users/` in logs.
 
 ## 7.18 Log Categories
 
 - `app`
 - `run`
 - `network`
 - `update`
 - `security`
 - `support`
 
 ## 7.19 Log Event Taxonomy
 
 - `run_started`
 - `run_completed`
 - `run_failed`
 - `retry_attempt`
 - `checkpoint_saved`
 - `update_check`
 - `update_verify`
 
 ## 7.20 Log Fields (Required)
 
 - `timestamp`
 - `level`
 - `event`
 - `run_id`
 - `version`
 - `os`
 
 ## 7.21 Log Fields (Optional)
 
 - `track_id`
 - `duration_ms`
 - `error_code`
 
 ## 7.22 Crash Handling Strategy
 
 - Install global exception hook.
 - Capture traceback.
 - Save crash file.
 - Prompt user to export bundle.
 
 ## 7.23 Crash Bundle Contents (Expanded)
 
 - `diagnostics.json`
 - `logs/cuepoint.log`
 - `crashes/crash-*.log`
 - `config_snapshot.json`
 - `recent_run_summary.json`
 
 ## 7.24 Crash Bundle Schema (Diagnostics)
 
 ```json
 {
   "version": "1.2.3",
   "os": "Windows 11",
   "run_id": "abc123",
   "settings": {"telemetry": false}
 }
 ```
 
 ## 7.25 Crash Handler UX
 
 - "The app encountered an error."
 - "Export support bundle?"
 
 ## 7.26 Crash Handler Actions
 
 - Export bundle.
 - Copy error details.
 - Close app.
 
 ## 7.27 Support Bundle Export Flow
 
 - User clicks export.
 - Bundle created.
 - File saved to desktop or chosen folder.
 
 ## 7.28 Support Bundle Size Limit
 
 - Max size 50MB.
 - Trim logs if larger.
 
 ## 7.29 Support Bundle Redaction
 
 - Redact sensitive fields before zip.
 
 ## 7.30 Diagnostics JSON Fields
 
 - App version.
 - OS version.
 - Python version.
 - Config flags.
 
 ## 7.31 Diagnostics JSON Example
 
 ```json
 {"version":"1.2.3","os":"Windows 11","python":"3.13.1"}
 ```
 
 ## 7.32 Support UX Placement
 
 - Help menu -> "Report Issue".
 - Help menu -> "Export Support Bundle".
 
 ## 7.33 Support UX Copy
 
 - "Report Issue (opens GitHub)"
 - "Export Support Bundle (zip)"
 
 ## 7.34 Support Issue Template Fields
 
 - App version.
 - OS version.
 - Steps to reproduce.
 - Support bundle attached.
 
 ## 7.35 Support Link Handling
 
 - Open issue template URL with prefilled parameters.
 
 ## 7.36 Telemetry (Optional)
 
 - Opt-in only.
 - No PII.
 - Aggregate counts.
 
 ## 7.37 Telemetry Events (Optional)
 
 - `run_start`
 - `run_complete`
 - `error_event`
 
 ## 7.38 Telemetry Data Scrubbing
 
 - Remove file paths.
 - Hash run IDs.
 
 ## 7.39 Observability Tests (Unit)
 
 - Log formatting.
 - Log rotation.
 - Redaction.
 
 ## 7.40 Observability Tests (Integration)
 
 - Crash bundle generation.
 - Support bundle contents.
 
 ## 7.41 Observability Tests (System)
 
 - Trigger crash and verify UX.
 - Export bundle and verify zip.
 
 ## 7.42 Observability Metrics
 
 - Crash rate per version.
 - Support bundle export count.
 - Retry events per run.
 
 ## 7.43 Observability Alerts
 
 - Spike in crash rate.
 - Increase in retry failures.
 
 ## 7.44 Observability Dashboard (Optional)
 
 - Show crash rate.
 - Show run success rate.
 
 ## 7.45 Observability Retention Policy
 
 - Logs: 7 days.
 - Crash files: 10 files max.
 
 ## 7.46 Observability Config
 
 ```yaml
 observability:
   log_level: INFO
   log_max_mb: 5
   log_files: 5
   crash_reporting: false
 ```
 
 ## 7.47 Observability Config Validation
 
 - `log_max_mb >= 1`
 - `log_files >= 2`
 - `log_level` valid enum
 
 ## 7.48 Observability Config Defaults
 
 - INFO logging.
 - Crash reporting disabled.
 - Redaction enabled.
 
 ## 7.49 Observability Code Touchpoints (Expanded)
 
 - `logging_service.py`
 - `gui_app.py`
 - `ui/help_menu.py`
 - `services/processor_service.py`
 
 ## 7.50 Observability Event Map
 
 - `run_started` → on run start.
 - `run_completed` → on completion.
 - `run_failed` → on failure.
 - `retry_attempt` → on retry.
 
 ## 7.51 Observability Event Example
 
 ```json
 {"event":"run_completed","run_id":"abc123","duration_ms":120000}
 ```
 
 ## 7.52 Observability Run IDs
 
 - Generate UUID at run start.
 - Include in all logs and outputs.
 
 ## 7.53 Observability for CLI
 
 - Print run ID at start.
 - Print log path at end.
 
 ## 7.54 Observability CLI Example
 
 ```
 Run ID: abc123
 Logs: C:\Users\...\cuepoint.log
 ```
 
 ## 7.55 Observability for GUI
 
 - Show run ID in status bar.
 - Provide "Copy run ID" action.
 
 ## 7.56 Observability UX Copy (Expanded)
 
 - "Support bundle created."
 - "Run ID copied to clipboard."
 
 ## 7.57 Support Bundle Naming
 
 - `cuepoint-support-<run_id>.zip`
 
 ## 7.58 Support Bundle Location
 
 - Default to Desktop.
 - Allow user to choose location.
 
 ## 7.59 Support Bundle Integrity
 
 - Verify zip creation.
 - Verify file size > 0.
 
 ## 7.60 Support Bundle Tests
 
 - Zip contains required files.
 - Zip not empty.
 
 ## 7.61 Crash File Naming
 
 - `crash-YYYYMMDD-HHMMSS.log`
 
 ## 7.62 Crash File Retention
 
 - Keep latest 10 files.
 
 ## 7.63 Crash File Content
 
 - Traceback.
 - Run ID.
 - App version.
 
 ## 7.64 Crash File Example
 
 ```
 Traceback (most recent call last):
 ...
 ```
 
 ## 7.65 Observability Redaction (Paths)
 
 - Replace home dir.
 - Remove full output paths.
 
 ## 7.66 Observability Redaction (Fields)
 
 - Remove playlist names if marked sensitive.
 
 ## 7.67 Observability Redaction Tests (Expanded)
 
 - Log files contain no user email.
 - Log files contain no full paths.
 
 ## 7.68 Observability Diagnostic Export
 
 - Export `diagnostics.json`.
 - Include config snapshot.
 
 ## 7.69 Observability Diagnostic Fields
 
 - `version`
 - `os`
 - `python`
 - `run_id`
 - `config_summary`
 
 ## 7.70 Observability Diagnostic Example
 
 ```json
 {"version":"1.2.3","os":"Windows 11","run_id":"abc123"}
 ```
 
 ## 7.71 Observability Exception Handling
 
 - Wrap main entrypoint.
 - Capture unhandled exceptions.
 
 ## 7.72 Observability Exception Hook
 
 - GUI: `sys.excepthook`.
 - CLI: top-level try/except.
 
 ## 7.73 Observability Error Codes
 
 - O001: Crash captured.
 - O002: Support bundle creation failed.
 
 ## 7.74 Observability Error Handling
 
 - If bundle fails, show manual log location.
 
 ## 7.75 Observability UX for Errors
 
 - "Unable to create support bundle. Open logs folder?"
 
 ## 7.76 Observability Performance Impact
 
 - Logging overhead < 2% runtime.
 - Crash capture overhead < 100ms.
 
 ## 7.77 Observability Performance Tests
 
 - Benchmark with logs enabled.
 - Benchmark with logs disabled.
 
 ## 7.78 Observability Integration Tests
 
 - Simulate crash and verify bundle.
 - Verify run ID propagated.
 
 ## 7.79 Observability System Tests
 
 - Manual crash test before release.
 
 ## 7.80 Observability Log Sampling (Optional)
 
 - Sample INFO logs for large runs.
 
 ## 7.81 Observability Log Sampling Strategy
 
 - Log every 100th track.
 
 ## 7.82 Observability Log Sampling Tests
 
 - Ensure sampling does not drop errors.
 
 ## 7.83 Observability Logging Failures
 
 - If logging fails, continue run.
 - Fail silently and warn.
 
 ## 7.84 Observability Logging Failures Tests
 
 - Simulate read-only log directory.
 
 ## 7.85 Observability Ownership
 
 - Assign support owner.
 - Assign logging owner.
 
 ## 7.86 Observability Runbooks
 
 - How to collect logs.
 - How to reproduce issues.
 
 ## 7.87 Observability Checklist
 
 - [ ] Log rotation configured.
 - [ ] Crash handler installed.
 - [ ] Support bundle export works.
 
 ## 7.88 Observability Gate
 
 - Fail build if logging service missing.
 
 ## 7.89 Observability Documentation
 
 - Document log locations.
 - Document support bundle.
 
 ## 7.90 Support Workflow Overview
 
 - User reports issue.
 - Support requests bundle.
 - Triage and reproduce.
 - Fix and verify.
 
 ## 7.91 Support Intake Channels
 
 - GitHub Issues.
 - Email (optional).
 - In-app "Report Issue" link.
 
 ## 7.92 Support Intake Fields
 
 - App version.
 - OS version.
 - Steps to reproduce.
 - Support bundle attached.
 
 ## 7.93 Support Intake Template (Example)
 
 ```
 Version:
 OS:
 Steps:
 Expected:
 Actual:
 Bundle:
 ```
 
 ## 7.94 Support Triage Categories
 
 - Crash
 - Update failure
 - Matching quality
 - Performance
 - UI issue
 
 ## 7.95 Support Triage Priority
 
 - P0: crash/data loss
 - P1: major functionality broken
 - P2: minor issue
 
 ## 7.96 Support SLA Targets
 
 - P0: 24h response.
 - P1: 48h response.
 - P2: 5 days response.
 
 ## 7.97 Support Bundle Review Checklist
 
 - Verify run ID.
 - Check logs for errors.
 - Check crash file.
 
 ## 7.98 Support Bundle Redaction Policy
 
 - Remove file paths.
 - Remove user-specific data.
 
 ## 7.99 Support Bundle Validation
 
 - Bundle contains logs and diagnostics.
 - Bundle size < 50MB.
 
 ## 7.100 Support Bundle Reproduction Guide
 
 - Use same XML fixture.
 - Use same config.
 - Run with same playlist.
 
 ## 7.101 Support Diagnostics Script (Optional)
 
 - Script to validate bundle contents.
 
 ## 7.102 Support Diagnostics Script (Example)
 
 ```python
 def validate_bundle(path):
     assert "diagnostics.json" in zip_contents(path)
 ```
 
 ## 7.103 Observability in CLI Runs
 
 - Always print run ID.
 - Always print log path.
 
 ## 7.104 Observability in GUI Runs
 
 - Show run ID on completion.
 - Provide "Copy run ID" button.
 
 ## 7.105 Error Classification
 
 - User error (input/config).
 - System error (crash).
 - External error (network).
 
 ## 7.106 Error Classification Tests
 
 - Ensure network errors marked as external.
 - Ensure XML errors marked as input.
 
 ## 7.107 Support Metrics
 
 - Number of issues per release.
 - Mean time to resolution.
 - Bundle export rate.
 
 ## 7.108 Support Metrics Targets
 
 - MTTR < 7 days.
 - Crash rate < 2%.
 
 ## 7.109 Observability Dashboards
 
 - Crash counts by version.
 - Run success rate.
 
 ## 7.110 Dashboard Data Sources
 
 - Log aggregation (if enabled).
 - Telemetry (opt-in).
 
 ## 7.111 Observability Storage
 
 - Local logs only by default.
 - Remote storage optional.
 
 ## 7.112 Observability Storage Policy
 
 - Local retention: 7 days.
 - Crash retention: 10 files.
 
 ## 7.113 Observability Opt-In
 
 - No telemetry by default.
 - Explicit consent for sending errors.
 
 ## 7.114 Observability Consent UX
 
 - Clear explanation.
 - Toggle in settings.
 
 ## 7.115 Observability Consent Logging
 
 - Log consent changes.
 
 ## 7.116 Observability Consent Log Example
 
 ```
 [privacy] crash_reporting=false -> true
 ```
 
 ## 7.117 Observability Redaction Checklist
 
 - [ ] Paths redacted.
 - [ ] Emails redacted.
 - [ ] Usernames redacted.
 
 ## 7.118 Observability Instrumentation Points
 
 - Run start/end.
 - Query generation.
 - Search phase.
 - Output writing.
 
 ## 7.119 Observability Event Correlation
 
 - Use run ID to correlate.
 - Use track ID for per-track events.
 
 ## 7.120 Observability Event Sampling
 
 - Sample per-track logs to reduce volume.
 
 ## 7.121 Observability Sampling Rules
 
 - Sample 1% of per-track events.
 - Always log errors.
 
 ## 7.122 Observability Sampling Tests
 
 - Ensure errors always logged.
 
 ## 7.123 Observability Alert Rules
 
 - Crash rate > 5% triggers alert.
 - Update failure rate > 2% triggers alert.
 
 ## 7.124 Observability Alert Delivery
 
 - Email to maintainers.
 
 ## 7.125 Observability Runbook (Crash Spike)
 
 - Identify affected version.
 - Disable update.
 - Release hotfix.
 
 ## 7.126 Observability Runbook (Update Failure)
 
 - Check appcast.
 - Verify signatures.
 - Re-publish if needed.
 
 ## 7.127 Observability Runbook (Log Loss)
 
 - Notify user to re-run with debug logs.
 
 ## 7.128 Observability Error Codes (Expanded)
 
 - O003: Redaction failure.
 - O004: Log rotation failure.
 
 ## 7.129 Observability Error Handling
 
 - If log rotation fails, continue logging.
 - If redaction fails, redact full line.
 
 ## 7.130 Observability Error Handling Tests
 
 - Simulate full disk for logs.
 
 ## 7.131 Observability File Locations
 
 - Logs: OS logs folder.
 - Crashes: OS logs folder.
 - Bundles: Desktop by default.
 
 ## 7.132 Observability UI Diagnostics Panel
 
 - Show log path.
 - Show last run ID.
 
 ## 7.133 Observability Panel Tests
 
 - Panel shows correct log path.
 
 ## 7.134 Observability Privacy Review
 
 - Review diagnostics for PII.
 
 ## 7.135 Observability Privacy Review Checklist
 
 - [ ] No file paths in bundle.
 - [ ] No user names in bundle.
 
 ## 7.136 Observability Test Matrix
 
 | Test | Type | Priority |
 | --- | --- | --- |
 | Crash bundle | Integration | P0 |
 | Log rotation | Unit | P1 |
 | Redaction | Unit | P0 |
 
 ## 7.137 Observability Performance Budget
 
 - Logging overhead < 2%.
 - Bundle export < 3s.
 
 ## 7.138 Observability Performance Tests
 
 - Measure logging overhead.
 
 ## 7.139 Observability Data Schema
 
 - `run_id`
 - `event`
 - `timestamp`
 - `severity`
 
 ## 7.140 Observability Data Schema Example
 
 ```json
 {"run_id":"abc123","event":"run_started","severity":"INFO"}
 ```
 
 ## 7.141 Observability Data Storage (Optional)
 
 - If enabled, use privacy-safe backend.
 
 ## 7.142 Observability Data Deletion
 
 - Clear logs.
 - Clear crash files.
 
 ## 7.143 Observability Data Deletion Tests
 
 - Ensure log delete works.
 
 ## 7.144 Observability Ownership
 
 - Support owner.
 - Logging owner.
 - Crash handling owner.
 
 ## 7.145 Observability Roadmap
 
 - Phase 1: logging + bundles.
 - Phase 2: crash reporting.
 - Phase 3: dashboards.
 
 ## 7.146 Observability Summary
 
 - Observability enables faster issue resolution.
 
 ## 7.147 Observability Appendix: Config Keys
 
 - `observability.log_level`
 - `observability.log_max_mb`
 - `observability.log_files`
 - `observability.crash_reporting`
 
 ## 7.148 Observability Appendix: CLI Flags
 
 - `--log-level`
 - `--log-path`
 
 ## 7.149 Observability Appendix: Support Bundle Checklist
 
 - logs included
 - crash file included
 - diagnostics included
 
 ## 7.150 Observability Appendix: FAQ
 
 - "Where are logs stored?"
 - "How to create a support bundle?"
 
 ## 7.151 Observability Appendix: Log Example
 
 ```
 2026-01-31T12:00:00Z INFO run_started run_id=abc123
 ```
 
 ## 7.152 Observability Appendix: Support Bundle Naming
 
 - `cuepoint-support-<run_id>.zip`
 
 ## 7.153 Observability Appendix: Permissions
 
 - Ensure log directory writable.
 - Ensure bundle export path writable.
 
 ## 7.154 Observability Appendix: Error Table
 
 | Code | Meaning |
 | --- | --- |
 | O001 | Crash captured |
 | O002 | Bundle failed |
 | O003 | Redaction failure |
 
 ## 7.155 Observability Appendix: Redaction Rules
 
 - Replace home dir with `~`.
 - Remove playlist names if configured.
 
 ## 7.156 Observability Appendix: Retention
 
 - Logs: 7 days.
 - Crash files: 10 entries.
 
 ## 7.157 Observability Appendix: UX Copy
 
 - "Support bundle created."
 - "Logs folder opened."
 
 ## 7.158 Observability Appendix: QA Checklist
 
 - Export bundle works.
 - Crash handler works.
 - Log rotation works.
 
 ## 7.159 Observability Appendix: Metrics
 
 - Crash rate.
 - Bundle export rate.
 - Retry events.
 
 ## 7.160 Observability Appendix: Ownership
 
 - Support: owner.
 - Logging: owner.
 - Crash: owner.
 
 ## 7.161 Observability Appendix: Done Criteria
 
 - Structured logs implemented.
 - Crash handler installed.
 - Bundle export verified.
 
 ## 7.162 Observability Appendix: Support Playbook
 
 - Collect bundle.
 - Reproduce issue.
 - File bug with run ID.
 
 ## 7.163 Observability Appendix: Crash Playbook
 
 - Identify version.
 - Check crash logs.
 - Create hotfix if needed.
 
 ## 7.164 Observability Appendix: Update Failures
 
 - Verify appcast.
 - Verify signatures.
 
 ## 7.165 Observability Appendix: Tooling
 
 - Zip utilities.
 - Log parser.
 
 ## 7.166 Observability Appendix: Test Fixtures
 
 - Sample crash log.
 - Sample diagnostics JSON.
 
 ## 7.167 Observability Appendix: Run ID Usage
 
 - Include in issue title.
 
 ## 7.168 Observability Appendix: Log Search Tips
 
 - Search for "ERROR".
 - Search for run ID.
 
 ## 7.169 Observability Appendix: Support Link
 
 - `https://github.com/.../issues/new`
 
 ## 7.170 Observability Appendix: Final Notes
 
 - Keep logs concise.
 - Prefer actionable diagnostics.
 
 ## 7.171 Observability Appendix: Done
 
 - Logs ok
 - Bundles ok
 
 ## 7.172 Observability Appendix: Targets
 
 - Crash rate < 2%
 - Bundle creation < 3s
 
 ## 7.173 Observability Appendix: Owners (Short)
 
 - Support
 - Engineering
 
 ## 7.174 Observability Appendix: Closeout
 
 - Reviewed
 
 ## 7.175 Observability Appendix: End
 
 - Done
 
 ## 7.176 Observability Appendix: Final
 
 - Complete
 
 
