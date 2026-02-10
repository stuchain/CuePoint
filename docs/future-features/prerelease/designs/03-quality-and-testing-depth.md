 # Step 3: Quality and Testing Depth Design
 
 ## Purpose
 Build confidence in correctness across parsing, matching, updates, and exports.
 
 ## Current State
 - Existing tests in `src/tests`.
 - Release readiness checks exist.
 
 ## Proposed Implementation
 
 ### 3.1 Test Layers
 - Unit: text normalization, parsing, scoring.
 - Integration: XML → candidates → outputs.
 - System: end-to-end CLI run with sample data.
 
 ### 3.2 Test Data
 - Maintain sample XML fixtures:
   - Small (10 tracks), medium (500), large (10k).
 - Store recorded Beatport HTML for offline parsing tests.
 
 ### 3.3 Regression Suite
 - Add a regression folder keyed by issue ID.
 - Each regression includes input XML + expected output snapshot.
 
 ## Code Touchpoints
 - `src/tests/` (canonical tests)
 - `src/cuepoint/core/` (text processing, matcher)
 - `src/cuepoint/data/` (rekordbox, beatport parsing)
 - Release/build tests in `scripts/` (e.g. test_build_and_executable.py)
 
 ## Example Test (Pseudocode)
 ```python
 def test_query_normalization_variants():
     input_title = "Track Name (Extended Mix)"
     variants = generate_queries(input_title)
     assert "Track Name" in variants
 ```
 
 ## Testing Plan
 - Add golden-file outputs for CSV schema.
 - Add property-based tests for normalization and matching.
 - Add update flow tests for rollback and interrupted update.
 
 ## Acceptance Criteria
 - Automated tests cover parsing, matching, and outputs.
 - Smoke test processes sample XML without errors.
 - Release gates require passing tests.
 
 ---
 
 ## 3.4 Testing Philosophy
 
 - Prefer deterministic tests over brittle UI automation.
 - Use fixtures to isolate network dependencies.
 - Test at the lowest meaningful layer first.
 - Add integration tests for critical paths.
 - Ensure tests are fast enough for CI.
 
 ## 3.5 Test Layers (Expanded)
 
 ### Unit Tests
 - Text normalization.
 - Query generation.
 - Matcher scoring heuristics.
 - XML parsing utilities.
 
 ### Integration Tests
 - Rekordbox XML → parsed track list.
 - Query generation → search calls.
 - Candidate parsing → model population.
 - Output writer → CSV contents.
 
 ### System Tests
 - End-to-end CLI run on sample XML.
 - Update workflow tests.
 - Installer verification tests (smoke).
 
 ## 3.6 Test Directory Structure
 
 ```
 src/tests/
 ├─ unit/
 ├─ integration/
 ├─ system/
 ├─ fixtures/
 └─ regression/
 ```
 
 ## 3.7 Test Data Strategy
 
 ### XML Fixtures
 - `small.xml`: 10 tracks.
 - `medium.xml`: 500 tracks.
 - `large.xml`: 10k tracks.
 
 ### Candidate Fixtures
 - Recorded Beatport HTML pages.
 - JSON snapshots for parsed candidates.
 
 ### Output Fixtures
 - Expected CSV outputs for deterministic inputs.
 - Review and queries logs for verification.
 
 ## 3.8 Test Data Versioning
 
 - Store fixtures with version suffix.
 - Never modify fixtures without updating expected outputs.
 - Keep a changelog for fixtures.
 
 ## 3.9 Unit Test Coverage Targets
 
 - Core matching logic: 90%+
 - Query generation: 85%+
 - XML parsing: 85%+
 - Output writer: 80%+
 
 ## 3.10 Integration Coverage Targets
 
 - XML → results pipeline: 80% paths.
 - Candidate parsing: 80% paths.
 - Update flow: 70% paths.
 
 ## 3.11 System Coverage Targets
 
 - CLI run: 1 happy path.
 - CLI run with warnings.
 - CLI run with errors.
 
 ## 3.12 Test Naming Conventions
 
 - `test_<module>_<behavior>`
 - Include scenario in name.
 - Keep tests small and focused.
 
 ## 3.13 Test Dependencies
 
 - `pytest`
 - `pytest-mock`
 - `hypothesis` (property-based)
 - `responses` (HTTP mocking)
 
 ## 3.14 Mocking Strategy
 
 - Mock external HTTP calls.
 - Use recorded HTML for parsing tests.
 - Avoid mocking core logic unless unavoidable.
 
 ## 3.15 Property-Based Testing (Normalization)
 
 - Generate random strings with punctuation.
 - Ensure normalization strips unwanted tokens.
 - Ensure output is idempotent.
 
 ## 3.16 Example Property Test
 
 ```python
 @given(text())
 def test_normalization_idempotent(s):
     assert normalize(normalize(s)) == normalize(s)
 ```
 
 ## 3.17 Regression Suite Strategy
 
 - Each regression in `src/tests/regression/<issue_id>/`.
 - Include:
   - Input XML
   - Expected CSV
   - Notes on bug and fix
 
 ## 3.18 Regression Example Layout
 
 ```
 regression/
 └─ ISSUE-1234/
    ├─ input.xml
    ├─ expected_main.csv
    └─ README.md
 ```
 
 ## 3.19 Golden File Testing
 
 - Generate outputs from known input.
 - Compare against stored outputs.
 - Fail with diff when mismatched.
 
 ## 3.20 Golden File Example
 
 ```python
 def test_csv_output_matches_fixture(tmp_path):
     output = run_pipeline("fixtures/small.xml", tmp_path)
     assert filecmp.cmp(output, "fixtures/expected_main.csv")
 ```
 
 ## 3.21 XML Parsing Tests
 
 - Missing fields.
 - Duplicate playlist names.
 - Empty playlist.
 - Special characters in track names.
 
 ## 3.22 Beatport Parsing Tests
 
 - HTML with missing metadata.
 - HTML with unexpected layout.
 - Parsing errors are handled gracefully.
 
 ## 3.23 Query Generation Tests
 
 - Mix variants removed.
 - Remix variants normalized.
 - Multiple query candidates produced.
 
 ## 3.24 Matcher Scoring Tests
 
 - Exact match scores highest.
 - Partial match scores lower.
 - Guards reject false positives.
 
 ## 3.25 Output Writer Tests
 
 - CSV headers correct.
 - Correct column ordering.
 - File encoding is UTF-8.
 
 ## 3.26 Update Flow Tests
 
 - Update available detection.
 - Update installation flow.
 - Update rollback on failure.
 
 ## 3.27 Update Rollback Tests
 
 - Simulate interrupted update.
 - Verify previous version still runs.
 
 ## 3.28 Performance Tests (QA)
 
 - 10k track run completes within target time.
 - Memory usage within bounds.
 
 ## 3.29 Stress Tests
 
 - Large XML files.
 - Long track names.
 - High concurrency.
 
 ## 3.30 Fuzz Tests
 
 - Random XML inputs.
 - Malformed tags.
 - Special characters and emojis.
 
 ## 3.31 Test Fixtures Governance
 
 - Fixtures stored under version control.
 - Use sanitized data only.
 - Never store personal data.
 
 ## 3.32 CLI Smoke Tests
 
 - Run CLI with small XML.
 - Validate outputs produced.
 - Validate exit code.
 
 ## 3.33 GUI Smoke Tests (Manual)
 
 - Start, cancel, resume.
 - Export output.
 - Open review file.
 
 ## 3.34 Test Runner Design
 
 - Provide `scripts/run_tests.py` for common suites.
 - Support `--unit`, `--integration`, `--system`.
 
 ## 3.35 Test Tagging
 
 - `@unit`
 - `@integration`
 - `@system`
 - `@slow`
 
 ## 3.36 CI Test Matrix
 
 - OS: Windows, macOS.
 - Python: 3.12, 3.13 (if supported).
 - Suites: unit, integration.
 
 ## 3.37 CI Failure Policies
 
 - Fail on any unit test failure.
 - Allow rerun for flaky tests once.
 
 ## 3.38 Flaky Test Strategy
 
 - Identify and isolate.
 - Quarantine with mark.
 - Fix root cause quickly.
 
 ## 3.39 Code Coverage Reporting
 
 - Report coverage in CI.
 - Fail if below threshold.
 
 ## 3.40 Coverage Exclusions
 
 - Exclude vendored code.
 - Exclude generated code.
 - Exclude GUI layout boilerplate.
 
 ## 3.41 Test Case Matrix (Core)
 
 | Area | Test | Priority |
 | --- | --- | --- |
 | XML parsing | Missing fields | High |
 | Matching | Exact match scoring | High |
 | Output | CSV header correctness | High |
 | Update | Update detection | High |
 
 ## 3.42 Example XML Edge Case
 
 ```xml
 <TRACK Name="" Artist=""/>
 ```
 
 ## 3.43 Example Candidate Parsing Fixture
 
 ```html
 <div class="track">
   <span class="title">Song</span>
   <span class="artist">Artist</span>
   <span class="bpm">128</span>
 </div>
 ```
 
 ## 3.44 Example Matcher Test
 
 ```python
 def test_exact_match_scores_higher():
     candidate = Candidate(title="Song", artist="Artist")
     score = score_match(track, candidate)
     assert score > 0.95
 ```
 
 ## 3.45 Output Schema Tests
 
 - Ensure all required columns exist.
 - Validate column order.
 - Validate data types (string/number).
 
 ## 3.46 Match Confidence Tests
 
 - Low confidence should be flagged in review output.
 - High confidence should not appear in review output.
 
 ## 3.47 Query Log Tests
 
 - Query log includes all generated queries.
 - Query log includes run ID.
 
 ## 3.48 Candidate Log Tests
 
 - Candidate log includes score and source URL.
 - Candidate log includes track ID.
 
 ## 3.49 CSV Formatting Rules
 
 - Use consistent delimiter (comma).
 - Quote fields with commas.
 - Use UTF-8.
 
 ## 3.50 CSV Format Tests
 
 - Ensure commas are quoted.
 - Ensure line endings are consistent.
 
 ## 3.51 Test Environment Configuration
 
 - Use temp directories for outputs.
 - Avoid writing to user directories.
 
 ## 3.52 Test Isolation
 
 - Tests must not depend on execution order.
 - Use fixtures to reset state.
 
 ## 3.53 Time-Dependent Tests
 
 - Freeze time for deterministic outputs.
 - Use fixed timestamps for snapshots.
 
 ## 3.54 Error Handling Tests
 
 - Simulate network timeout.
 - Verify retry logic.
 - Verify error classification.
 
 ## 3.55 Retry Logic Tests
 
 - Retry count respected.
 - Backoff behavior correct.
 
 ## 3.56 Cache Tests
 
 - Cache hits reduce network calls.
 - Cache invalidation works.
 
 ## 3.57 CLI Exit Code Tests
 
 - Exit 0 on success.
 - Exit non-zero on fatal error.
 
 ## 3.58 Coverage of Guard Rules
 
 - Subset matches rejected.
 - Weak overlap rejected.
 - Mix type mismatches rejected.
 
 ## 3.59 Test Data Generation Scripts
 
 - Script to generate synthetic XML.
 - Script to generate fixture outputs.
 
 ## 3.60 Synthetic Data Generation Example
 
 ```python
 def generate_xml(num_tracks):
     # returns XML with predictable structure
     ...
 ```
 
 ## 3.61 Linting in CI
 
 - Run ruff.
 - Fail if lint errors.
 
 ## 3.62 Type Checking in CI
 
 - Run mypy.
 - Fail on type errors.
 
 ## 3.63 Static Analysis
 
 - Bandit or similar for security.
 - Fail on high severity.
 
 ## 3.64 UI Snapshot Testing (Optional)
 
 - Store screenshots for key dialogs.
 - Compare against baseline images.
 
 ## 3.65 Test Execution Order
 
 - Unit tests first.
 - Integration tests second.
 - System tests last.
 
 ## 3.66 Test Report Output
 
 - JUnit XML for CI.
 - Coverage report HTML.
 
 ## 3.67 Test Failures Triage
 
 - Assign to module owner.
 - Add reproduction steps in issue.
 
 ## 3.68 Release Readiness Test Mapping
 
 - Map each release gate to tests.
 - Ensure coverage for update, build, and version checks.
 
 ## 3.69 Test Prioritization
 
 - P0: must-run on every PR.
 - P1: nightly.
 - P2: manual.
 
 ## 3.70 P0 Test Suite (Example)
 
 - Unit tests for core logic.
 - XML parsing integration.
 - Output writer tests.
 
 ## 3.71 P1 Test Suite (Example)
 
 - Large XML performance tests.
 - Update flow tests.
 
 ## 3.72 P2 Tests (Example)
 
 - GUI manual tests.
 - End-to-end installer tests.
 
 ## 3.73 Test Documentation
 
 - Document how to run tests.
 - Document fixture generation.
 - Document expected runtimes.
 
 ## 3.74 Test Review Checklist
 
 - [ ] Test is deterministic.
 - [ ] Test cleans up after itself.
 - [ ] Test names clearly describe behavior.
 
 ## 3.75 Data Privacy in Tests
 
 - No real user data.
 - Mask any identifiers in fixtures.
 
 ## 3.76 Example Fixture Sanitization
 
 ```python
 def sanitize_title(title):
     return "Track " + str(hash(title) % 1000)
 ```
 
 ## 3.77 Test Coverage for CLI Flags
 
 - `--xml`
 - `--playlist`
 - `--output-dir`
 - `--config`
 - `--dry-run`
 
 ## 3.78 Failure Injection Tests
 
 - Simulate disk full.
 - Simulate permission error.
 - Simulate network error.
 
 ## 3.79 Build Script Tests
 
 - Validate PyInstaller spec exists.
 - Validate hook files.
 
 ## 3.80 Update Feed Tests
 
 - Validate XML format.
 - Validate checksum entries.
 
 ## 3.81 Benchmark Tracking
 
 - Store benchmark results per release.
 - Alert on regressions.
 
 ## 3.82 Error Log Tests
 
 - Validate errors are logged with codes.
 - Validate log rotation.
 
 ## 3.83 Memory Leak Tests
 
 - Run large dataset.
 - Monitor memory growth.
 
 ## 3.84 Threading Tests
 
 - Ensure UI thread remains responsive.
 - Ensure worker threads stop on cancel.
 
 ## 3.85 Parallelization Tests
 
 - Compare results across concurrency settings.
 - Ensure deterministic outputs.
 
 ## 3.86 Determinism Tests
 
 - Same input produces same output.
 - Same seed yields same results.
 
 ## 3.87 Time Budget Tests
 
 - Per-track time cap respected.
 
 ## 3.88 Edge Case: Duplicate Tracks
 
 - Ensure duplicates handled correctly.
 
 ## 3.89 Edge Case: Special Characters
 
 - Ensure normalization handles accents.
 
 ## 3.90 Edge Case: Long File Paths
 
 - Ensure no crash with long path.
 
 ## 3.91 Expected Failures
 
 - Mark tests that expect failure with `xfail`.
 
 ## 3.92 Example Integration Test
 
 ```python
 def test_pipeline_small_xml(tmp_path):
     outputs = run_cli("fixtures/small.xml", tmp_path)
     assert outputs.main.exists()
 ```
 
 ## 3.93 Example System Test
 
 ```python
 def test_cli_smoke(tmp_path):
     result = subprocess.run(["cuepoint", "--xml", "fixtures/small.xml"])
     assert result.returncode == 0
 ```
 
 ## 3.94 QA Signoff
 
 - QA signoff required before release.
 - QA checklist stored in docs.
 
 ## 3.95 Test Artifacts
 
 - Store logs from failed runs.
 - Store output diffs.
 
 ## 3.96 Test Dashboard (Optional)
 
 - Report coverage.
 - Report pass/fail rates.
 
 ## 3.97 Test Ownership
 
 - Assign owners for core suites.
 - Review tests quarterly.
 
 ## 3.98 Test Debt Tracking
 
 - Track missing tests as issues.
 - Assign priorities.
 
 ## 3.99 Exit Criteria
 
 - All P0 tests pass.
 - No failing regression tests.
 - Coverage above thresholds.
 
 ## 3.100 Future Enhancements
 
 - UI automation.
 - Cloud-based test matrix.
 
 ## 3.101 Detailed Test Matrix (Core Pipeline)
 
 | Stage | Input | Expected Output | Tests |
 | --- | --- | --- | --- |
 | XML Parse | valid XML | track list | unit + integration |
 | Query Gen | track list | query list | unit |
 | Search | query list | candidates | integration (mocked) |
 | Parse | candidates HTML | candidate models | unit |
 | Score | candidates | match score | unit |
 | Export | match results | CSV files | integration |
 
 ## 3.102 Scenario Coverage Matrix
 
 | Scenario | Description | Priority |
 | --- | --- | --- |
 | Happy path | Normal run | P0 |
 | Missing XML | Input error | P0 |
 | Missing playlist | Input error | P0 |
 | Network timeout | External error | P1 |
 | Partial matches | Low confidence | P1 |
 | Malformed XML | Input error | P1 |
 | Large dataset | Performance | P1 |
 | Disk full | Output error | P2 |
 
 ## 3.103 Module-Level Tests (Text Processing)
 
 - Remove punctuation.
 - Normalize whitespace.
 - Strip mix suffixes.
 - Preserve core title words.
 
 ## 3.104 Module-Level Tests (Mix Parser)
 
 - Extended mix recognized.
 - Radio edit recognized.
 - Remix tags recognized.
 - Unknown suffix preserved.
 
 ## 3.105 Module-Level Tests (Query Generator)
 
 - Generates at least 3 variants.
 - Variant order is deterministic.
 - Duplicates removed.
 
 ## 3.106 Module-Level Tests (Matcher)
 
 - Exact match > partial.
 - Artist mismatch reduces score.
 - Guard rejects subset title matches.
 
 ## 3.107 Module-Level Tests (Beatport Parser)
 
 - Missing BPM handled.
 - Missing key handled.
 - Genre missing handled.
 
 ## 3.108 Module-Level Tests (Rekordbox Parser)
 
 - Playlist name parsing.
 - Track entries mapping.
 - Unicode titles preserved.
 
 ## 3.109 Module-Level Tests (Output Writer)
 
 - Writes main CSV.
 - Writes review CSV.
 - Writes candidate CSV.
 - Writes query CSV.
 
 ## 3.110 CLI Argument Tests
 
 - `--xml` required.
 - `--playlist` required.
 - `--output-dir` optional.
 - `--config` loads overrides.
 
 ## 3.111 CLI Error Tests
 
 - Missing xml returns error code.
 - Missing playlist returns error code.
 - Output dir unwritable returns error code.
 
 ## 3.112 Run Summary Tests
 
 - Summary includes run ID.
 - Summary includes counts.
 - Summary includes output paths.
 
 ## 3.113 Update Flow Tests (Detailed)
 
 - Update available message appears.
 - Update download starts.
 - Update install completes.
 - App relaunches after update.
 
 ## 3.114 Update Failure Tests
 
 - Download fails (network error).
 - Install fails (permission error).
 - Rollback triggers.
 
 ## 3.115 Appcast Tests
 
 - Validate XML.
 - Validate version ordering.
 - Validate checksum field.
 
 ## 3.116 License Compliance Tests
 
 - License bundle exists in artifact.
 - License file is current.
 
 ## 3.117 Release Readiness Suite Mapping
 
 - `test_release_readiness_comprehensive.py` covers:
   - PyInstaller version
   - Spec config
   - Update system
   - Version config
 
 ## 3.118 Test Performance Budgets
 
 - Unit tests < 2 minutes.
 - Integration tests < 5 minutes.
 - System tests < 10 minutes.
 
 ## 3.119 Timeouts in Tests
 
 - Set per-test timeout for integration tests.
 - Avoid indefinite hanging.
 
 ## 3.120 Fixture Index
 
 | Fixture | Purpose |
 | --- | --- |
 | `small.xml` | Basic run |
 | `medium.xml` | Typical run |
 | `large.xml` | Performance |
 | `beatport_sample_1.html` | Parser |
 
 ## 3.121 Fixture Data Guidelines
 
 - Avoid real artist names if possible.
 - Use placeholders.
 - Keep consistent across fixtures.
 
 ## 3.122 Deterministic Seeds
 
 - Set random seed for any randomized test.
 - Use consistent ordering for output.
 
 ## 3.123 Data Schema Contract Tests
 
 - Validate output schema version.
 - Validate field types.
 
 ## 3.124 Schema Validation Example
 
 ```python
 REQUIRED_COLUMNS = ["Title", "Artist", "BPM", "Key", "Label"]
 def test_schema_columns(output_csv):
     assert all(c in output_csv.columns for c in REQUIRED_COLUMNS)
 ```
 
 ## 3.125 Test Fixtures for Edge Cases
 
 - Track with empty title.
 - Track with empty artist.
 - Track with both missing.
 
 ## 3.126 Test for Duplicate Playlist Names
 
 - Should warn and select first.
 - Should allow user to choose.
 
 ## 3.127 Configuration Validation Tests
 
 - Timeout < 1 should fail.
 - Concurrency < 1 should fail.
 
 ## 3.128 Logging Tests
 
 - Error logs include code.
 - Logs redact file paths.
 
 ## 3.129 Output Integrity Tests
 
 - Ensure file handles closed.
 - Ensure file size > 0.
 
 ## 3.130 Export Format Tests
 
 - CSV main file exists.
 - Review file exists.
 - Candidate file exists.
 - Query file exists.
 
 ## 3.131 Candidate Ranking Tests
 
 - Higher score candidate chosen.
 - Ties resolved deterministically.
 
 ## 3.132 Text Normalization Locale Tests
 
 - Accents normalized.
 - Diacritics stripped.
 
 ## 3.133 Query Explosion Limits
 
 - Ensure max queries per track.
 - Ensure no duplicates.
 
 ## 3.134 Integration Test Plan (Expanded)
 
 - Input: small.xml
 - Expected: output files with correct rows
 - Execution: run pipeline in memory
 
 ## 3.135 System Test Plan (Expanded)
 
 - Install app.
 - Run CLI.
 - Validate outputs.
 
 ## 3.136 CI Artifacts for Tests
 
 - Store logs on failure.
 - Store output diffs on failure.
 
 ## 3.137 Snapshot Test Strategy
 
 - Use snapshots for CSV.
 - Update snapshots only on intentional changes.
 
 ## 3.138 Snapshot Update Policy
 
 - Must include note in changelog.
 - Must include approval.
 
 ## 3.139 UI Regression Checklist
 
 - Verify main window layout.
 - Verify dialog sizes.
 - Verify text contrast.
 
 ## 3.140 UI Manual Test Cases
 
 - Open onboarding dialog.
 - Run preflight errors.
 - Complete run and view summary.
 
 ## 3.141 Release Regression Tests
 
 - Update from prior version.
 - Verify no DLL error.
 
 ## 3.142 Update Path Tests
 
 - Stable to stable.
 - Beta to beta.
 
 ## 3.143 Test Data Compliance
 
 - No copyrighted content in fixtures.
 - No personal data in fixtures.
 
 ## 3.144 Sanitization Rules
 
 - Replace track names with placeholders.
 - Use synthetic artists.
 
 ## 3.145 CI Parallelization
 
 - Run unit tests in parallel.
 - Run integration tests sequentially if required.
 
 ## 3.146 Test Sharding
 
 - Split suites by module.
 - Balance test runtime.
 
 ## 3.147 Test Metrics
 
 - Pass rate.
 - Flake rate.
 - Runtime per suite.
 
 ## 3.148 Flake Rate Threshold
 
 - If > 1% flaky, stop and fix.
 
 ## 3.149 Test Environment Variables
 
 - `CUEPOINT_TEST_MODE=1`
 - `CUEPOINT_FIXTURE_DIR=...`
 
 ## 3.150 Test Harness Requirements
 
 - Must isolate file system writes.
 - Must allow mock of network.
 
 ## 3.151 CLI Output Validation
 
 - Validate output file paths printed.
 - Validate summary printed.
 
 ## 3.152 Failure Mode: Empty XML
 
 - Return error.
 - Provide guidance.
 
 ## 3.153 Failure Mode: Corrupt XML
 
 - Return error.
 - Provide line number if possible.
 
 ## 3.154 Failure Mode: No Candidates
 
 - Still produce unmatched output.
 
 ## 3.155 Failure Mode: Network Offline
 
 - Retry then fail with message.
 
 ## 3.156 Retry Behavior Tests
 
 - Verify exponential backoff.
 - Verify max retries.
 
 ## 3.157 Cache Behavior Tests
 
 - Ensure cache use reduces runtime.
 
 ## 3.158 Cache Expiry Tests
 
 - Ensure stale entries invalidated.
 
 ## 3.159 Candidate Parsing Accuracy Tests
 
 - BPM parsed correctly.
 - Key parsed correctly.
 - Label parsed correctly.
 
 ## 3.160 Candidate Parsing Robustness Tests
 
 - Missing BPM should not crash.
 - Missing key should not crash.
 
 ## 3.161 Text Processing Performance Tests
 
 - Normalize 10000 titles under 1s.
 
 ## 3.162 Scoring Performance Tests
 
 - Score 1000 candidates under 1s.
 
 ## 3.163 Output Writer Performance Tests
 
 - Write 10k rows under 2s.
 
 ## 3.164 Concurrency Tests
 
 - Run with concurrency=1.
 - Run with concurrency=8.
 - Outputs identical.
 
 ## 3.165 Determinism Tests (Detailed)
 
 - Same input yields identical output order.
 - Same input yields identical scores.
 
 ## 3.166 Tracking Coverage by Module
 
 - `core` 85%
 - `data` 80%
 - `services` 75%
 - `ui` 40% (manual)
 
 ## 3.167 Coverage Enforcement
 
 - Fail CI if any module < threshold.
 
 ## 3.168 Test Suite Ownership
 
 - Core: maintainer A
 - Data: maintainer B
 - UI: maintainer C
 
 ## 3.169 Release Test Signoff
 
 - Document who signs off.
 - Require signoff before release.
 
 ## 3.170 Test Backlog
 
 - Add missing tests as issues.
 - Prioritize P0 gaps.
 
 ## 3.171 Tooling Versions
 
 - pytest version pinned.
 - hypothesis version pinned.
 
 ## 3.172 Test Fixtures for Updates
 
 - Mock appcast with version list.
 - Mock update download.
 
 ## 3.173 Update Installer Tests
 
 - Validate installer launches.
 - Validate CLI flags for updater.
 
 ## 3.174 Security Testing
 
 - Run bandit.
 - Run dependency audit.
 
 ## 3.175 Security Test Gates
 
 - Fail CI on high severity.
 
 ## 3.176 Linting Gates
 
 - Fail CI on lint errors.
 
 ## 3.177 Type Checking Gates
 
 - Fail CI on mypy errors.
 
 ## 3.178 Accessibility QA (Manual)
 
 - Keyboard navigation.
 - Focus order.
 
 ## 3.179 UI String Coverage
 
 - All user-visible strings in resource.
 
 ## 3.180 Localization Readiness Tests
 
 - Validate string extraction.
 
 ## 3.181 Test Data Generators
 
 - Generate synthetic tracks.
 - Generate synthetic playlists.
 
 ## 3.182 Example Synthetic Track Generator
 
 ```python
 def make_track(i):
     return {"title": f"Track {i}", "artist": f"Artist {i}"}
 ```
 
 ## 3.183 Documentation Tests
 
 - Verify docs links in app.
 - Verify release notes URL.
 
 ## 3.184 Documentation Build Checks
 
 - Link checker.
 - Broken links fail CI.
 
 ## 3.185 Metrics Collection for Tests
 
 - Track time per test suite.
 - Track failures by category.
 
 ## 3.186 Test Failure Escalation
 
 - If P0 fails, block merge.
 
 ## 3.187 Test Configurations
 
 - Debug mode tests.
 - Release mode tests.
 
 ## 3.188 Build Artifact Tests
 
 - Ensure signed artifacts.
 - Ensure version in metadata.
 
 ## 3.189 Build Script Tests (Detailed)
 
 - Verify hooks for DLL fix.
 - Verify spec file includes resources.
 
 ## 3.190 Release Candidate Validation
 
 - Run full test suite.
 - Run manual UI tests.
 
 ## 3.191 Test Documentation Template
 
 - Purpose
 - Preconditions
 - Steps
 - Expected results
 
 ## 3.192 Sample Test Case (Template)
 
 ```
 Test: XML Missing
 Steps:
 1. Select missing XML
 2. Click Start
 Expected: Error message shown, run not started
 ```
 
 ## 3.193 Test Automation Coverage
 
 - Automated: 80%
 - Manual: 20%
 
 ## 3.194 Manual QA Checklist (Expanded)
 
 - Verify all dialogs open.
 - Verify main run works.
 - Verify error messages.
 
 ## 3.195 Test Review Cadence
 
 - Review tests quarterly.
 
 ## 3.196 Deprecated Tests
 
 - Remove outdated fixtures.
 
 ## 3.197 Continuous Improvement
 
 - Add tests for new features.
 
 ## 3.198 Testing Risks
 
 - Risk: fixture drift.
 - Risk: brittle UI tests.
 
 ## 3.199 Mitigations
 
 - Use stable fixtures.
 - Limit UI automation.
 
 ## 3.200 Quality Metrics
 
 - Bug escape rate < 2%.
 - Regression rate < 5%.
