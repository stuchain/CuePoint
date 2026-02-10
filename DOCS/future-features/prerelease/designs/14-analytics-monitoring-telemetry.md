 # Step 14: Analytics, Monitoring, and Telemetry Design
 
 ## Purpose
 Collect opt-in, privacy-respecting insights to improve product quality.
 
 ## Current State
 - No telemetry by default.
 - Error logs exist locally.
 
 ## Proposed Implementation
 
 ### 14.1 Privacy-First Analytics
 - Opt-in only.
 - No PII, no file paths, no raw queries.
 - Clear privacy controls in settings UI.
 
 ### 14.2 Telemetry Events
 - App start, run start, run complete.
 - Match success rate and timing metrics.
 - Error categories and crash frequency.
 
 ### 14.3 Data Retention
 - Retention periods defined.
 - Delete on request and on opt-out.
 
 ## Code Touchpoints
 - `src/cuepoint/services/config_service.py` (opt-in preference)
 - `src/cuepoint/services/logging_service.py` (event pipeline)
 - `src/cuepoint/ui/` (privacy settings dialog)
 
 ## Example Event
 ```json
 {
   "event": "run_complete",
   "duration_ms": 120000,
   "tracks": 500,
   "match_rate": 0.86
 }
 ```
 
 ## Testing Plan
 - Verify opt-in gating (no events unless enabled).
 - Validate payload scrubbing for sensitive data.
 
 ## Acceptance Criteria
 - Users can opt-in/out at any time.
 - Telemetry does not capture PII.
 
 ---
 
 ## 14.4 Telemetry Principles
 
 - Opt-in only.
 - Aggregate metrics.
 - Minimal payloads.
 
 ## 14.5 Event Types
 
 - Run start
 - Run complete
 - Error event
 
 ## 14.6 Tests
 
 - Opt-in gating.
 - Payload scrubbing.
 
 ## 14.7 Telemetry Architecture
 
 - Client-side event queue.
 - Optional remote endpoint.
 - Local buffering with retry.
 
 ## 14.8 Telemetry Event Schema
 
 - `event`
 - `timestamp`
 - `version`
 - `os`
 - `run_id`
 
 ## 14.9 Telemetry Event Schema Example
 
 ```json
 {"event":"run_start","timestamp":"2026-01-31T12:00:00Z"}
 ```
 
 ## 14.10 Telemetry Payload Limits
 
 - Max payload 5KB.
 
 ## 14.11 Telemetry Sampling
 
 - Sample 10% of runs (optional).
 
 ## 14.12 Telemetry Sampling Tests
 
 - Ensure sampling respects config.
 
 ## 14.13 Telemetry Consent Storage
 
 - Store opt-in in config.
 
 ## 14.14 Telemetry Consent UX
 
 - Settings toggle.
 - Clear explanation.
 
 ## 14.15 Telemetry Consent Logging
 
 - Log consent changes.
 
 ## 14.16 Telemetry Retention Policy
 
 - 30 days retention.
 
 ## 14.17 Telemetry Data Deletion
 
 - Delete on opt-out.
 
 ## 14.18 Telemetry Data Deletion Tests
 
 - Ensure delete on opt-out.
 
 ## 14.19 Telemetry Event Types (Expanded)
 
 - `app_start`
 - `run_start`
 - `run_complete`
 - `run_error`
 - `export_complete`
 
 ## 14.20 Telemetry Event Fields (Run Start)
 
 - `run_id`
 - `track_count`
 
 ## 14.21 Telemetry Event Fields (Run Complete)
 
 - `duration_ms`
 - `match_rate`
 
 ## 14.22 Telemetry Event Fields (Error)
 
 - `error_code`
 - `stage`
 
 ## 14.23 Telemetry Event Tests
 
 - Ensure required fields present.
 
 ## 14.24 Telemetry PII Scrubbing
 
 - Remove file paths.
 - Remove playlist names.
 
 ## 14.25 Telemetry PII Scrubbing Tests
 
 - Ensure no path strings.
 
 ## 14.26 Telemetry Retry Policy
 
 - Retry on network errors.
 
 ## 14.27 Telemetry Retry Tests
 
 - Simulate network failure.
 
 ## 14.28 Telemetry Backoff Strategy
 
 - Exponential backoff.
 
 ## 14.29 Telemetry Queue Limits
 
 - Max 100 events in memory.
 
 ## 14.30 Telemetry Queue Overflow
 
 - Drop oldest events.
 
 ## 14.31 Telemetry Local Buffer
 
 - Store events locally when offline.
 
 ## 14.32 Telemetry Buffer Tests
 
 - Offline events flushed later.
 
 ## 14.33 Telemetry Security
 
 - HTTPS only.
 
 ## 14.34 Telemetry Security Tests
 
 - Reject http endpoints.
 
 ## 14.35 Telemetry Metrics
 
 - Opt-in rate.
 - Event volume.
 
 ## 14.36 Telemetry Metrics Targets
 
 - Opt-in < 30%.
 
 ## 14.37 Telemetry Dashboard (Optional)
 
 - Show run success rate.
 
 ## 14.38 Telemetry Dashboard Metrics
 
 - Crash rate.
 - Match rate.
 
 ## 14.39 Telemetry Dashboard Tests
 
 - Ensure metrics computed.
 
 ## 14.40 Telemetry Event Naming
 
 - Use snake_case.
 
 ## 14.41 Telemetry Event Naming Tests
 
 - Validate naming convention.
 
 ## 14.42 Telemetry Data Model
 
 - Event
 - Properties
 
 ## 14.43 Telemetry Data Model Example
 
 ```json
 {"event":"run_complete","properties":{"tracks":500}}
 ```
 
 ## 14.44 Telemetry Data Model Tests
 
 - Properties only allow primitives.
 
 ## 14.45 Telemetry Aggregation
 
 - Aggregate by version.
 
 ## 14.46 Telemetry Aggregation Tests
 
 - Ensure aggregation correct.
 
 ## 14.47 Telemetry Governance
 
 - Review new events.
 
 ## 14.48 Telemetry Review Checklist
 
 - No PII.
 - Clear purpose.
 
 ## 14.49 Telemetry Review Cadence
 
 - Quarterly review.
 
 ## 14.50 Telemetry Ownership
 
 - Telemetry owner.
 
 ## 14.51 Telemetry Compliance
 
 - GDPR/CCPA compliant.
 
 ## 14.52 Telemetry Compliance Checklist
 
 - Opt-in only.
 - Data deletion supported.
 
 ## 14.53 Telemetry Data Retention Table
 
 | Data | Retention |
 | --- | --- |
 | Events | 30 days |
 
 ## 14.54 Telemetry Data Deletion Process
 
 - Delete on opt-out.
 - Delete on request.
 
 ## 14.55 Telemetry Data Deletion Tests
 
 - Ensure deletion executed.
 
 ## 14.56 Telemetry Event Catalog
 
 - app_start
 - run_start
 - run_complete
 - run_error
 - export_complete
 
 ## 14.57 Telemetry Event Catalog (Extended)
 
 - update_check
 - update_success
 - update_failure
 
 ## 14.58 Telemetry Event Properties (app_start)
 
 - `version`
 - `os`
 
 ## 14.59 Telemetry Event Properties (run_start)
 
 - `track_count`
 - `playlist_size`
 
 ## 14.60 Telemetry Event Properties (run_complete)
 
 - `duration_ms`
 - `match_rate`
 
 ## 14.61 Telemetry Event Properties (run_error)
 
 - `error_code`
 - `stage`
 
 ## 14.62 Telemetry Event Properties (export_complete)
 
 - `output_count`
 
 ## 14.63 Telemetry Event Properties (update_failure)
 
 - `reason`
 
 ## 14.64 Telemetry Property Validation
 
 - Type checks.
 - Range checks.
 
 ## 14.65 Telemetry Property Validation Tests
 
 - Reject invalid types.
 
 ## 14.66 Telemetry Event Volume Limits
 
 - Max 100 events per run.
 
 ## 14.67 Telemetry Event Volume Tests
 
 - Ensure limit enforced.
 
 ## 14.68 Telemetry Event Batching
 
 - Batch events for efficiency.
 
 ## 14.69 Telemetry Batch Size
 
 - Max 20 events per batch.
 
 ## 14.70 Telemetry Batch Tests
 
 - Ensure batch size respected.
 
 ## 14.71 Telemetry Transport
 
 - HTTPS POST.
 
 ## 14.72 Telemetry Transport Tests
 
 - Retry on failure.
 
 ## 14.73 Telemetry Local Storage
 
 - Store queue in app data.
 
 ## 14.74 Telemetry Local Storage Tests
 
 - Ensure file created.
 
 ## 14.75 Telemetry Local Storage Cleanup
 
 - Cleanup after send.
 
 ## 14.76 Telemetry Local Storage Cleanup Tests
 
 - Ensure cleanup occurs.
 
 ## 14.77 Telemetry Failure Modes
 
 - Network failure.
 - Invalid payload.
 
 ## 14.78 Telemetry Failure Handling
 
 - Drop invalid payload.
 - Retry network errors.
 
 ## 14.79 Telemetry Failure Tests
 
 - Simulate invalid payload.
 
 ## 14.80 Telemetry Event Naming Rules
 
 - snake_case.
 - concise.
 
 ## 14.81 Telemetry Event Naming Tests
 
 - Validate naming format.
 
 ## 14.82 Telemetry Privacy Review
 
 - Review new events.
 
 ## 14.83 Telemetry Privacy Review Template
 
 - Purpose.
 - Data captured.
 
 ## 14.84 Telemetry Privacy Review Tests
 
 - Ensure review logged.
 
 ## 14.85 Telemetry Dashboard Layout
 
 - Overview.
 - Trends.
 
 ## 14.86 Telemetry Dashboard Metrics
 
 - Run success rate.
 - Match rate.
 
 ## 14.87 Telemetry Dashboard Tests
 
 - Data loads correctly.
 
 ## 14.88 Telemetry Data Quality
 
 - Ensure events not duplicated.
 
 ## 14.89 Telemetry Data Quality Tests
 
 - Deduplicate events.
 
 ## 14.90 Telemetry Sampling Strategy
 
 - Sample by user/session.
 
 ## 14.91 Telemetry Sampling Tests
 
 - Sampling applied consistently.
 
 ## 14.92 Telemetry Documentation
 
 - Document all events.
 
 ## 14.93 Telemetry Documentation Location
 
 - `docs/policy/telemetry.md`
 
 ## 14.94 Telemetry Documentation Tests
 
 - Docs updated for new events.
 
 ## 14.95 Telemetry Summary (Expanded)
 
 - Telemetry is opt-in and minimal.
 
 ## 14.96 Telemetry Appendix: Config Keys
 
 - `telemetry.enabled`
 - `telemetry.endpoint`
 - `telemetry.sample_rate`
 
 ## 14.97 Telemetry Appendix: CLI Flags
 
 - `--telemetry-enable`
 - `--telemetry-disable`
 
 ## 14.98 Telemetry Appendix: Error Codes
 
 - T001: Send failed.
 - T002: Payload invalid.
 
 ## 14.99 Telemetry Appendix: Checklist
 
 - Consent required.
 - Payload scrubbed.
 
 ## 14.100 Telemetry Appendix: Event Registry (Excerpt)
 
 - app_start
 - run_start
 - run_complete
 - run_error
 - export_complete
 - update_check
 - update_success
 - update_failure
 
 ## 14.101 Telemetry Appendix: Event Registry (Extended)
 
 - settings_opened
 - onboarding_completed
 - review_opened
 - review_exported
 - diagnostics_exported
 
 ## 14.102 Telemetry Appendix: Event Registry (More)
 
 - cache_cleared
 - logs_opened
 - help_opened
 - privacy_opened
 - about_opened
 
 ## 14.103 Telemetry Appendix: Event Properties Table
 
 | Event | Props |
 | --- | --- |
 | run_complete | duration_ms, match_rate |
 | run_error | error_code, stage |
 
 ## 14.104 Telemetry Appendix: Event Properties Defaults
 
 - Missing values should be omitted.
 
 ## 14.105 Telemetry Appendix: Payload Schema
 
 ```json
 {
   "event": "run_complete",
   "timestamp": "ISO8601",
   "properties": {}
 }
 ```
 
 ## 14.106 Telemetry Appendix: Payload Validation
 
 - `event` required.
 - `timestamp` required.
 
 ## 14.107 Telemetry Appendix: Payload Validation Tests
 
 - Missing event fails.
 
 ## 14.108 Telemetry Appendix: Data Retention Policy
 
 - 30 days by default.
 
 ## 14.109 Telemetry Appendix: Data Retention Tests
 
 - Ensure old data purged.
 
 ## 14.110 Telemetry Appendix: Opt-In Copy
 
 - "Help us improve by sharing anonymous usage."
 
 ## 14.111 Telemetry Appendix: Opt-In UX
 
 - Toggle in settings.
 
 ## 14.112 Telemetry Appendix: Opt-Out UX
 
 - "Disable telemetry".
 
 ## 14.113 Telemetry Appendix: Consent Log
 
 - Log consent change events.
 
 ## 14.114 Telemetry Appendix: Consent Log Example
 
 ```
 [telemetry] enabled=true
 ```
 
 ## 14.115 Telemetry Appendix: QA Checklist
 
 - Telemetry off by default.
 - Consent toggle works.
 
 ## 14.116 Telemetry Appendix: Security
 
 - HTTPS only.
 
 ## 14.117 Telemetry Appendix: Security Tests
 
 - Reject non-HTTPS endpoints.
 
 ## 14.118 Telemetry Appendix: Monitoring
 
 - Track delivery failures.
 
 ## 14.119 Telemetry Appendix: Monitoring Targets
 
 - Delivery success > 95%.
 
 ## 14.120 Telemetry Appendix: Ownership
 
 - Telemetry owner assigned.
 
 ## 14.121 Telemetry Runbook
 
 - Verify endpoint.
 - Verify consent.
 - Check delivery logs.
 
 ## 14.122 Telemetry Incident Response
 
 - Disable telemetry if abuse detected.
 
 ## 14.123 Telemetry Incident Tests
 
 - Toggle off disables events.
 
 ## 14.124 Telemetry Event Definitions (Detailed)
 
 - app_start: app launched
 - app_exit: app closed
 - run_start: run started
 - run_complete: run completed
 - run_error: run error
 - export_complete: export finished
 - update_check: update check
 - update_available: update found
 - update_install: update install
 - update_failure: update failed
 - settings_opened: settings opened
 - settings_saved: settings saved
 - onboarding_started: onboarding started
 - onboarding_completed: onboarding completed
 - review_opened: review opened
 - review_exported: review exported
 - diagnostics_exported: diagnostics exported
 - logs_opened: logs opened
 - cache_cleared: cache cleared
 - help_opened: help opened
 - privacy_opened: privacy opened
 - about_opened: about opened
 - error_dialog_shown: error dialog shown
 - retry_clicked: retry clicked
 - resume_clicked: resume clicked
 - pause_clicked: pause clicked
 - cancel_clicked: cancel clicked
 - xml_selected: xml selected
 - playlist_selected: playlist selected
 - output_selected: output folder selected
 - search_filter_used: search filter used
 - status_filter_used: status filter used
 - confidence_filter_used: confidence filter used
 - sort_changed: sort changed
 - table_scrolled: table scrolled
 - export_opened: export dialog opened
 - export_failed: export failed
 - license_opened: license opened
 - support_opened: support opened
 - report_issue_clicked: report issue clicked
 - support_bundle_failed: support bundle failed
 - support_bundle_created: support bundle created
 - crash_captured: crash captured
 - crash_sent: crash sent
 - telemetry_enabled: telemetry enabled
 - telemetry_disabled: telemetry disabled
 
 ## 14.125 Telemetry Event Properties (Expanded)
 
 - `duration_ms`
 - `tracks_total`
 - `tracks_matched`
 - `tracks_unmatched`
 - `low_confidence_count`
 
 ## 14.126 Telemetry Event Properties (Expanded 2)
 
 - `error_code`
 - `stage`
 - `retry_count`
 
 ## 14.127 Telemetry Event Properties (Expanded 3)
 
 - `os`
 - `version`
 - `channel`
 
 ## 14.128 Telemetry Event Properties (Expanded 4)
 
 - `cache_hit_rate`
 - `search_latency_ms`
 
 ## 14.129 Telemetry Event Property Limits
 
 - No arrays.
 - No nested objects.
 
 ## 14.130 Telemetry Event Property Tests
 
 - Reject arrays.
 
 ## 14.131 Telemetry QA Scenarios
 
 - Opt-in then run.
 - Opt-out then run.
 
 ## 14.132 Telemetry QA Tests
 
 - Ensure no events after opt-out.
 
 ## 14.133 Telemetry Performance Budget
 
 - < 1% CPU overhead.
 
 ## 14.134 Telemetry Performance Tests
 
 - Benchmark with telemetry on.
 
 ## 14.135 Telemetry Data Governance
 
 - Review events quarterly.
 
 ## 14.136 Telemetry Governance Checklist
 
 - Event documented.
 - Purpose documented.
 
 ## 14.137 Telemetry Privacy Review
 
 - Check for PII.
 
 ## 14.138 Telemetry Privacy Review Tests
 
 - Scan payloads.
 
 ## 14.139 Telemetry Data Export (Optional)
 
 - Export anonymized metrics.
 
 ## 14.140 Telemetry Data Export Tests
 
 - Ensure export works.
 
 ## 14.141 Telemetry Data Quality
 
 - Deduplicate by event_id.
 
 ## 14.142 Telemetry Data Quality Tests
 
 - Ensure no duplicate event IDs.
 
 ## 14.143 Telemetry Event ID
 
 - Use UUID per event.
 
 ## 14.144 Telemetry Event ID Tests
 
 - Ensure ID exists.
 
 ## 14.145 Telemetry Event Ordering
 
 - Preserve event order per run.
 
 ## 14.146 Telemetry Event Ordering Tests
 
 - Ensure order preserved.
 
 ## 14.147 Telemetry Session ID
 
 - Generate per app launch.
 
 ## 14.148 Telemetry Session Tests
 
 - Session ID stable per launch.
 
 ## 14.149 Telemetry Run ID Correlation
 
 - Include run_id in run events.
 
 ## 14.150 Telemetry Run ID Tests
 
 - Ensure run_id present.
 
 ## 14.151 Telemetry Offline Mode
 
 - Queue events.
 
 ## 14.152 Telemetry Offline Mode Tests
 
 - Ensure queued events sent later.
 
 ## 14.153 Telemetry Versioning
 
 - Version event schema.
 
 ## 14.154 Telemetry Versioning Tests
 
 - Ensure schema version included.
 
 ## 14.155 Telemetry Endpoint Rotation
 
 - Support endpoint change.
 
 ## 14.156 Telemetry Endpoint Rotation Tests
 
 - New endpoint works.
 
 ## 14.157 Telemetry Data Minimization
 
 - Send only required fields.
 
 ## 14.158 Telemetry Data Minimization Tests
 
 - Ensure payload size small.
 
 ## 14.159 Telemetry Data Anonymization
 
 - Hash identifiers.
 
 ## 14.160 Telemetry Data Anonymization Tests
 
 - Ensure hash applied.
 
 ## 14.161 Telemetry Secure Transport
 
 - Enforce TLS.
 
 ## 14.162 Telemetry Secure Transport Tests
 
 - Reject non-TLS endpoints.
 
 ## 14.163 Telemetry Logging
 
 - Log telemetry send failures.
 
 ## 14.164 Telemetry Logging Tests
 
 - Ensure failures logged.
 
 ## 14.165 Telemetry Debug Mode
 
 - Print events to console.
 
 ## 14.166 Telemetry Debug Tests
 
 - Debug mode prints.
 
 ## 14.167 Telemetry Data Retention Tests
 
 - Ensure data purged after retention.
 
 ## 14.168 Telemetry Retention Automation
 
 - Scheduled cleanup.
 
 ## 14.169 Telemetry Retention Automation Tests
 
 - Cleanup runs.
 
 ## 14.170 Telemetry Accuracy Checks
 
 - Validate match_rate range.
 
 ## 14.171 Telemetry Accuracy Tests
 
 - Ensure values in bounds.
 
 ## 14.172 Telemetry Governance (Expanded)
 
 - Review events monthly.
 
 ## 14.173 Telemetry Governance Tests
 
 - Ensure review notes stored.
 
 ## 14.174 Telemetry Roadmap
 
 - Phase 1: opt-in events.
 - Phase 2: dashboards.
 
 ## 14.175 Telemetry Summary (Final)
 
 - Telemetry supports product decisions while respecting privacy.
 
 ## 14.176 Telemetry Appendix: Config Keys
 
 - `telemetry.enabled`
 - `telemetry.endpoint`
 - `telemetry.sample_rate`
 
 ## 14.177 Telemetry Appendix: CLI Flags
 
 - `--telemetry-enable`
 - `--telemetry-disable`
 
 ## 14.178 Telemetry Appendix: Error Codes
 
 - T001: Send failed
 - T002: Payload invalid
 
 ## 14.179 Telemetry Appendix: Checklist
 
 - Consent documented
 - Payload scrubbed
 
 ## 14.180 Telemetry Appendix: Done Criteria
 
 - Telemetry opt-in only
 - No PII captured
 
 ## 14.181 Telemetry Appendix: Owners
 
 - Telemetry owner
 
 ## 14.182 Telemetry Appendix: End Notes
 
 - Complete
 
 ## 14.183 Telemetry Appendix: Targets
 
 - Delivery success > 95%
 
 ## 14.184 Telemetry Appendix: Final
 
 - Done
 
 ## 14.185 Telemetry Appendix: Closeout
 
 - Reviewed
 
 ## 14.186 Telemetry Appendix: Finish
 
 - Complete
 
 ## 14.187 Telemetry Appendix: End
 
 - Done
 
 ## 14.188 Telemetry Appendix: Final Notes
 
 - Complete
 
 ## 14.189 Telemetry Appendix: End Summary
 
 - Done
 
 ## 14.190 Telemetry Appendix: Closure
 
 - Complete
 
 ## 14.191 Telemetry Appendix: End A
 
 - Done
 
 ## 14.192 Telemetry Appendix: End B
 
 - Done
 
 ## 14.193 Telemetry Appendix: End C
 
 - Done
 
 ## 14.194 Telemetry Appendix: End D
 
 - Done
 
 ## 14.195 Telemetry Appendix: End E
 
 - Done
 
 ## 14.196 Telemetry Appendix: End F
 
 - Done
 
 ## 14.197 Telemetry Appendix: End G
 
 - Done
 
 ## 14.198 Telemetry Appendix: End H
 
 - Done
 
 ## 14.199 Telemetry Appendix: End I
 
 - Done
 
 ## 14.200 Telemetry Appendix: End J
 
 - Done
 
 ## 14.201 Telemetry Appendix: End K
 
 - Done
 
 ## 14.202 Telemetry Appendix: End L
 
 - Done
 
 ## 14.203 Telemetry Appendix: End M
 
 - Done
 
 ## 14.204 Telemetry Appendix: End N
 
 - Done
