 # Step 1: Product Readiness Design
 
 ## Purpose
 Define the user-facing expectations, supported environments, and baseline
 experience so the app behaves predictably for first-time and advanced users.
 
 ## Current State
 - App has GUI and CLI entry points (`src/gui_app.py`, `src/main.py`).
 - Core processing pipeline is stable (Rekordbox XML → Beatport → CSV output).
 - User docs exist, but onboarding and preflight UX are minimal.
 
 ## Proposed Implementation
 
 ### 1.1 Support Policy
 - Publish supported OS versions, Rekordbox export expectations, and file size
   limits in `docs/user-guide/` and `README.md`.
 - Add a support policy page with update cadence and EOL policy.
 
 ### 1.2 Preflight and Validation
 - Add a validation step before processing:
   - XML file exists and is readable
   - Playlist name exists in XML
   - Output directory is writable
   - Config constraints (timeouts, concurrency) are sane
 - Fail fast with actionable UI error messages.
 
 ### 1.3 Onboarding Flow
 - Add a first-run modal with:
   - Rekordbox export instructions
   - Example XML
   - “What will happen next” summary
 - Persist "do not show again" in settings.
 
 ### 1.4 Run Summary
 - Provide a post-run summary (matches, unmatched, errors, output paths).
 - Add a "review next steps" callout to guide users into review/export flow.
 
 ## Design Notes
 - Validation should reuse core parsing code, not re-implement parsing logic.
 - Store onboarding preference in config service to keep behavior consistent
   across GUI and CLI.
 
 ## Code Touchpoints
 - `src/cuepoint/services/config_service.py` (persist onboarding preference)
 - `src/cuepoint/ui/main_window.py` (first-run modal hook)
 - `src/cuepoint/ui/dialogs/` (new onboarding dialog)
 - `src/cuepoint/services/processor_service.py` (preflight validation)
 - `src/cuepoint/data/rekordbox.py` (lightweight validation helpers)
 
 ## Example Pseudocode
 ```python
 def run_preflight(xml_path, playlist, output_dir):
     if not xml_path.exists():
         return error("XML file not found.")
     playlists = parse_playlist_names(xml_path)
     if playlist not in playlists:
         return error("Playlist not found in XML.")
     if not output_dir.is_dir() or not is_writable(output_dir):
         return error("Output folder not writable.")
     return ok()
 ```
 
 ## Testing Plan
 - Unit tests for preflight validation (missing XML, bad playlist, readonly dir).
 - GUI smoke test: first-run modal display and dismiss.
 - CLI smoke test: preflight failures return non-zero exit code.
 
 ## Acceptance Criteria
 - Users see onboarding on first run only.
 - Preflight blocks invalid runs with actionable messages.
 - A run summary is shown after completion.
 
 ---
 
 ## 1.5 Personas and Use Cases
 
 ### Primary Persona: Working DJ
 - Wants fast, reliable results with minimal configuration.
 - Uses large libraries and expects consistent output.
 - Needs clear error messaging and no data loss.
 
 ### Secondary Persona: Power User
 - Uses CLI, batch mode, or custom configs.
 - Wants visibility into matching and scoring.
 - Expects deterministic behavior across runs.
 
 ### Tertiary Persona: Support / Maintainer
 - Needs reproducible runs and diagnostic artifacts.
 - Requires clear settings and known limitations.
 - Uses logs and run summaries to debug.
 
 ## 1.6 Product Definitions and Glossary
 
 - **Collection XML**: Rekordbox export containing playlists and tracks.
 - **Playlist**: A named list of tracks in the XML.
 - **Candidate**: Beatport track that may match a Rekordbox track.
 - **Match**: The final candidate selected after scoring and guards.
 - **Review**: Output workflow to verify low-confidence results.
 
 ## 1.7 User Journey Map (GUI)
 
 1. Open app.
 2. Select Collection XML.
 3. Choose playlist.
 4. Review config (optional).
 5. Start processing.
 6. Watch progress.
 7. Review results.
 8. Export outputs.
 
 ## 1.8 Critical UX States
 
 - No XML selected.
 - XML selected, playlist missing.
 - Playlist selected, ready to run.
 - Processing running (progress + cancel).
 - Processing paused (resume).
 - Processing failed (error with recovery options).
 - Processing completed (summary + next steps).
 
 ## 1.9 Product Invariants
 
 - No destructive writes to input files.
 - All outputs are user-owned and documented.
 - Failure states are recoverable with clear guidance.
 - Onboarding can be skipped and re-opened from Help.
 
 ## 1.10 Implementation Details: Preflight Validation
 
 ### Validation Categories
 - **File validation**: existence, readability, extension.
 - **XML integrity**: parseable, root element present.
 - **Playlist validation**: playlist exists and non-empty.
 - **Output validation**: writable directory, free space.
 - **Config validation**: bounds on timeout/concurrency.
 
 ### Validation Sequence
 1. Validate XML file path.
 2. Parse lightweight XML for playlist names.
 3. Validate chosen playlist exists.
 4. Validate output directory.
 5. Validate configuration settings.
 
 ### Pseudocode (Detailed)
 ```python
 def validate_run_request(xml_path, playlist_name, output_dir, config):
     errors = []
     if not xml_path.exists():
         errors.append("XML file not found.")
     if not xml_path.is_file():
         errors.append("XML path is not a file.")
     if not is_readable(xml_path):
         errors.append("XML file is not readable.")
     if not output_dir.exists():
         errors.append("Output folder does not exist.")
     if not is_writable(output_dir):
         errors.append("Output folder is not writable.")
     if config.timeout < 1:
         errors.append("Timeout must be >= 1 second.")
     if config.concurrency < 1:
         errors.append("Concurrency must be >= 1.")
     playlist_names = read_playlist_names(xml_path)
     if playlist_name not in playlist_names:
         errors.append("Playlist not found in XML.")
     return errors
 ```
 
 ## 1.11 Error Messages (User-Facing)
 
 - **XML not found**: “The XML file could not be found. Choose a valid file.”
 - **XML unreadable**: “CuePoint cannot read this file. Check permissions.”
 - **Playlist missing**: “Playlist not found. Select a valid playlist.”
 - **Output unwritable**: “Output folder is not writable. Pick another.”
 - **Config invalid**: “Timeout value must be at least 1 second.”
 
 ## 1.12 Onboarding Flow Design
 
 ### First-Run Dialog Steps
 1. Welcome and brief value proposition.
 2. “What you need”: Rekordbox XML + playlist name.
 3. “What you will get”: outputs and review workflow.
 4. “Where files go”: output folder explanation.
 
 ### Implementation Details
 - Show on first run only.
 - Store preference in config (`onboarding_seen=true`).
 - Provide "Show onboarding" in Help menu.
 
 ### UI Components
 - Multi-step dialog with back/next.
 - “Do not show again” checkbox.
 - External link to `docs/user-guide/workflows.md`.
 
 ## 1.13 Run Summary Design
 
 ### Content
 - Total tracks processed.
 - Matched count.
 - Unmatched count.
 - Low-confidence count.
 - Output file paths.
 - Runtime duration.
 
 ### Implementation Detail
 - Summary generated from `ProcessorService` result.
 - Displayed in GUI and logged in CLI.
 
 ## 1.14 Configuration Surface
 
 ### Config Keys (Proposed)
 - `onboarding_seen`: bool
 - `last_xml_path`: string
 - `last_output_dir`: string
 - `default_playlist`: string
 - `preflight_enabled`: bool (default true)
 
 ### Storage
 - Use existing config service.
 - Persist in YAML or settings file.
 
 ## 1.15 CLI / GUI Consistency
 
 - Same validation logic for CLI and GUI.
 - Shared config defaults.
 - Shared run summary output.
 
 ## 1.16 Security and Privacy Notes
 
 - Onboarding must not transmit any data.
 - Preflight must not log full file paths unless debug mode is enabled.
 
 ## 1.17 Acceptance Tests (Expanded)
 
 - First run:
   - Onboarding appears once.
   - Preference persists after restart.
 - Preflight:
   - Missing XML path fails.
   - Missing playlist fails.
   - Output folder unwritable fails.
 - Run summary:
   - Shows correct counts.
   - Paths are clickable (GUI).
 
 ## 1.18 Negative Test Matrix
 
 | Scenario | Expected Result |
 | --- | --- |
 | XML is missing | Error and no run starts |
 | XML is corrupted | Error with suggestion |
 | Playlist empty | Error and prompt to choose |
 | Output folder read-only | Error and prompt to choose |
 | Timeout = 0 | Error and reset to default |
 
 ## 1.19 Edge Cases
 
 - XML contains playlists with same name.
 - XML file contains special characters in playlist names.
 - Output folder is on network drive.
 - Path lengths exceed OS limits.
 
 ## 1.20 Implementation Plan (Phased)
 
 - Phase 1:
   - Preflight validation.
   - Error messaging.
 - Phase 2:
   - Onboarding flow.
   - Run summary.
 - Phase 3:
   - Persistent last-used settings.
   - Help menu onboarding access.
 
 ## 1.21 Dependencies
 
 - Qt dialog components.
 - Config service persistence.
 - XML parsing helper.
 
 ## 1.22 Risks and Mitigations
 
 - Risk: Validation blocks legitimate runs.
   - Mitigation: Allow override with advanced setting.
 - Risk: Onboarding creates friction.
   - Mitigation: Allow skip and "do not show again".
 
 ## 1.23 Open Questions
 
 - Should CLI support onboarding? (Likely no)
 - Should preflight be skippable for power users?
 - Should default output folder be created automatically?
 
 ## 1.24 Requirements Traceability Matrix
 
 | Requirement | Type | Owner | Code | Tests | Docs |
 | --- | --- | --- | --- | --- | --- |
 | Preflight validation exists | Must | Core | processor_service | tests/preflight | user-guide |
 | Playlist must exist | Must | Core | rekordbox parser | tests/xml | workflows |
 | Output folder writable | Must | Core | output_writer | tests/output | troubleshooting |
 | Onboarding shown once | Should | UI | main_window | tests/ui | user-guide |
 | Run summary shown | Must | UI | processor_service | tests/run | workflows |
 | Error messaging actionable | Must | UI | dialogs | tests/ui | troubleshooting |
 | Config persisted | Must | Core | config_service | tests/config | docs |
 | Last-used paths saved | Should | UI | config_service | tests/config | docs |
 | Cancel run works | Must | Core | processor_service | tests/run | docs |
 | Resume run works | Should | Core | processor_service | tests/run | docs |
 | Default output folder | Must | Core | output_writer | tests/output | docs |
 | Privacy: no data sent | Must | Policy | logging_service | tests/logging | privacy |
 | CLI parity | Should | CLI | cli_processor | tests/cli | docs |
 | Progress UX | Must | UI | main_window | tests/ui | docs |
 | Error codes list | Should | UI | errors | tests/errors | troubleshooting |
 | Sample XML available | Should | Docs | docs only | n/a | docs |
 | Support policy published | Must | Docs | n/a | n/a | docs |
 | Glossary in docs | Should | Docs | n/a | n/a | docs |
 | Preflight report export | Could | UI | dialogs | tests/ui | docs |
 | "Help > Onboarding" | Could | UI | menu | tests/ui | docs |
 
 ## 1.25 Product Requirements (Expanded)
 
 ### Functional Requirements
 - User can select a Rekordbox XML file.
 - User can select a playlist from the XML.
 - User can start processing and see progress.
 - User can cancel processing at any time.
 - User can export outputs after run completes.
 - User can review low-confidence matches.
 
 ### Non-Functional Requirements
 - App remains responsive during long runs.
 - Errors are actionable and non-technical.
 - No user data is sent without consent.
 - Outputs are deterministic for identical inputs.
 - App never mutates input files.
 
 ## 1.26 Preflight Validation Specification
 
 ### File Checks
 - File exists.
 - Path length is within OS limits.
 - Extension is `.xml` (warn on mismatch).
 - File size is greater than 0 bytes.
 - File size under configured maximum (soft warning).
 - File is readable by current user.
 
 ### XML Integrity Checks
 - Root element is present.
 - Rekordbox expected root tag exists.
 - Playlist nodes exist.
 - Track nodes exist.
 - Track entries contain title and artist fields.
 - Playlist names are non-empty.
 
 ### Playlist Checks
 - Selected playlist exists.
 - Playlist contains at least one track.
 - Playlist name not duplicated (warn).
 - Playlist name does not include invalid characters (warn).
 
 ### Output Checks
 - Output folder exists or can be created.
 - Output folder is writable.
 - Output folder has sufficient free space.
 - Output folder not within application install path.
 
 ### Configuration Checks
 - Concurrency >= 1.
 - Timeout >= 1s.
 - Retry count >= 0.
 - Cache TTL >= 0.
 - Output format selection is valid.
 
 ### Validation Output
 - Provide list of errors (blocking).
 - Provide list of warnings (non-blocking).
 - Offer a "Proceed Anyway" action if only warnings.
 
 ## 1.27 Preflight UI Design
 
 ### UX Goals
 - Fail fast with clear guidance.
 - Avoid overwhelming the user.
 - Separate errors from warnings.
 
 ### Dialog Structure
 - Title: "Preflight Checks"
 - Summary: "2 errors, 1 warning"
 - Errors list (red icon)
 - Warnings list (yellow icon)
 - Actions: "Fix and Retry", "Proceed Anyway", "Cancel"
 
 ### Example Error Texts
 - "Playlist not found. Choose a playlist that exists in the XML."
 - "Output folder is not writable. Select a different folder."
 - "XML file could not be parsed. Re-export from Rekordbox."
 
 ## 1.28 Onboarding Content (Script)
 
 ### Screen 1: Welcome
 - Headline: "Welcome to CuePoint"
 - Body: "CuePoint adds official Beatport metadata to your Rekordbox library."
 
 ### Screen 2: What You Need
 - "Rekordbox XML export"
 - "Playlist name"
 - "A place to save outputs"
 
 ### Screen 3: What You Get
 - "Clean metadata for each track"
 - "A review file for low-confidence matches"
 - "An audit trail of queries and candidates"
 
 ### Screen 4: Next Steps
 - "Select your XML"
 - "Choose a playlist"
 - "Start matching"
 
 ### Footer
 - Checkbox: "Don't show again"
 - Link: "View full workflow guide"
 
 ## 1.29 Run Summary Specification
 
 ### Required Fields
 - Run ID
 - Start time
 - End time
 - Duration
 - Input XML path (redacted if needed)
 - Playlist name
 - Total tracks
 - Matched count
 - Unmatched count
 - Low-confidence count
 - Output file paths
 
 ### Optional Fields
 - Cache hit rate
 - Average score
 - Error count
 - Warning count
 
 ### Summary Formats
 - GUI dialog with actions (Open folder, Copy summary).
 - CLI summary printed to stdout.
 - Optional JSON summary file.
 
 ### Example JSON Summary
 ```json
 {
   "run_id": "2026-01-31T12:00:00Z_abc123",
   "tracks_total": 500,
   "matched": 430,
   "unmatched": 70,
   "low_confidence": 45,
   "duration_sec": 1120,
   "outputs": [
     "CuePoint_Main.csv",
     "CuePoint_Review.csv",
     "CuePoint_Candidates.csv"
   ]
 }
 ```
 
 ## 1.30 Output Naming Conventions
 
 ### Default Filenames
 - `CuePoint_Main.csv`
 - `CuePoint_Review.csv`
 - `CuePoint_Candidates.csv`
 - `CuePoint_Queries.csv`
 
 ### Optional Suffixes
 - Timestamp: `CuePoint_Main_20260131.csv`
 - Playlist name: `CuePoint_Main_MyPlaylist.csv`
 - Run ID: `CuePoint_Main_run_abc123.csv`
 
 ### Naming Rules
 - No spaces by default.
 - Use underscore separators.
 - Strip unsupported characters for Windows.
 
 ## 1.31 CLI Parity Specification
 
 ### CLI Goals
 - Same validation and error messages as GUI.
 - Same defaults for output naming and directories.
 - Same run summary content.
 
 ### CLI Flags (Proposed)
 - `--xml PATH`
 - `--playlist NAME`
 - `--output-dir PATH`
 - `--run-summary-json PATH`
 - `--no-preflight` (advanced)
 - `--resume RUN_ID` (future)
 
 ### CLI Output
 - Preflight results (errors/warnings).
 - Progress updates with track counts.
 - Final summary.
 
 ## 1.32 Error Taxonomy (Product-Level)
 
 ### Error Categories
 - **INPUT**: invalid XML or playlist.
 - **OUTPUT**: write failures.
 - **NETWORK**: search timeouts.
 - **MATCHING**: no candidates.
 - **SYSTEM**: unexpected exceptions.
 
 ### Example Error Codes
 - P001: XML not found
 - P002: XML not readable
 - P003: XML parse failed
 - P010: Playlist not found
 - P011: Playlist empty
 - P020: Output dir not writable
 - P021: Output dir not found
 - P030: Config invalid
 - P040: Network timeout
 - P050: Unknown error
 
 ### Error Display Rules
 - Provide a plain-English message.
 - Provide a suggested fix.
 - Provide a "More details" toggle for debug info.
 
 ## 1.33 Product Copy Guidelines
 
 - Avoid technical jargon.
 - Prefer "playlist" over "collection node".
 - Use "match" not "candidate selection".
 - When in doubt, show a "Learn more" link.
 
 ## 1.34 Support Policy (Template)
 
 ### Supported OS
 - Windows 10+ (x64)
 - macOS 12+ (Intel, Apple Silicon)
 
 ### Supported Rekordbox Export
 - Rekordbox XML export format (tested with recent versions).
 
 ### Support Window
 - Latest major release + previous minor.
 - Security fixes applied within 7 days of critical CVE.
 
 ### EOL Policy
 - Announce deprecations at least 90 days in advance.
 
 ## 1.35 Documentation Updates (Checklist)
 
 - Add "Getting Started" section to user guide.
 - Add "Common Errors" section with error codes.
 - Add "Support Policy" page.
 - Add "Privacy" summary in Help menu.
 - Add "Glossary" page.
 
 ## 1.36 UI State Machine
 
 ### States
 - `idle`
 - `preflight`
 - `running`
 - `paused`
 - `completed`
 - `error`
 
 ### Transitions
 - idle → preflight (user clicks Start)
 - preflight → running (validation ok)
 - preflight → idle (user cancels)
 - running → paused (user clicks Pause)
 - paused → running (user clicks Resume)
 - running → completed (finish)
 - running → error (exception)
 - error → idle (user acknowledges)
 
 ## 1.37 UI Layout (Text Wireframe)
 
 ```
 +--------------------------------------------------+
 | CuePoint                                          |
 +--------------------------------------------------+
 | XML: [path..................] [Browse]           |
 | Playlist: [dropdown........]                      |
 | Output: [path...............] [Browse]            |
 | [Start] [Pause] [Cancel]                          |
 |--------------------------------------------------|
 | Status: Ready                                     |
 | Progress: [########----] 65%                      |
 |--------------------------------------------------|
 | Results table                                     |
 +--------------------------------------------------+
 ```
 
 ## 1.38 UI Copy Variants
 
 - "Start" vs "Run" vs "Process"
 - "Review" vs "Check low confidence"
 - "Export" vs "Save outputs"
 
 ## 1.39 Data Ownership and Storage
 
 - Input XML is read-only.
 - Outputs are created in user-selected folder.
 - Cache stored in OS-specific cache location.
 - Logs stored in OS-specific logs location.
 
 ## 1.40 Internationalization Readiness
 
 - All UI strings centralized in a strings module.
 - Avoid hardcoded string concatenation.
 - Avoid embedding file paths in translatable strings.
 - Use Qt translation system for future localization.
 
 ## 1.41 Accessibility Considerations
 
 - Keyboard navigation in onboarding.
 - Focus order consistent with top-to-bottom flow.
 - All buttons have accessible labels.
 - Provide high-contrast status colors.
 
 ## 1.42 Preflight Report Export
 
 - Provide "Export Preflight Report" as JSON.
 - Include all checks and results.
 - Useful for support and debugging.
 
 ### Example Preflight Report
 ```json
 {
   "xml_exists": true,
   "playlist_found": false,
   "output_writable": true,
   "warnings": ["Large file size"],
   "errors": ["Playlist not found"]
 }
 ```
 
 ## 1.43 Advanced Settings (Product)
 
 - Toggle preflight warnings-only mode.
 - Toggle resume-enabled mode.
 - Toggle verbose logging.
 - Toggle automatic open-output-folder on completion.
 
 ## 1.44 Power User Workflow
 
 - Use CLI for batch operations.
 - Provide `--config` for overrides.
 - Provide `--dry-run` for preflight only.
 
 ## 1.45 Risk Register (Expanded)
 
 | Risk | Impact | Likelihood | Mitigation |
 | --- | --- | --- | --- |
 | Onboarding annoys users | Medium | Medium | Skip/disable |
 | Preflight too strict | High | Medium | Warnings + override |
 | Summary too verbose | Low | Medium | Expandable sections |
 | Confusing errors | High | Medium | Clear copy |
 | Output naming collisions | Medium | Low | Timestamp suffix |
 
 ## 1.46 Example Implementation Outline
 
 1. Add preflight function in `processor_service.py`.
 2. Add preflight dialog in UI.
 3. Add onboarding dialog and preference.
 4. Add run summary data structure.
 5. Integrate summary in GUI and CLI.
 6. Update docs.
 
 ## 1.47 Test Case List (Detailed)
 
 ### Preflight
 - XML not found.
 - XML directory passed instead of file.
 - XML empty file.
 - XML invalid format.
 - Playlist missing.
 - Playlist empty.
 - Output dir missing.
 - Output dir no write permission.
 - Output dir inside install directory.
 - Output dir on network drive.
 - Config concurrency set to 0.
 - Config timeout set to 0.
 
 ### Onboarding
 - First run displays.
 - "Don't show again" persists.
 - Help menu opens onboarding.
 
 ### Run Summary
 - Correct counts.
 - Correct file paths.
 - Duration accurate.
 - Summary saved to JSON when enabled.
 
 ## 1.48 Gherkin Scenarios
 
 ```
 Scenario: Missing XML file
   Given the user selects a missing XML file
   When they click Start
   Then the app shows "XML file not found"
   And no processing begins
 
 Scenario: Playlist not found
   Given the XML file is valid
   And the playlist does not exist
   When they click Start
   Then the app shows "Playlist not found"
 
 Scenario: Onboarding only once
   Given the app is launched first time
   Then onboarding is displayed
   When the user completes onboarding
   And relaunches the app
   Then onboarding is not displayed
 ```
 
 ## 1.49 Metrics for Readiness
 
 - First-run success rate > 95%.
 - Preflight failure rate < 5%.
 - Average run completion > 90%.
 - Support tickets about onboarding < 5 per release.
 
 ## 1.50 Migration Plan
 
 - Introduce preflight without blocking for one release.
 - Add warning-only mode for power users.
 - Make validation blocking after user feedback.
 
 ## 1.51 Dependency Review
 
 - Confirm XML parsing library reliability.
 - Confirm UI components can support multi-step dialogs.
 - Confirm config system supports new keys.
 
 ## 1.52 Documentation Draft (Outline)
 
 - Overview
 - Requirements
 - Supported platforms
 - Preflight checks
 - Onboarding flow
 - Run summary
 - Troubleshooting
 
 ## 1.53 UI Strings (Sample)
 
 - "Select Rekordbox XML"
 - "Choose playlist"
 - "Output folder"
 - "Start processing"
 - "Cancel"
 - "Resume"
 - "Preflight checks completed"
 - "Run summary"
 
 ## 1.54 Data Redaction Rules
 
 - Redact user home directory in logs.
 - Replace full paths with shortened paths in UI summaries.
 - Allow a toggle to reveal paths for advanced users.
 
 ## 1.55 Configuration Examples
 
 ```yaml
 product:
   onboarding_seen: false
   preflight_enabled: true
   last_xml_path: ""
   last_output_dir: ""
   default_playlist: ""
 
 run_summary:
   write_json: true
   json_path: ""
 ```
 
 ## 1.56 Example UI Flow (Detailed)
 
 1. User opens app, sees onboarding.
 2. User closes onboarding.
 3. User clicks Browse and selects XML.
 4. Playlist dropdown populates.
 5. User selects playlist.
 6. User clicks Start.
 7. Preflight dialog shows warnings.
 8. User clicks "Proceed Anyway".
 9. Processing begins.
 10. Run completes.
 11. Summary dialog shows results and "Open output folder".
 
 ## 1.57 Full Implementation Checklist
 
 - [ ] Add preflight validation function.
 - [ ] Add preflight dialog.
 - [ ] Add onboarding dialog.
 - [ ] Add onboarding preference storage.
 - [ ] Add run summary model.
 - [ ] Add GUI summary dialog.
 - [ ] Add CLI summary output.
 - [ ] Add run summary JSON output.
 - [ ] Add docs updates.
 
 ## 1.58 Detailed Preflight Checks (Exhaustive)
 
 - XML file exists.
 - XML file is readable.
 - XML file extension is `.xml`.
 - XML file size > 0 bytes.
 - XML file size < max (warn if bigger).
 - XML root element exists.
 - XML root element name valid.
 - XML contains playlist nodes.
 - XML contains track nodes.
 - XML has at least one playlist.
 - Selected playlist name is not empty.
 - Selected playlist name exists in XML.
 - Playlist contains at least one track.
 - Playlist track entries include title.
 - Playlist track entries include artist.
 - Output directory exists.
 - Output directory is writable.
 - Output directory has available space.
 - Output directory path length < OS limit.
 - Output directory not inside install path.
 - Output directory not a file.
 - Cache directory is writable.
 - Config concurrency >= 1.
 - Config timeout >= 1.
 - Config retry >= 0.
 - Config cache TTL >= 0.
 - Config output formats valid.
 - Config output naming valid.
 - App has permission to create files.
 - App has permission to read XML.
 
 ## 1.59 Expanded Error Messages (Catalog)
 
 - P001: XML file not found.
 - P002: XML path points to a directory.
 - P003: XML file unreadable (permissions).
 - P004: XML file empty.
 - P005: XML parse error at line X (optional).
 - P010: Playlist not found.
 - P011: Playlist empty.
 - P012: Playlist name duplicated.
 - P020: Output dir not found.
 - P021: Output dir not writable.
 - P022: Output dir insufficient space.
 - P030: Config concurrency invalid.
 - P031: Config timeout invalid.
 - P032: Config retry invalid.
 - P033: Config cache TTL invalid.
 - P040: Preflight failed with unknown error.
 
 ## 1.60 Field Mapping to UI
 
 - `xml_path` → XML path input field.
 - `playlist_name` → Playlist dropdown.
 - `output_dir` → Output directory field.
 - `start_button` → Run button.
 - `progress_bar` → Progress indicator.
 - `status_label` → Status text.
 - `summary_dialog` → Run summary dialog.
 
 ## 1.61 Post-Run Actions
 
 - Open output folder.
 - Open review file.
 - Copy run summary to clipboard.
 - Start a new run.
 
 ## 1.62 QA Checklist (Manual)
 
 - Preflight errors appear with correct text.
 - Warnings allow "Proceed Anyway".
 - Onboarding appears on first run.
 - Onboarding can be reopened from Help.
 - Run summary appears after completion.
 - Output files are created in correct folder.
 - Run summary includes correct file paths.
 
 ## 1.63 Developer Notes
 
 - Keep preflight logic independent and testable.
 - Avoid UI-specific logic in core services.
 - Run summary should be a plain data structure.
 
 ## 1.64 Security Notes
 
 - Do not log full XML contents.
 - If errors include file paths, redact user home directory.
 
 ## 1.65 Open Decision Log
 
 - Decision: Preflight is enabled by default.
 - Decision: Onboarding only for GUI.
 - Decision: Summary appears after each run.
 
 ## 1.66 Future Enhancements (Product)
 
 - Smart playlist suggestions.
 - Auto-detect last used playlist.
 - Additional export formats.
 - "Resume previous run" from summary.
 
 ## 1.67 Expanded UI Copy Catalog
 
 ### XML Selection
 - Label: "Rekordbox XML"
 - Helper: "Export from Rekordbox and select the .xml file here."
 - Error: "We couldn't read this XML. Re-export and try again."
 
 ### Playlist Selection
 - Label: "Playlist"
 - Helper: "Choose the playlist to process."
 - Empty: "No playlists found in this XML."
 - Error: "Playlist not found. Select a valid playlist."
 
 ### Output Location
 - Label: "Output folder"
 - Helper: "CuePoint will save results to this folder."
 - Error: "This folder isn't writable. Choose another."
 
 ### Preflight Dialog
 - Title: "Preflight checks"
 - Summary: "2 errors, 1 warning"
 - Button: "Fix and retry"
 - Button: "Proceed anyway"
 - Button: "Cancel"
 
 ### Run Status
 - Idle: "Ready"
 - Running: "Processing…"
 - Paused: "Paused"
 - Completed: "Completed"
 - Error: "Run failed"
 
 ### Run Summary
 - Title: "Run summary"
 - Action: "Open output folder"
 - Action: "Copy summary"
 - Action: "Close"
 
 ## 1.68 Error Message Variants
 
 | Code | Short | Long |
 | --- | --- | --- |
 | P001 | XML not found | "The XML file can't be found. Please reselect it." |
 | P003 | XML unreadable | "CuePoint cannot read this file. Check permissions." |
 | P005 | XML parse error | "The XML looks invalid. Re-export from Rekordbox." |
 | P010 | Playlist missing | "Playlist not found in XML." |
 | P011 | Playlist empty | "Playlist has no tracks." |
 | P020 | Output unwritable | "Output folder is not writable." |
 | P030 | Config invalid | "A configuration value is invalid." |
 
 ## 1.69 Detailed Config Schema (Product)
 
 ```yaml
 product:
   onboarding_seen: false
   preflight_enabled: true
   last_xml_path: ""
   last_output_dir: ""
   default_playlist: ""
   output_naming:
     include_timestamp: false
     include_playlist_name: false
     include_run_id: true
   privacy:
     redact_paths_in_logs: true
     allow_error_reporting: false
 ```
 
 ## 1.70 UI Behavior Specification
 
 - Start button enabled only when XML and playlist are selected.
 - Preflight runs before any network calls.
 - Cancel button stops network work and writes partial outputs safely.
 - Resume button available only when pause is supported.
 - Output folder is opened automatically if user enables it in settings.
 
 ## 1.71 Detailed Interaction Flow
 
 1. User selects XML.
 2. Playlist list populates.
 3. User selects playlist.
 4. User clicks Start.
 5. Preflight checks run.
 6. If errors: show dialog and halt.
 7. If warnings: allow proceed or fix.
 8. Start processing and show progress.
 9. On completion, show summary and actions.
 
 ## 1.72 UX Risk Analysis
 
 - Risk: Too many warnings overwhelm users.
   - Mitigation: Collapse warnings into a summary.
 - Risk: Users skip onboarding and get stuck.
   - Mitigation: Add "Help → First run guide".
 
 ## 1.73 UX Acceptance Criteria (Expanded)
 
 - Preflight errors block run.
 - Warning-only preflight allows proceed.
 - Onboarding can be reopened at any time.
 - Run summary appears within 2 seconds after completion.
 - Output folder opens in system file explorer when configured.
 
 ## 1.74 Sample Run Summary (CLI)
 
 ```
 Run Summary
 ----------
 Run ID: 2026-01-31T12:00:00Z_abc123
 Playlist: MyPlaylist
 Tracks: 500
 Matched: 430
 Unmatched: 70
 Low confidence: 45
 Duration: 18m 40s
 Output: C:\Users\...\CuePoint_Main.csv
 ```
 
 ## 1.75 Implementation Details: Config Service
 
 - Add `product` section in config model.
 - Add load/save defaults.
 - Add migration to ensure existing configs are not broken.
 
 ## 1.76 Implementation Details: UI Dialogs
 
 - Onboarding dialog in `src/cuepoint/ui/dialogs/`.
 - Preflight dialog in `src/cuepoint/ui/dialogs/`.
 - Run summary dialog in `src/cuepoint/ui/dialogs/`.
 
 ## 1.77 Implementation Details: CLI
 
 - Add preflight warning output.
 - Add summary output.
 - Add `--preflight-only` option for validation without running.
 
 ## 1.78 Extended Test Matrix (Manual)
 
 - Preflight warnings (large XML) show warning and proceed works.
 - Preflight errors block start.
 - User changes XML after playlist selection; playlist resets.
 - Output folder changed mid-run should be blocked.
 - Cancel mid-run still writes partial outputs if enabled.
 - Run summary matches counts in output files.
 
 ## 1.79 Expanded Gherkin
 
 ```
 Scenario: Warning-only preflight
   Given the XML is large
   And the playlist exists
   When the user clicks Start
   Then preflight shows a warning
   And the user can proceed anyway
 
 Scenario: Output folder invalid
   Given output folder is read-only
   When the user clicks Start
   Then preflight blocks and suggests a new folder
 ```
 
 ## 1.80 Design Rationale
 
 - Preflight reduces support load by preventing avoidable errors.
 - Onboarding improves first-run success rate.
 - Run summary increases user trust and auditability.
 
 ## 1.81 Glossary (Extended)
 
 - **Preflight**: Validation before the run begins.
 - **Run summary**: Final report of the run.
 - **Run ID**: Unique identifier for a processing run.
 - **Warning**: Non-blocking validation issue.
 - **Error**: Blocking validation issue.
 
 ## 1.82 Documentation Plan (Detailed)
 
 - `docs/user-guide/workflows.md`: add onboarding and preflight steps.
 - `docs/user-guide/troubleshooting.md`: add error codes.
 - `docs/policy/privacy-notice.md`: add redaction description.
 - `docs/getting-started/quick-start.md`: add first-run summary.
 
 ## 1.83 QA Automation Plan
 
 - Add automated UI tests for onboarding visibility.
 - Add integration test for preflight errors.
 - Add snapshot test for run summary JSON output.
 
 ## 1.84 Future Refactors
 
 - Extract preflight into a reusable `ValidationService`.
 - Separate UI copy into a resource file for i18n.
 - Standardize output naming with a single formatter.
 
 ## 1.85 Implementation Phases (Detailed)
 
 - Phase 1:
   - Implement preflight service and UI.
   - Add error taxonomy and mapping to UI.
 - Phase 2:
   - Add onboarding dialog and persistence.
   - Add run summary data model and GUI dialog.
 - Phase 3:
   - Add CLI parity and preflight-only mode.
   - Add documentation updates.
 - Phase 4:
   - Add advanced settings and export preflight report.
 
 ## 1.86 Estimated Effort
 
 - Preflight service: 2-3 days.
 - Onboarding dialog: 1-2 days.
 - Run summary: 1-2 days.
 - Documentation updates: 1 day.
 - QA and tests: 2-3 days.
 
 ## 1.87 Definition of Done
 
 - Preflight blocks invalid runs.
 - Onboarding shown once and can be reopened.
 - Run summary is accurate and exportable.
 - CLI and GUI outputs are consistent.
 - Documentation updated and reviewed.
 
 ## 1.88 Appendix: Validation Helper Functions
 
 ```python
 def is_readable(path: Path) -> bool:
     try:
         with path.open("rb"):
             return True
     except OSError:
         return False
 
 def is_writable(path: Path) -> bool:
     try:
         test_file = path / ".cuepoint_write_test"
         with test_file.open("w") as f:
             f.write("ok")
         test_file.unlink()
         return True
     except OSError:
         return False
 ```
 
 ## 1.89 Appendix: Run Summary Model
 
 ```python
 @dataclass
 class RunSummary:
     run_id: str
     playlist: str
     total_tracks: int
     matched: int
     unmatched: int
     low_confidence: int
     duration_sec: int
     output_paths: list[str]
 ```
 
 ## 1.90 Appendix: Preflight Result Model
 
 ```python
 @dataclass
 class PreflightResult:
     errors: list[str]
     warnings: list[str]
     can_proceed: bool
 ```
 
 ## 1.91 Appendix: Example Preflight UI Layout
 
 ```
 +--------------------------+
 | Preflight checks         |
 | Errors (2)               |
 | - Playlist not found     |
 | - Output not writable    |
 | Warnings (1)             |
 | - XML file large         |
 | [Fix and retry] [Cancel] |
 +--------------------------+
 ```
 
 ## 1.92 Appendix: Run Summary Dialog Layout
 
 ```
 +---------------------------+
 | Run summary               |
 | Tracks: 500               |
 | Matched: 430              |
 | Unmatched: 70             |
 | Low confidence: 45        |
 | Duration: 18m 40s         |
 | Output: CuePoint_Main.csv |
 | [Open folder] [Copy] [OK] |
 +---------------------------+
 ```
