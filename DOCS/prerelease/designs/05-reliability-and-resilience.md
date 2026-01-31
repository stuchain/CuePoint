 # Step 5: Reliability and Resilience Design
 
 ## Purpose
 Ensure the app recovers gracefully from network issues, crashes, and large
 inputs without losing work.
 
 ## Current State
 - Matching pipeline is stable.
 - Update flow exists.
 - Logging and caching exist but resilience is limited.
 
 ## Proposed Implementation
 
 ### 5.1 Network Reliability
 - Centralize retry/backoff policy.
 - Provide "offline" or "retrying" UI state.
 
 ### 5.2 Safe Writes and Recovery
 - Atomic writes to output files.
 - Save partial progress every N tracks.
 - Resume from last checkpoint.
 
 ### 5.3 Defensive Parsing
 - Validate XML structure before processing.
 - Skip malformed tracks with audit entry.
 
 ## Code Touchpoints
 - `SRC/cuepoint/data/rekordbox.py`
 - `SRC/cuepoint/services/output_writer.py`
 - `SRC/cuepoint/services/processor_service.py`
 
 ## Example Checkpointing
 ```python
 if index % checkpoint_every == 0:
     save_checkpoint(state)
 ```
 
 ## Testing Plan
 - Simulate network timeouts and retries.
 - Kill process mid-run and verify resume works.
 - Test malformed XML entries are skipped safely.
 
 ## Acceptance Criteria
 - App resumes without data loss after interruption.
 - Output files are never left partially corrupted.
 - Network failures show clear recovery behavior.
 
 ---
 
 ## 5.4 Reliability Principles
 
 - Prefer safe failure over partial corruption.
 - Always preserve user outputs.
 - Resume work whenever possible.
 - Make transient errors recoverable.
 
 ## 5.5 Failure Taxonomy
 
 - **Network**: timeouts, rate limits, DNS errors.
 - **Input**: malformed XML, missing fields.
 - **Output**: disk full, permission errors.
 - **Runtime**: unexpected exceptions, crashes.
 
 ## 5.6 Retry and Backoff Policy
 
 - Retry on transient errors only.
 - Max retries: 3.
 - Exponential backoff with jitter.
 
 ## 5.7 Timeouts
 
 - Connect timeout: 5s.
 - Read timeout: 30s.
 - Total per request: 60s.
 
 ## 5.8 Checkpointing Strategy
 
 - Save checkpoint every N tracks.
 - Store checkpoint in app data.
 - Include run ID and progress state.
 
 ## 5.9 Resume Strategy
 
 - Resume from last checkpoint.
 - Skip already-processed tracks.
 - Validate output files before resuming.
 
 ## 5.10 Output Safety
 
 - Write to temp file, then rename.
 - Keep `.bak` for last run if enabled.
 
 ## 5.11 Crash Recovery
 
 - On crash, write crash log.
 - Offer resume on next launch.
 
 ## 5.12 Reliability UX
 
 - Show "Retrying..." status.
 - Show "Paused" state.
 - Show "Resume" button when possible.
 
 ## 5.13 Reliability Controls
 
 - `max_retries`
 - `timeout_connect`
 - `timeout_read`
 - `checkpoint_every`
 - `resume_enabled`
 
 ## 5.14 Checkpoint Format
 
 ```json
 {
   "run_id": "abc123",
   "last_track_index": 120,
   "output_paths": ["CuePoint_Main.csv"]
 }
 ```
 
 ## 5.15 Defensive Parsing Rules
 
 - Skip malformed track entries.
 - Log and continue.
 - Maintain audit trail.
 
 ## 5.16 Output Validation on Resume
 
 - Ensure output files exist.
 - Ensure headers match expected schema.
 
 ## 5.17 Reliability Tests (Core)
 
 - Simulate network timeouts.
 - Simulate disk full.
 - Simulate mid-run crash.
 
 ## 5.18 Error Codes (Reliability)
 
 - R001: Network timeout.
 - R002: Disk full.
 - R003: Output unwritable.
 - R004: Checkpoint invalid.
 
 ## 5.19 Reliability Checklist
 
 - [ ] Retry policy implemented.
 - [ ] Checkpointing enabled.
 - [ ] Resume supported.
 - [ ] Output writes atomic.
 
 ## 5.20 Reliability Tests (Expanded)
 
 - Retry respects max count.
 - Resume skips processed tracks.
 - Corrupt checkpoint ignored.
 
 ## 5.21 Reliability Metrics
 
 - Resume success rate.
 - Failure rate by type.
 - Average retry count.
 
 ## 5.22 Open Questions
 
 - Should resume be automatic or user-triggered?
 - How long to keep checkpoints?
 
 ## 5.23 Reliability Architecture
 
 - **Input guard**: validate XML before run.
 - **Processing guard**: isolate per-track errors.
 - **Output guard**: atomic writes + backups.
 - **Recovery guard**: checkpoints + resume.
 
 ## 5.24 Reliability State Machine
 
 - `idle`
 - `preflight`
 - `running`
 - `retrying`
 - `paused`
 - `resuming`
 - `completed`
 - `failed`
 
 ## 5.25 State Transition Rules
 
 - `preflight` must pass before `running`.
 - `running` may enter `retrying` on transient errors.
 - `retrying` returns to `running` or `failed`.
 - `running` → `paused` only with user action.
 - `paused` → `resuming` on user action.
 - `resuming` → `running` after checkpoint load.
 
 ## 5.26 Reliability Control Plane
 
 - Centralize configuration in config service.
 - Expose retry and timeout settings in advanced UI.
 - Persist run metadata for recovery.
 
 ## 5.27 Checkpoint Storage
 
 - Path: app data location.
 - Format: JSON with schema version.
 - One checkpoint per run ID.
 
 ## 5.28 Checkpoint Schema
 
 ```json
 {
   "schema_version": 1,
   "run_id": "abc123",
   "playlist": "MyPlaylist",
   "last_track_index": 120,
   "last_track_id": "trk_000120",
   "output_paths": {
     "main": "CuePoint_Main.csv",
     "review": "CuePoint_Review.csv"
   },
   "created_at": "2026-01-31T12:00:00Z"
 }
 ```
 
 ## 5.29 Resume Preconditions
 
 - Outputs exist and headers valid.
 - Checkpoint schema version supported.
 - Input XML unchanged (hash match).
 
 ## 5.30 Resume Validation (Pseudocode)
 
 ```python
 def can_resume(checkpoint, xml_path):
     if checkpoint.schema_version != SUPPORTED_SCHEMA:
         return False
     if hash(xml_path) != checkpoint.xml_hash:
         return False
     return True
 ```
 
 ## 5.31 XML Integrity Hash
 
 - Compute SHA256 of XML input at start.
 - Store hash in checkpoint.
 - Use to prevent resuming on changed input.
 
 ## 5.32 Safe Output Strategy
 
 - Write to `file.tmp`.
 - `fsync` then rename.
 - Optionally keep `.bak`.
 
 ## 5.33 Output Backup Policy
 
 - Keep last successful outputs as `.bak`.
 - Rotate backups per run.
 
 ## 5.34 Output Validation on Start
 
 - Check output directory writable.
 - Check free disk space threshold.
 - Warn if low disk space.
 
 ## 5.35 Disk Space Thresholds
 
 - Warn if < 500MB free.
 - Block if < 100MB free.
 
 ## 5.36 Retry Policy Table
 
 | Error | Retry | Max |
 | --- | --- | --- |
 | Timeout | Yes | 3 |
 | 500 error | Yes | 3 |
 | 404 error | No | 0 |
 | DNS error | Yes | 2 |
 
 ## 5.37 Backoff Formula
 
 - `delay = base * 2^attempt + jitter`
 - Base: 0.5s
 - Jitter: 0-0.25s
 
 ## 5.38 Network Circuit Breaker
 
 - Trip after 5 consecutive failures.
 - Pause processing for 30s.
 - Allow manual retry.
 
 ## 5.39 Rate Limit Handling
 
 - Detect 429 responses.
 - Increase backoff time.
 - Show warning to user.
 
 ## 5.40 Resilience UX Copy
 
 - "Network issue detected, retrying..."
 - "Paused due to repeated failures."
 - "Resume when ready."
 
 ## 5.41 Reliability Logging
 
 - Log retries with attempt count.
 - Log checkpoint saves.
 - Log resume decisions.
 
 ## 5.42 Reliability Events
 
 - `retry_start`
 - `retry_success`
 - `retry_failed`
 - `checkpoint_saved`
 - `resume_started`
 
 ## 5.43 Reliability Metrics (Expanded)
 
 - Retry success rate.
 - Average retries per run.
 - Checkpoint restore success rate.
 
 ## 5.44 Failure Handling for Inputs
 
 - If track missing title: skip and log.
 - If track missing artist: skip and log.
 
 ## 5.45 Failure Handling for Outputs
 
 - If file write fails: stop run safely.
 - If disk full: stop run and show message.
 
 ## 5.46 Failure Handling for Network
 
 - Retry transient errors.
 - Fail fast on permanent errors.
 
 ## 5.47 Recovery UX
 
 - Show resume prompt on startup if checkpoint exists.
 - Provide "discard checkpoint" option.
 
 ## 5.48 Recovery Prompts (Copy)
 
 - "We found an incomplete run. Resume?"
 - "Resume" / "Discard"
 
 ## 5.49 Recovery Auto-Cleanup
 
 - Remove checkpoint after successful completion.
 - Remove checkpoint if user discards.
 
 ## 5.50 Reliability Configuration Defaults
 
 ```yaml
 reliability:
   max_retries: 3
   timeout_connect: 5
   timeout_read: 30
   checkpoint_every: 50
   resume_enabled: true
 ```
 
 ## 5.51 Reliability Tests (Detailed)
 
 - Force DNS failure and verify retry.
 - Force 429 and verify backoff.
 - Force disk full and verify safe stop.
 - Force crash and verify resume prompt.
 
 ## 5.52 Integration Tests (Reliability)
 
 - Run pipeline with injected network failures.
 - Run pipeline with corrupt track entries.
 
 ## 5.53 System Tests (Reliability)
 
 - Kill process mid-run and resume.
 - Restart app and verify checkpoint detection.
 
 ## 5.54 Test Fixtures (Reliability)
 
 - Corrupt XML file.
 - XML with missing fields.
 - Large XML for stress.
 
 ## 5.55 QA Checklist (Reliability)
 
 - Retry UI appears on failure.
 - Resume prompt appears after crash.
 - Outputs are intact after resume.
 
 ## 5.56 Reliability Risk Register
 
 | Risk | Impact | Likelihood | Mitigation |
 | --- | --- | --- | --- |
 | Disk full | High | Medium | Preflight + warnings |
 | Network instability | Medium | High | Backoff + retries |
 | Checkpoint corruption | Medium | Low | Validate + discard |
 
 ## 5.57 Reliability Acceptance Criteria (Expanded)
 
 - Resume works for 95% of interrupted runs.
 - No partial CSV writes left behind.
 - Retry handles transient errors gracefully.
 
 ## 5.58 Reliability Roadmap
 
 - Phase 1: Checkpointing and resume.
 - Phase 2: Circuit breaker.
 - Phase 3: Enhanced recovery UI.
 
 ## 5.59 Reliability Open Questions (Expanded)
 
 - Should checkpoint data be encrypted?
 - Should resume be automatic or manual?
 - Should retries be configurable per user?
 
 ## 5.60 Reliability Implementation Plan (Detailed)
 
 - Add reliability settings to config model.
 - Implement checkpoint save/load.
 - Add resume prompt in GUI.
 - Add resume option in CLI.
 - Add retry/backoff wrapper for network calls.
 
 ## 5.61 Reliability Code Touchpoints (Expanded)
 
 - `SRC/cuepoint/services/processor_service.py`
 - `SRC/cuepoint/services/output_writer.py`
 - `SRC/cuepoint/services/logging_service.py`
 - `SRC/cuepoint/data/rekordbox.py`
 - `SRC/cuepoint/data/beatport_search.py`
 
 ## 5.62 Reliability Pseudocode (Resume)
 
 ```python
 if checkpoint_exists():
     if user_accepts_resume():
         resume_from_checkpoint()
     else:
         delete_checkpoint()
 ```
 
 ## 5.63 Reliability Pseudocode (Retry)
 
 ```python
 for attempt in range(max_retries):
     try:
         return request()
     except TransientError:
         sleep(backoff(attempt))
 raise
 ```
 
 ## 5.64 Failure Injection Framework
 
 - Use flags to simulate disk full.
 - Use mock network failures.
 - Use malformed XML fixtures.
 
 ## 5.65 Reliability Test Coverage
 
 - 100% of retry logic.
 - 90% of checkpoint logic.
 
 ## 5.66 Reliability Monitoring
 
 - Log retry counts per run.
 - Log resume usage.
 
 ## 5.67 Reliability UX Edge Cases
 
 - User declines resume.
 - User deletes checkpoint manually.
 
 ## 5.68 Reliability Constraints
 
 - Checkpoint file must be small (< 1MB).
 - Resume must be fast (< 5s).
 
 ## 5.69 Reliability Data Retention
 
 - Keep checkpoints for 7 days.
 - Cleanup old checkpoints on startup.
 
 ## 5.70 Reliability Cleanup
 
 - Remove temporary files on completion.
 - Remove partial outputs on failure (optional).
 
 ## 5.71 Reliability Scenarios (Matrix)
 
 | Scenario | Trigger | Expected Outcome |
 | --- | --- | --- |
 | Network timeout | Request times out | Retry and continue |
 | DNS failure | Host not found | Retry then fail |
 | Disk full | Write error | Stop run safely |
 | Crash | Process killed | Resume prompt |
 | Corrupt checkpoint | JSON invalid | Discard and continue |
 
 ## 5.72 Reliability Test Matrix (Expanded)
 
 | Test | Type | Priority |
 | --- | --- | --- |
 | Retry backoff | Unit | P0 |
 | Checkpoint save/load | Unit | P0 |
 | Resume after crash | System | P0 |
 | Disk full handling | Integration | P1 |
 | DNS failure handling | Integration | P1 |
 
 ## 5.73 Reliability UX Copy (Extended)
 
 - "Attempting to reconnect..."
 - "Saving progress..."
 - "Resume from last checkpoint?"
 - "Checkpoint discarded."
 
 ## 5.74 Reliability UX Actions
 
 - Retry now
 - Pause
 - Resume
 - Cancel run
 - Discard checkpoint
 
 ## 5.75 Partial Output Strategy
 
 - Write review and main CSV incrementally.
 - Flush output every N rows.
 - Track last successful row index.
 
 ## 5.76 Partial Output Recovery
 
 - On resume, skip rows already written.
 - Validate row count against checkpoint index.
 
 ## 5.77 Partial Output Tests
 
 - Kill during write, verify file not corrupted.
 - Resume and append correctly.
 
 ## 5.78 Input Validation for Reliability
 
 - Check XML size limits.
 - Reject overly large fields.
 
 ## 5.79 Reliability Constraints (System)
 
 - Memory usage must not exceed 2GB on large runs.
 - UI thread must stay responsive.
 
 ## 5.80 Reliability Code Patterns
 
 - Wrap all IO in safe try/except.
 - Convert errors to user-friendly messages.
 
 ## 5.81 Reliability Error Messaging
 
 - "Network unstable, retrying..."
 - "Disk space low, cannot continue."
 - "Checkpoint invalid; starting fresh."
 
 ## 5.82 Reliability Logging (Examples)
 
 ```
 [reliability] checkpoint_saved run_id=abc123 index=120
 [reliability] resume_started run_id=abc123
 [reliability] retry attempt=2 error=timeout
 ```
 
 ## 5.83 Reliability KPIs
 
 - Resume success rate > 95%.
 - Retry success rate > 85%.
 - Crash recovery success rate > 90%.
 
 ## 5.84 Reliability Alerts (Optional)
 
 - Alert if retry rate > 5 per run.
 - Alert if checkpoint corruption detected.
 
 ## 5.85 Reliability Failure Budget
 
 - Acceptable failure rate < 2%.
 - If exceeded, halt release.
 
 ## 5.86 Reliability Review Cadence
 
 - Review failures monthly.
 - Update retry logic as needed.
 
 ## 5.87 Reliability Backlog
 
 - Add circuit breaker UI.
 - Add safe auto-resume after reboot.
 
 ## 5.88 Reliability Risk Register (Expanded)
 
 | Risk | Impact | Likelihood | Mitigation |
 | --- | --- | --- | --- |
 | Output corruption | High | Low | Atomic writes |
 | Resume failure | Medium | Medium | Checkpoint validation |
 | Network flakiness | Medium | High | Backoff + retries |
 
 ## 5.89 Reliability Test Data (Fixtures)
 
 - XML with 1 track missing title.
 - XML with invalid encoding.
 - XML with 10k tracks.
 
 ## 5.90 Reliability CLI Options (Proposed)
 
 - `--resume`
 - `--no-resume`
 - `--checkpoint-every`
 - `--max-retries`
 
 ## 5.91 Reliability Config Schema (Expanded)
 
 ```yaml
 reliability:
   checkpoint_every: 50
   resume_enabled: true
   retry:
     max_attempts: 3
     base_delay_ms: 500
     jitter_ms: 250
 ```
 
 ## 5.92 Reliability Test Harness
 
 - Inject network errors using mock transport.
 - Inject disk full using fake FS layer.
 
 ## 5.93 Reliability Incident Playbook
 
 - Identify failure type.
 - Collect logs.
 - Reproduce with fixtures.
 - Patch and release.
 
 ## 5.94 Reliability Documentation
 
 - Add "Recover from crash" guide.
 - Add "Resume runs" section in docs.
 
 ## 5.95 Reliability Dependency Review
 
 - Confirm XML parser safety.
 - Confirm requests-cache behavior.
 
 ## 5.96 Reliability Benchmarks
 
 - Measure retry overhead.
 - Measure checkpoint write overhead.
 
 ## 5.97 Reliability Regression Tests
 
 - Run resume tests on each release candidate.
 
 ## 5.98 Reliability Ownership
 
 - Assign module owner for processor service.
 - Assign owner for output writer.
 
 ## 5.99 Reliability Summary
 
 - Reliability is achieved through checkpoints, retries, and safe IO.
 - Focus is on avoiding data loss and ensuring recovery.
 
 ## 5.100 Reliability Design Goals
 
 - Zero data corruption.
 - Predictable recovery after interruptions.
 - Clear user-facing recovery options.
 
 ## 5.101 Reliability Requirements (Functional)
 
 - Checkpoints saved at fixed intervals.
 - Resume supported in GUI and CLI.
 - Network retries with backoff.
 
 ## 5.102 Reliability Requirements (Non-Functional)
 
 - Checkpoint save < 200ms.
 - Resume < 5s on typical runs.
 - Retry overhead < 10% runtime.
 
 ## 5.103 Reliability Data Contracts
 
 - Checkpoint schema versioned.
 - Output files must remain valid CSV at all times.
 
 ## 5.104 Reliability Data Contracts (Example)
 
 ```json
 {
   "schema_version": 1,
   "run_id": "abc123",
   "last_track_index": 120
 }
 ```
 
 ## 5.105 Reliability Recovery Matrix
 
 | Failure | Recovery Path | User Action |
 | --- | --- | --- |
 | Crash | Resume from checkpoint | Accept resume |
 | Disk full | Stop run | Free space + resume |
 | Network fail | Retry | None |
 
 ## 5.106 Reliability Edge Cases
 
 - Resume after app upgrade.
 - Resume after config change.
 - Resume after output files moved.
 
 ## 5.107 Reliability Handling for Output Move
 
 - Detect missing output files.
 - Ask user to locate output directory.
 
 ## 5.108 Reliability Handling for Config Changes
 
 - Use checkpoint settings over current config for resuming.
 - Warn user if config changed.
 
 ## 5.109 Reliability Handling for App Upgrade
 
 - Validate checkpoint schema.
 - Migrate checkpoint if possible.
 
 ## 5.110 Reliability Invariants
 
 - Never overwrite output without backups.
 - Always validate checkpoint before resume.
 - Always log recovery actions.
 
 ## 5.111 Reliability Config Migration
 
 - Add migration for new reliability keys.
 - Keep defaults safe.
 
 ## 5.112 Reliability Error Handling Pattern
 
 ```python
 try:
     write_output(row)
 except OSError as exc:
     log_error(exc)
     abort_run_safe()
 ```
 
 ## 5.113 Reliability Retry Guard
 
 - Only retry on known transient errors.
 - Track retry counts per request.
 
 ## 5.114 Reliability Retry Guard (Example)
 
 ```python
 if error.code in TRANSIENT_ERRORS:
     retry()
 else:
     raise
 ```
 
 ## 5.115 Reliability Checkpoint Integrity
 
 - Validate JSON parse.
 - Validate required fields.
 - Validate schema version.
 
 ## 5.116 Reliability Checkpoint Integrity Tests
 
 - Missing fields.
 - Corrupt JSON.
 - Unsupported schema version.
 
 ## 5.117 Reliability Output Integrity
 
 - Use atomic writes.
 - Validate headers on resume.
 
 ## 5.118 Reliability Output Integrity Tests
 
 - Kill during write.
 - Resume and validate CSV.
 
 ## 5.119 Reliability Concurrency Safety
 
 - Ensure checkpoints saved from single thread.
 - Avoid concurrent writes to same output file.
 
 ## 5.120 Reliability Concurrency Tests
 
 - Run with concurrency=1 and 8; outputs identical.
 
 ## 5.121 Reliability UI States (Expanded)
 
 - `retrying`: show backoff timer.
 - `paused`: show resume CTA.
 - `recovering`: show checkpoint load.
 
 ## 5.122 Reliability UI Copy (Expanded)
 
 - "Recovering previous run..."
 - "Waiting 3s before retry..."
 
 ## 5.123 Reliability Diagnostic Bundle
 
 - Include checkpoint file.
 - Include last logs.
 - Include output metadata.
 
 ## 5.124 Reliability Diagnostic Tests
 
 - Bundle includes checkpoint.
 - Bundle includes logs.
 
 ## 5.125 Reliability Alerts (User)
 
 - Show warning on repeated retries.
 - Show warning on low disk.
 
 ## 5.126 Reliability Alerts (Internal)
 
 - Log when retries exceed threshold.
 - Log when checkpoints fail to save.
 
 ## 5.127 Reliability Backoff Tuning
 
 - Allow tuning via config.
 - Provide safe defaults.
 
 ## 5.128 Reliability CLI Messaging
 
 - Print retry attempts.
 - Print resume state.
 
 ## 5.129 Reliability CLI Example
 
 ```
 [retry] attempt=2 delay=1.0s
 [resume] loaded checkpoint at index=120
 ```
 
 ## 5.130 Reliability Persistence Layer
 
 - Store checkpoint in app data.
 - Store run metadata in app data.
 
 ## 5.131 Reliability Persistence Cleanup
 
 - Remove checkpoint after success.
 - Remove stale checkpoints after 7 days.
 
 ## 5.132 Reliability Stale Checkpoint Detection
 
 - Compare timestamp to current date.
 - Prompt user before deletion.
 
 ## 5.133 Reliability Offline Mode
 
 - Allow processing with cached data only.
 - Warn user results may be incomplete.
 
 ## 5.134 Reliability Offline Mode Tests
 
 - Disable network and run with cache.
 
 ## 5.135 Reliability Resource Limits
 
 - Max memory usage target 2GB.
 - Max temp file size limit.
 
 ## 5.136 Reliability Resource Limit Tests
 
 - Simulate low memory conditions.
 
 ## 5.137 Reliability Data Loss Prevention
 
 - Do not delete outputs automatically unless user opts in.
 
 ## 5.138 Reliability Audit Trail
 
 - Log checkpoint operations.
 - Log resume outcomes.
 
 ## 5.139 Reliability Audit Log Example
 
 ```
 [reliability] checkpoint_saved run_id=abc123 index=200
 [reliability] resume_success run_id=abc123
 ```
 
 ## 5.140 Reliability UX Decision Log
 
 - Resume is user-confirmed by default.
 - Pause supported for long runs.
 
 ## 5.141 Reliability Security Considerations
 
 - Checkpoints contain file paths; treat as sensitive.
 - Redact paths in logs.
 
 ## 5.142 Reliability Privacy Considerations
 
 - Do not send checkpoint data externally.
 - Clear checkpoint on request.
 
 ## 5.143 Reliability Incident Response
 
 - If data loss detected: stop release.
 - Add regression tests for fix.
 
 ## 5.144 Reliability Release Checklist
 
 - [ ] Resume tested
 - [ ] Retry tested
 - [ ] Output integrity verified
 
 ## 5.145 Reliability Definition of Done
 
 - Checkpointing works.
 - Resume works.
 - No output corruption.
 
 ## 5.146 Reliability Future Enhancements
 
 - Automatic resume without prompt.
 - Smart retry based on error class.
 - Disk space estimator.
 
 ## 5.147 Reliability Example Unit Test
 
 ```python
 def test_checkpoint_roundtrip(tmp_path):
     checkpoint = {"run_id": "abc123", "last_track_index": 5}
     save_checkpoint(tmp_path, checkpoint)
     assert load_checkpoint(tmp_path)["last_track_index"] == 5
 ```
 
 ## 5.148 Reliability Example Integration Test
 
 ```python
 def test_resume_after_crash(tmp_path):
     run_partial(tmp_path)
     assert resume_run(tmp_path).success
 ```
 
 ## 5.149 Reliability Example System Test
 
 ```python
 def test_resume_cli(tmp_path):
     run_cli("--xml", "fixtures/small.xml", "--resume")
 ```
 
 ## 5.150 Reliability Summary (Expanded)
 
 - Reliability is about safe IO, recovery, and graceful failure.
 - Checkpoints + retry logic are core to resilience.
 
 ## 5.151 Reliability Appendix: Error Table
 
 | Code | Meaning | User Action |
 | --- | --- | --- |
 | R001 | Network timeout | Wait or retry |
 | R002 | Disk full | Free space |
 | R003 | Output unwritable | Choose folder |
 | R004 | Checkpoint invalid | Start fresh |
 
 ## 5.152 Reliability Appendix: Config Keys
 
 - `reliability.max_retries`
 - `reliability.timeout_connect`
 - `reliability.timeout_read`
 - `reliability.checkpoint_every`
 - `reliability.resume_enabled`
 
 ## 5.153 Reliability Appendix: CLI Flags
 
 - `--resume`
 - `--no-resume`
 - `--checkpoint-every N`
 - `--max-retries N`
 
 ## 5.154 Reliability Appendix: UX Copy Table
 
 | Context | Message |
 | --- | --- |
 | Retry | "Retrying network request..." |
 | Resume | "Resume previous run?" |
 | Fail | "Run stopped safely." |
 
 ## 5.155 Reliability Appendix: Checklist (Condensed)
 
 - Retry logic in place
 - Checkpoint save/load
 - Resume prompt
 - Atomic writes
 
 ## 5.156 Reliability Appendix: Test Coverage Targets
 
 - Retry logic: 100%
 - Checkpoint logic: 90%
 - Output writer: 85%
 
 ## 5.157 Reliability Appendix: Monitoring Queries
 
 - Track retry counts per run.
 - Track resume usage per release.
 
 ## 5.158 Reliability Appendix: Open Risks
 
 - Large XML file corruption.
 - Unexpected OS file locks.
 
 ## 5.159 Reliability Appendix: Future Work
 
 - Adaptive retry windows.
 - Background resume mode.
 
