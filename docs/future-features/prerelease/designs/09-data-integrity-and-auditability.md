 # Step 9: Data Integrity and Auditability Design
 
 ## Purpose
 Ensure outputs are correct, traceable, and safe to import back into tools.
 
 ## Current State
 - CSV outputs and audit logs exist.
 - Limited schema validation.
 
 ## Proposed Implementation
 
 ### 9.1 Output Validation
 - Validate CSV schema before writing.
 - Provide output format version in files.
 
 ### 9.2 Audit Logs
 - Include query used, candidate chosen, and match score per track.
 - Add run ID and timestamp to outputs.
 
 ### 9.3 Backups and Checksums
 - Optional `.bak` files for outputs.
 - Checksums for main outputs to detect corruption.
 
 ## Code Touchpoints
 - `src/cuepoint/services/output_writer.py`
 - `src/cuepoint/models/result.py`
 
 ## Example Output Metadata
 ```csv
 # cuepoint_run_id=2026-01-31T12:00:00Z_abc123
 # cuepoint_output_version=1
 ```
 
 ## Testing Plan
 - Schema validation tests for required CSV columns.
 - Re-import test using sample data.
 - Audit log completeness tests.
 
 ## Acceptance Criteria
 - Outputs are schema-valid and versioned.
 - Audit logs explain matching decisions.
 
 ---
 
 ## 9.4 Integrity Principles
 
 - Deterministic outputs.
 - Traceability for each match.
 
 ## 9.5 Output Schema Versioning
 
 - Add `schema_version` header.
 - Document migrations.
 
 ## 9.6 Audit Log Contents
 
 - Track title/artist.
 - Candidate chosen.
 - Score and rationale.
 
 ## 9.7 Tests
 
 - Schema validation.
 - Output diff checks.
 
 ## 9.8 Data Integrity Architecture
 
 - Schema validation before write.
 - Checksums after write.
 - Run ID for every output file.
 
 ## 9.9 Output Schema Definition
 
 - Required columns.
 - Column order.
 - Data types.
 
 ## 9.10 Required Columns (Main)
 
 - Title
 - Artist
 - BPM
 - Key
 - Label
 - Release Date
 
 ## 9.11 Output Schema Versioning Rules
 
 - Increment on breaking changes.
 - Document in release notes.
 
 ## 9.12 Output Schema Header Example
 
 ```csv
 # schema_version=1
 # run_id=abc123
 ```
 
 ## 9.13 Audit Log Schema
 
 - Track ID
 - Query used
 - Candidate selected
 - Score
 
 ## 9.14 Audit Log Example
 
 ```json
 {"track":"Song","query":"Song Artist","score":0.95}
 ```
 
 ## 9.15 Run ID Generation
 
 - UUID per run.
 - Include in logs and outputs.
 
 ## 9.16 Output File Naming
 
 - `CuePoint_Main_<run_id>.csv`
 - `CuePoint_Review_<run_id>.csv`
 
 ## 9.17 Output Backup Strategy
 
 - Create `.bak` for last run.
 - Rotate backups per run.
 
 ## 9.18 Output Checksum Strategy
 
 - SHA256 for main outputs.
 - Store checksum in `.sha256` file.
 
 ## 9.19 Output Checksum Example
 
 ```
 CuePoint_Main.csv  <sha256>
 ```
 
 ## 9.20 Audit Trail Requirements
 
 - Every match has trace info.
 - Every unmatched track logged.
 
 ## 9.21 Audit Trail Fields
 
 - Track title.
 - Artist.
 - Candidate URL.
 - Score.
 - Guards applied.
 
 ## 9.22 Audit Trail Storage
 
 - JSON lines file.
 - Stored alongside outputs.
 
 ## 9.23 Audit Trail Size Limits
 
 - Compress if > 50MB.
 
 ## 9.24 Integrity Checks
 
 - Schema validation.
 - Checksum validation.
 - Row count validation.
 
 ## 9.25 Row Count Validation
 
 - Output rows == processed tracks.
 - Review rows <= low confidence tracks.
 
 ## 9.26 Data Integrity Tests (Unit)
 
 - Schema validation logic.
 - Checksum generation.
 
 ## 9.27 Data Integrity Tests (Integration)
 
 - Run pipeline and verify outputs.
 - Verify audit trail completeness.
 
 ## 9.28 Data Integrity Tests (System)
 
 - Re-import outputs into Rekordbox.
 
 ## 9.29 Data Integrity Errors
 
 - D001: Missing required column.
 - D002: Checksum mismatch.
 - D003: Schema version mismatch.
 
 ## 9.30 Data Integrity Error Handling
 
 - Fail run if schema invalid.
 - Warn if checksum mismatch.
 
 ## 9.31 Data Integrity UX
 
 - Show run summary with checksum status.
 - Provide "Verify outputs" action.
 
 ## 9.32 Verification Workflow
 
 - User clicks "Verify outputs".
 - App recomputes checksums.
 
 ## 9.33 Verification UX Copy
 
 - "All outputs verified."
 - "Checksum mismatch detected."
 
 ## 9.34 Auditability Principles
 
 - Traceability.
 - Explainability.
 - Reproducibility.
 
 ## 9.35 Auditability Levels
 
 - Basic: match + score.
 - Detailed: query + candidate list.
 
 ## 9.36 Auditability Exports
 
 - `audit.jsonl`
 - `queries.csv`
 - `candidates.csv`
 
 ## 9.37 Auditability Example (Detailed)
 
 ```json
 {"track":"Song","candidates":[{"title":"Song","score":0.95}]}
 ```
 
 ## 9.38 Deterministic Outputs
 
 - Sort rows by input order.
 - Use stable sorting for candidates.
 
 ## 9.39 Determinism Tests
 
 - Same input yields same output order.
 - Same input yields same scores.
 
 ## 9.40 Integrity Metrics
 
 - Checksum mismatch rate.
 - Schema validation failure rate.
 
 ## 9.41 Integrity Ownership
 
 - Output writer owner.
 - Audit log owner.
 
 ## 9.42 Integrity Roadmap
 
 - Phase 1: schema validation.
 - Phase 2: checksums.
 - Phase 3: audit enhancements.
 
 ## 9.43 Output Schema Validation Rules
 
 - Column names must match exactly.
 - Column order must match spec.
 - No empty header fields.
 
 ## 9.44 Output Schema Validation Example
 
 ```python
 assert headers == REQUIRED_COLUMNS
 ```
 
 ## 9.45 Output Version Migration Plan
 
 - Add migration script for schema changes.
 - Document migration in release notes.
 
 ## 9.46 Output Versioning Policy
 
 - Major schema change -> version bump.
 - Minor fields -> no bump.
 
 ## 9.47 Audit Log Versioning
 
 - Audit log schema version in header.
 
 ## 9.48 Output Compression (Optional)
 
 - Compress audit logs if large.
 - Leave main CSV uncompressed.
 
 ## 9.49 Integrity in Partial Runs
 
 - Mark partial runs in output header.
 - Include `run_status=partial`.
 
 ## 9.50 Integrity in Resume
 
 - Preserve run ID.
 - Append to existing outputs safely.
 
 ## 9.51 Output Append Rules
 
 - Avoid duplicate rows.
 - Track last written index.
 
 ## 9.52 Output Append Tests
 
 - Resume run appends correctly.
 - No duplicate rows.
 
 ## 9.53 Output Path Safety
 
 - Validate output path.
 - Reject path traversal.
 
 ## 9.54 Output Path Safety Tests
 
 - Reject `../` paths.
 
 ## 9.55 Audit Log Privacy
 
 - Redact file paths.
 - Avoid storing raw HTML.
 
 ## 9.56 Audit Log Redaction Tests
 
 - Ensure no file paths in audit log.
 
 ## 9.57 Audit Log Retention
 
 - Keep last 10 runs.
 - Allow manual cleanup.
 
 ## 9.58 Integrity Verification Tool
 
 - CLI: `--verify-outputs`.
 - GUI: "Verify outputs" button.
 
 ## 9.59 Integrity Verification Tool Output
 
 - Pass/fail summary.
 - Detailed errors.
 
 ## 9.60 Integrity Verification Sample Output
 
 ```
 Outputs verified: OK
 ```
 
 ## 9.61 Integrity Error UX
 
 - Show error code.
 - Provide recovery steps.
 
 ## 9.62 Integrity Recovery Steps
 
 - Re-run processing.
 - Restore from backup.
 
 ## 9.63 Integrity Backup Policy
 
 - Keep last 3 backups.
 - Rotate oldest.
 
 ## 9.64 Integrity Backup Tests
 
 - Backup created on new run.
 - Backup restored correctly.
 
 ## 9.65 Integrity Data Contracts
 
 - Output fields documented.
 - Audit fields documented.
 
 ## 9.66 Integrity Documentation
 
 - Add schema doc to `docs/`.
 - Add audit log doc.
 
 ## 9.67 Integrity Metrics Targets
 
 - Schema failure rate < 1%.
 - Checksum mismatch rate < 0.1%.
 
 ## 9.68 Integrity Error Codes (Expanded)
 
 - D004: Output path invalid.
 - D005: Audit log missing.
 
 ## 9.69 Integrity Error Handling (Expanded)
 
 - Stop run if output path invalid.
 - Warn if audit log missing.
 
 ## 9.70 Audit Log Content (Expanded)
 
 - Candidate list size.
 - Guard decisions.
 
 ## 9.71 Audit Log Content Example
 
 ```json
 {"track":"Song","guard":"subset_reject","score":0.2}
 ```
 
 ## 9.72 Integrity Tests (Expanded)
 
 - Output path traversal blocked.
 - Audit log contains guard reason.
 
 ## 9.73 Integrity Ownership (Expanded)
 
 - Output schema owner.
 - Audit log owner.
 - Verification tool owner.
 
 ## 9.74 Integrity QA Checklist
 
 - Schema validation passes.
 - Checksums generated.
 - Audit log created.
 
 ## 9.75 Integrity UX Copy
 
 - "Outputs verified successfully."
 - "Checksum mismatch detected."
 
 ## 9.76 Integrity Log Events
 
 - `output_write`
 - `checksum_generated`
 - `audit_log_written`
 
 ## 9.77 Integrity Log Fields
 
 - `run_id`
 - `file_path`
 - `checksum`
 
 ## 9.78 Integrity Log Example
 
 ```
 [integrity] checksum_generated file=CuePoint_Main.csv sha256=...
 ```
 
 ## 9.79 Integrity Testing Cadence
 
 - Run verification on release builds.
 
 ## 9.80 Integrity Summary
 
 - Integrity requires schema validation, checksums, and audit logs.
 
 ## 9.81 Integrity Appendices (Placeholders)
 
 - Schema table.
 - Audit log schema.
 - Verification checklist.
 
 ## 9.82 Output Schema Table (Main CSV)
 
 | Column | Type | Required | Notes |
 | --- | --- | --- | --- |
 | Title | string | Yes | Track title |
 | Artist | string | Yes | Track artist |
 | BPM | number | No | May be empty |
 | Key | string | No | Musical key |
 | Label | string | No | Beatport label |
 | Release Date | string | No | ISO date |
 
 ## 9.83 Output Schema Table (Review CSV)
 
 | Column | Type | Required | Notes |
 | --- | --- | --- | --- |
 | Title | string | Yes | Track title |
 | Artist | string | Yes | Track artist |
 | Score | number | Yes | Match score |
 | Reason | string | No | Why flagged |
 
 ## 9.84 Output Schema Table (Candidates CSV)
 
 | Column | Type | Required | Notes |
 | --- | --- | --- | --- |
 | Track Title | string | Yes | Input track |
 | Candidate Title | string | Yes | Candidate |
 | Score | number | Yes | Match score |
 | URL | string | No | Source link |
 
 ## 9.85 Output Schema Table (Queries CSV)
 
 | Column | Type | Required | Notes |
 | --- | --- | --- | --- |
 | Track Title | string | Yes | Input track |
 | Query | string | Yes | Generated query |
 
 ## 9.86 Output Schema Version Header Rules
 
 - Must be first line.
 - Include schema version and run ID.
 
 ## 9.87 Output Schema Header Example
 
 ```
 # schema_version=1
 # run_id=abc123
 ```
 
 ## 9.88 Audit Log Schema Table
 
 | Field | Type | Required | Notes |
 | --- | --- | --- | --- |
 | track_id | string | Yes | Internal ID |
 | title | string | Yes | Track title |
 | artist | string | Yes | Track artist |
 | query | string | Yes | Query used |
 | candidate_title | string | No | Selected candidate |
 | score | number | No | Match score |
 | guard | string | No | Guard result |
 
 ## 9.89 Audit Log JSONL Example
 
 ```json
 {"track_id":"t1","title":"Song","artist":"Artist","score":0.95}
 ```
 
 ## 9.90 Audit Log Required Fields
 
 - track_id
 - title
 - artist
 - query
 - score
 
 ## 9.91 Audit Log Optional Fields
 
 - guard_reason
 - candidate_url
 - candidate_label
 
 ## 9.92 Audit Log Validation Rules
 
 - Every input track must have an audit entry.
 - Scores must be 0.0–1.0.
 
 ## 9.93 Audit Log Validation Tests
 
 - Missing track_id fails.
 - Score out of bounds fails.
 
 ## 9.94 Data Integrity Configuration
 
 ```yaml
 integrity:
   schema_version: 1
   checksums: true
   backups: true
   audit_log: true
 ```
 
 ## 9.95 Data Integrity Config Validation
 
 - schema_version must be supported.
 - checksums boolean.
 
 ## 9.96 Data Integrity CLI Flags
 
 - `--verify-outputs`
 - `--no-checksums`
 - `--no-audit-log`
 
 ## 9.97 Data Integrity Verification Steps
 
 - Read headers.
 - Validate schema.
 - Validate row counts.
 - Validate checksums.
 
 ## 9.98 Data Integrity Verification Output
 
 - OK if all checks pass.
 - List errors otherwise.
 
 ## 9.99 Data Integrity Verification Example
 
 ```
 Verify outputs: OK
 Checksums: OK
 Schema: OK
 ```
 
 ## 9.100 Data Integrity Error UX
 
 - Show error details.
 - Provide recovery suggestions.
 
 ## 9.101 Data Integrity Recovery Paths
 
 - Re-run processing.
 - Restore backups.
 - Re-verify outputs.
 
 ## 9.102 Data Integrity Backup Restore Flow
 
 - User selects backup.
 - App restores files.
 - App verifies checksums.
 
 ## 9.103 Backup Restore Tests
 
 - Restore succeeds.
 - Restored files pass validation.
 
 ## 9.104 Integrity in Multi-Run Sessions
 
 - Each run has unique run ID.
 - Outputs stored per run.
 
 ## 9.105 Integrity in Overwrites
 
 - Require confirmation.
 - Create backup before overwrite.
 
 ## 9.106 Integrity for Review File
 
 - Only low-confidence rows.
 - Include reason column.
 
 ## 9.107 Integrity for Review Reason
 
 - "Low score"
 - "Guard triggered"
 
 ## 9.108 Data Integrity Metrics (Expanded)
 
 - Backup restore success rate.
 - Verification success rate.
 
 ## 9.109 Integrity QA Checklist (Expanded)
 
 - Validate schema.
 - Validate checksums.
 - Validate audit logs.
 
 ## 9.110 Integrity Error Messages
 
 - "Schema mismatch detected."
 - "Checksum mismatch detected."
 
 ## 9.111 Integrity Error Codes (Full)
 
 - D001: Missing column
 - D002: Checksum mismatch
 - D003: Schema version mismatch
 - D004: Output path invalid
 - D005: Audit log missing
 - D006: Backup missing
 
 ## 9.112 Integrity Testing Matrix
 
 | Test | Type | Priority |
 | --- | --- | --- |
 | Schema validation | Unit | P0 |
 | Checksum validation | Unit | P0 |
 | Backup restore | Integration | P1 |
 
 ## 9.113 Integrity Ownership Matrix
 
 | Area | Owner |
 | --- | --- |
 | Schema | Output writer |
 | Audit log | Matcher |
 | Checksums | Output writer |
 
 ## 9.114 Integrity Incident Response
 
 - Detect corruption.
 - Notify user.
 - Provide restore path.
 
 ## 9.115 Integrity Incident Log
 
 - Log run ID.
 - Log affected files.
 
 ## 9.116 Integrity Corruption Scenarios
 
 - Disk write failure.
 - Unexpected app crash.
 
 ## 9.117 Integrity Prevention
 
 - Atomic writes.
 - Checksums.
 
 ## 9.118 Integrity Performance Cost
 
 - Checksums add overhead.
 - Audit logs add IO.
 
 ## 9.119 Integrity Performance Targets
 
 - Checksums < 5% overhead.
 - Audit logs < 10% overhead.
 
 ## 9.120 Integrity Performance Tests
 
 - Benchmark with checksums on/off.
 
 ## 9.121 Data Integrity Summary (Expanded)
 
 - Ensure outputs can be trusted and traced.
 
 ## 9.122 Integrity Appendix: Config Keys
 
 - `integrity.schema_version`
 - `integrity.checksums`
 - `integrity.audit_log`
 - `integrity.backups`
 
 ## 9.123 Integrity Appendix: CLI Flags
 
 - `--verify-outputs`
 - `--no-checksums`
 - `--no-audit-log`
 
 ## 9.124 Integrity Appendix: Checklist
 
 - Schema validated
 - Checksums generated
 - Audit log written
 
 ## 9.125 Integrity Appendix: Glossary
 
 - Schema: expected structure of outputs.
 - Audit log: record of matching decisions.
 
 ## 9.126 Integrity Appendix: Verification Script Example
 
 ```python
 def verify_outputs(path):
     validate_schema(path)
     validate_checksums(path)
 ```
 
 ## 9.127 Integrity Appendix: Output Header Fields
 
 - `schema_version`
 - `run_id`
 - `run_status`
 
 ## 9.128 Integrity Appendix: Output Header Example
 
 ```
 # schema_version=1
 # run_id=abc123
 # run_status=complete
 ```
 
 ## 9.129 Integrity Appendix: Audit Log Example (Extended)
 
 ```json
 {"track_id":"t1","query":"Song Artist","candidates":3,"score":0.95}
 ```
 
 ## 9.130 Integrity Appendix: Done Criteria
 
 - Outputs validated.
 - Checksums validated.
 - Audit log present.
 
 ## 9.131 Integrity Appendix: Tests (List)
 
 - Schema validation unit tests.
 - Checksum validation unit tests.
 - Audit log completeness tests.
 
 ## 9.132 Integrity Appendix: Metrics Targets
 
 - Verification success > 99%.
 - Backup restore success > 98%.
 
 ## 9.133 Integrity Appendix: Ownership
 
 - Output schema owner.
 - Audit log owner.
 
 ## 9.134 Integrity Data Lineage
 
 - Track input XML hash.
 - Track query variants.
 - Track selected candidate.
 
 ## 9.135 Data Lineage Fields
 
 - `input_xml_hash`
 - `query_variants`
 - `candidate_url`
 
 ## 9.136 Data Lineage Example
 
 ```json
 {"track_id":"t1","input_xml_hash":"...","candidate_url":"https://..."}
 ```
 
 ## 9.137 Data Integrity in Export Formats
 
 - CSV must preserve ordering.
 - Fields must be normalized.
 
 ## 9.138 Data Integrity Field Normalization
 
 - Trim whitespace.
 - Normalize case for keys.
 
 ## 9.139 Normalization Tests
 
 - Ensure no leading/trailing spaces.
 - Ensure key format consistent.
 
 ## 9.140 Data Integrity Edge Cases
 
 - Duplicate tracks in input.
 - Empty artist or title.
 - Non-ASCII characters.
 
 ## 9.141 Data Integrity Edge Case Handling
 
 - Deduplicate by track ID.
 - Allow empty fields but log warning.
 
 ## 9.142 Integrity for Non-ASCII
 
 - Ensure UTF-8 output.
 - Preserve characters in output.
 
 ## 9.143 Integrity UTF-8 Tests
 
 - Track with accented characters.
 - Track with non-Latin script.
 
 ## 9.144 Integrity for CSV Injection
 
 - Escape fields starting with `=`, `+`, `-`, `@`.
 
 ## 9.145 CSV Injection Protection Example
 
 ```python
 if value.startswith(("=", "+", "-", "@")):
     value = "'" + value
 ```
 
 ## 9.146 CSV Injection Tests
 
 - Input track name starting with `=`.
 
 ## 9.147 Audit Log Compression
 
 - Gzip if size > 50MB.
 - Include `.gz` extension.
 
 ## 9.148 Audit Log Compression Tests
 
 - Large audit log compresses.
 - Compressed log still readable.
 
 ## 9.149 Integrity for Re-import
 
 - Validate required fields for Rekordbox import.
 
 ## 9.150 Re-import Validation Tests
 
 - Ensure required fields present.
 
 ## 9.151 Integrity Comparison Tool
 
 - Diff input vs output.
 - Highlight changes.
 
 ## 9.152 Integrity Diff Output
 
 - Report field changes per track.
 
 ## 9.153 Integrity Diff Example
 
 ```
 Track: Song
 BPM: 0 -> 128
 ```
 
 ## 9.154 Integrity Diff Tests
 
 - Ensure diff output correct.
 
 ## 9.155 Integrity Report
 
 - Summary of changes.
 - Count of updated fields.
 
 ## 9.156 Integrity Report Example
 
 ```
 Updated BPM: 120
 Updated Key: 115
 ```
 
 ## 9.157 Integrity for Partial Failures
 
 - If a track fails, log in audit.
 - Continue processing.
 
 ## 9.158 Integrity for Partial Failures Tests
 
 - Simulate parsing error.
 - Ensure run continues.
 
 ## 9.159 Integrity Tracking in Logs
 
 - Log schema validation result.
 - Log checksum generation.
 
 ## 9.160 Integrity Logs Example
 
 ```
 [integrity] schema_valid=true
 [integrity] checksum_generated file=main.csv
 ```
 
 ## 9.161 Integrity Data Storage Locations
 
 - Outputs in user folder.
 - Audit logs alongside outputs.
 - Checksums alongside outputs.
 
 ## 9.162 Integrity File Naming Rules
 
 - Use run ID.
 - Avoid spaces.
 
 ## 9.163 Integrity File Naming Example
 
 - `CuePoint_Main_abc123.csv`
 - `CuePoint_Audit_abc123.jsonl`
 
 ## 9.164 Integrity Validation Frequency
 
 - Validate on write.
 - Validate on export.
 
 ## 9.165 Integrity Validation Performance
 
 - Schema check O(n).
 - Checksum O(n) with streaming.
 
 ## 9.166 Integrity Streaming Checksums
 
 - Compute during write to avoid second pass.
 
 ## 9.167 Integrity Streaming Checksums Tests
 
 - Ensure checksum matches separate pass.
 
 ## 9.168 Integrity Fail-Fast Rules
 
 - Stop if schema invalid.
 - Warn if checksum mismatch.
 
 ## 9.169 Integrity Fail-Fast UX
 
 - Show error and stop run.
 
 ## 9.170 Integrity Audit Log Sampling
 
 - Do not sample; full log required.
 
 ## 9.171 Integrity Security Considerations
 
 - Protect audit log from tampering.
 - Checksums detect corruption.
 
 ## 9.172 Integrity Security Tests
 
 - Modify output file and verify checksum fails.
 
 ## 9.173 Integrity Compliance
 
 - Ensure audit logs do not store PII.
 
 ## 9.174 Integrity Compliance Tests
 
 - Scan audit logs for file paths.
 
 ## 9.175 Integrity Documentation (Expanded)
 
 - Document schema changes.
 - Document verification steps.
 
 ## 9.176 Integrity Rollback Strategy
 
 - Restore from `.bak`.
 - Re-run verification.
 
 ## 9.177 Integrity Rollback Tests
 
 - Restore backup and verify.
 
 ## 9.178 Integrity Ownership (Expanded)
 
 - Schema owner: output writer.
 - Verification owner: tools team.
 
 ## 9.179 Integrity Roadmap (Expanded)
 
 - Phase 1: schema checks.
 - Phase 2: checksums.
 - Phase 3: diff tool.
 
 ## 9.180 Integrity Summary (Final)
 
 - Outputs are validated, traceable, and safe to re-import.
 
