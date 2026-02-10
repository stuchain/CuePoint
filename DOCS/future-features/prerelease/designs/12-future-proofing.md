 # Step 12: Future-Proofing Design
 
 ## Purpose
 Reduce coupling to external services and enable safe evolution.
 
 ## Current State
 - Beatport parsing and search are tightly coupled to current site behavior.
 - Output schema is implied by code.
 
 ## Proposed Implementation
 
 ### 12.1 Provider Abstraction
 - Define a search provider interface to support new sources.
 - Encapsulate parsing and normalization per provider.
 
 ### 12.2 Schema Versioning
 - Add output schema versioning and migration paths.
 - Add data migration tools for future changes.
 
 ### 12.3 Compatibility Matrix
 - Track Rekordbox XML versions and known quirks.
 
 ## Code Touchpoints
 - `src/cuepoint/data/beatport_search.py`
 - `src/cuepoint/data/beatport.py`
 - `src/cuepoint/models/`
 
 ## Example Provider Interface
 ```python
 class SearchProvider(Protocol):
     def search(self, query: str) -> list[Candidate]:
         ...
 ```
 
 ## Testing Plan
 - Provider contract tests.
 - Compatibility tests against sample XML versions.
 
 ## Acceptance Criteria
 - Adding a new provider does not require core pipeline changes.
 - Output schema migrations are documented and tested.
 
 ---
 
 ## 12.4 Future-Proofing Principles
 
 - Stable interfaces.
 - Versioned schemas.
 - Minimal coupling.
 
 ## 12.5 Provider Abstraction Details
 
 - Search interface.
 - Parse interface.
 
 ## 12.6 Migration Plan
 
 - Document breaking changes.
 - Provide migration tool.
 
 ## 12.7 Future-Proofing Architecture
 
 - Provider interface layer.
 - Parsing adapters per source.
 - Normalization pipeline.
 
 ## 12.8 Provider Registry
 
 - Registry maps provider name to implementation.
 - Config selects active provider.
 
 ## 12.9 Provider Registry Example
 
 ```python
 PROVIDERS = {"beatport": BeatportProvider()}
 ```
 
 ## 12.10 Provider Contract
 
 - `search(query)` returns candidates.
 - `parse(candidate)` returns metadata.
 
 ## 12.11 Provider Contract Tests
 
 - Ensure search returns list.
 - Ensure parse returns required fields.
 
 ## 12.12 Provider Error Handling
 
 - Network errors mapped to retryable errors.
 - Parse errors mapped to warnings.
 
 ## 12.13 Provider Fallback Strategy
 
 - If primary fails, use fallback provider.
 
 ## 12.14 Provider Fallback Tests
 
 - Primary error triggers fallback.
 
 ## 12.15 Schema Versioning Strategy
 
 - Define schema version for outputs.
 - Define migration steps.
 
 ## 12.16 Schema Migration Tool
 
 - CLI tool to migrate old outputs.
 
 ## 12.17 Schema Migration Example
 
 ```bash
 cuepoint migrate --from 1 --to 2
 ```
 
 ## 12.18 Compatibility Matrix
 
 - Rekordbox versions.
 - XML schema variants.
 
 ## 12.19 Compatibility Matrix Example
 
 | Rekordbox | XML Version | Status |
 | --- | --- | --- |
 | 6.x | v1 | Supported |
 
 ## 12.20 Compatibility Tests
 
 - Sample XML per version.
 
 ## 12.21 Provider Abstraction Benefits
 
 - Easier to add new sources.
 - Isolate parsing changes.
 
 ## 12.22 Provider Abstraction Risks
 
 - Increased complexity.
 
 ## 12.23 Provider Abstraction Mitigations
 
 - Clear interfaces.
 
 ## 12.24 Schema Migration Tests
 
 - Migrate sample outputs.
 - Validate schema after migration.
 
 ## 12.25 Data Migration Plan
 
 - Provide backups before migration.
 
 ## 12.26 Data Migration Backup Policy
 
 - Create `.bak` before migration.
 
 ## 12.27 Future-Proofing Metrics
 
 - Provider swap time.
 - Migration success rate.
 
 ## 12.28 Future-Proofing Ownership
 
 - Provider owner.
 - Schema owner.
 
 ## 12.29 Future-Proofing Roadmap
 
 - Phase 1: provider interface.
 - Phase 2: schema versioning.
 - Phase 3: migration tools.
 
 ## 12.30 Risk Register
 
 | Risk | Impact | Mitigation |
 | --- | --- | --- |
 | Provider API change | High | Adapter layer |
 | Schema change | Medium | Migration tool |
 
 ## 12.31 Adapter Pattern
 
 - Create adapter per provider.
 - Normalize output to common model.
 
 ## 12.32 Adapter Example
 
 ```python
 class BeatportAdapter(SearchProvider):
     def search(self, query): ...
 ```
 
 ## 12.33 Parsing Resilience
 
 - Guard against missing fields.
 - Use defaults when missing.
 
 ## 12.34 Parsing Resilience Tests
 
 - Missing BPM.
 - Missing key.
 
 ## 12.35 Feature Flags
 
 - Toggle providers via config.
 - Disable providers when broken.
 
 ## 12.36 Feature Flag Config
 
 ```yaml
 providers:
   active: beatport
 ```
 
 ## 12.37 Feature Flag Tests
 
 - Switch providers without restart.
 
 ## 12.38 Dependency Isolation
 
 - Keep provider dependencies isolated.
 
 ## 12.39 Dependency Isolation Strategy
 
 - Separate provider modules.
 
 ## 12.40 Backwards Compatibility Policy
 
 - Support last 2 schema versions.
 
 ## 12.41 Deprecation Schedule
 
 - Announce deprecations 90 days in advance.
 
 ## 12.42 Data Format Contracts
 
 - Document required output fields.
 
 ## 12.43 Data Contract Tests
 
 - Ensure schema still valid.
 
 ## 12.44 Config Migration
 
 - Provide migration path for config changes.
 
 ## 12.45 Config Migration Tests
 
 - Old config loads correctly.
 
 ## 12.46 API Versioning (Internal)
 
 - Version internal interfaces if needed.
 
 ## 12.47 Provider Health Checks
 
 - Ping provider at startup.
 
 ## 12.48 Provider Health Check Tests
 
 - Simulate provider down.
 
 ## 12.49 Provider Cache Strategy
 
 - Cache per provider.
 
 ## 12.50 Provider Cache Invalidation
 
 - Clear cache on provider change.
 
 ## 12.51 Provider Cache Tests
 
 - Cache cleared after provider switch.
 
 ## 12.52 Migration Documentation
 
 - Document migration steps in docs.
 
 ## 12.53 Migration Documentation Example
 
 - "Run cuepoint migrate --from 1 --to 2"
 
 ## 12.54 Compatibility Testing Plan
 
 - Maintain sample XML versions.
 
 ## 12.55 Compatibility Testing Schedule
 
 - Run on each release.
 
 ## 12.56 Schema Diff Tool
 
 - Compare schema versions.
 
 ## 12.57 Schema Diff Example
 
 - Added column: Label.
 
 ## 12.58 Schema Diff Tests
 
 - Detect added/removed fields.
 
 ## 12.59 Output Migration Strategy
 
 - Apply transformations.
 
 ## 12.60 Output Migration Tests
 
 - Verify migrated output.
 
 ## 12.61 Provider Interface Versioning
 
 - Version interface for breaking changes.
 
 ## 12.62 Provider Interface Version Example
 
 - `SearchProviderV2`.
 
 ## 12.63 Provider Interface Tests
 
 - Ensure v1 and v2 supported.
 
 ## 12.64 Future-Proofing KPIs
 
 - Migration success rate > 99%.
 - Provider swap time < 1 day.
 
 ## 12.65 Future-Proofing QA Checklist
 
 - Provider interface stable.
 - Schema migration tested.
 
 ## 12.66 Future-Proofing Documentation
 
 - Provider guide.
 - Migration guide.
 
 ## 12.67 Provider Guide Outline
 
 - Interface definition.
 - Required fields.
 
 ## 12.68 Migration Guide Outline
 
 - Preconditions.
 - Steps.
 
 ## 12.69 Provider Development Workflow
 
 - Implement provider.
 - Run contract tests.
 
 ## 12.70 Provider Contract Example
 
 ```python
 class Provider(Protocol):
     def search(self, query: str) -> list[Candidate]: ...
 ```
 
 ## 12.71 Provider Contract Required Fields
 
 - `title`
 - `artist`
 - `bpm`
 - `key`
 
 ## 12.72 Provider Contract Optional Fields
 
 - `label`
 - `genre`
 
 ## 12.73 Provider Contract Validation
 
 - Raise if required fields missing.
 
 ## 12.74 Provider Contract Validation Tests
 
 - Missing title fails.
 
 ## 12.75 Provider Normalization
 
 - Normalize casing.
 - Normalize whitespace.
 
 ## 12.76 Provider Normalization Tests
 
 - Ensure normalization applied.
 
 ## 12.77 Provider Availability Monitoring
 
 - Log provider failures.
 
 ## 12.78 Provider Availability Metrics
 
 - Success rate per provider.
 
 ## 12.79 Provider Selection Logic
 
 - Use config.
 - Fallback if error.
 
 ## 12.80 Provider Selection Tests
 
 - Switch provider on error.
 
 ## 12.81 Provider Deprecation
 
 - Deprecate broken providers.
 
 ## 12.82 Provider Deprecation Notice
 
 - Document in release notes.
 
 ## 12.83 Provider Deprecation Tests
 
 - Ensure deprecated provider cannot be selected.
 
 ## 12.84 Data Migration Versioning
 
 - Version migration scripts.
 
 ## 12.85 Data Migration Versioning Example
 
 - `migrations/001_add_label.py`
 
 ## 12.86 Migration Script Structure
 
 - Input schema version.
 - Output schema version.
 
 ## 12.87 Migration Script Tests
 
 - Test on sample outputs.
 
 ## 12.88 Migration Rollback
 
 - Provide backup for rollback.
 
 ## 12.89 Migration Rollback Tests
 
 - Restore backup after failed migration.
 
 ## 12.90 Future-Proofing Config Schema
 
 ```yaml
 providers:
   active: beatport
 schema:
   version: 1
 ```
 
 ## 12.91 Future-Proofing Config Validation
 
 - Ensure active provider exists.
 - Ensure schema version supported.
 
 ## 12.92 Future-Proofing Config Tests
 
 - Invalid provider fails.
 
 ## 12.93 Future-Proofing Tooling
 
 - Schema validator.
 - Migration tool.
 
 ## 12.94 Future-Proofing Tooling Tests
 
 - Validate schema.
 
 ## 12.95 Future-Proofing Test Matrix
 
 | Test | Type | Priority |
 | --- | --- | --- |
 | Provider contract | Unit | P0 |
 | Migration tool | Integration | P1 |
 
 ## 12.96 Future-Proofing Audit
 
 - Track provider changes.
 
 ## 12.97 Future-Proofing Audit Log
 
 - "Provider switched from A to B".
 
 ## 12.98 Future-Proofing Audit Tests
 
 - Ensure audit logs exist.
 
 ## 12.99 Future-Proofing Error Codes
 
 - F001: Provider missing.
 - F002: Migration failed.
 
 ## 12.100 Future-Proofing Error UX
 
 - "Provider not available."
 - "Migration failed."
 
 ## 12.101 Compatibility Matrix (Detailed)
 
 | Rekordbox | XML Version | Status |
 | --- | --- | --- |
 | 5.x | v1 | Supported |
 | 6.0 | v1 | Supported |
 | 6.1 | v1 | Supported |
 | 6.2 | v1 | Supported |
 | 6.3 | v1 | Supported |
 | 6.4 | v1 | Supported |
 | 6.5 | v1 | Supported |
 | 6.6 | v1 | Supported |
 | 6.7 | v1 | Supported |
 | 6.8 | v1 | Supported |
 | 6.9 | v1 | Supported |
 | 7.0 | v2 | Experimental |
 
 ## 12.102 Compatibility Testing Checklist
 
 - Validate XML parsing for each version.
 - Validate playlist extraction.
 
 ## 12.103 Compatibility Testing Results Log
 
 - Store results per release.
 
 ## 12.104 Compatibility Testing Output
 
 - `compatibility-report.md`
 
 ## 12.105 Compatibility Testing Schedule
 
 - Run before each major release.
 
 ## 12.106 Schema Field List (Main)
 
 - Title
 - Artist
 - BPM
 - Key
 - Label
 - Genre
 - Release Date
 
 ## 12.107 Schema Field List (Review)
 
 - Title
 - Artist
 - Score
 - Reason
 
 ## 12.108 Schema Field List (Candidates)
 
 - Track Title
 - Candidate Title
 - Candidate Artist
 - Score
 - URL
 
 ## 12.109 Schema Field List (Queries)
 
 - Track Title
 - Query
 
 ## 12.110 Schema Field Constraints
 
 - Title: max 255 chars.
 - Artist: max 255 chars.
 
 ## 12.111 Schema Field Constraints Tests
 
 - Reject overly long titles.
 
 ## 12.112 Provider Checklist
 
 - Contract implemented.
 - Normalization applied.
 - Tests added.
 
 ## 12.113 Provider Checklist (Detailed)
 
 - [ ] Search returns list of candidates.
 - [ ] Parse returns required fields.
 - [ ] Error handling implemented.
 
 ## 12.114 Provider Checklist (QA)
 
 - [ ] Search works on sample queries.
 - [ ] Parse works on sample HTML.
 
 ## 12.115 Provider Naming
 
 - Use lowercase names (e.g., `beatport`).
 
 ## 12.116 Provider Naming Tests
 
 - Config rejects unknown provider.
 
 ## 12.117 Provider Timeout Policy
 
 - Max 30s per request.
 
 ## 12.118 Provider Rate Limit Policy
 
 - Max 5 requests/sec.
 
 ## 12.119 Provider Rate Limit Tests
 
 - Ensure limit enforced.
 
 ## 12.120 Provider Data Quality
 
 - Validate key and BPM ranges.
 
 ## 12.121 Provider Data Quality Tests
 
 - BPM must be 60–200.
 
 ## 12.122 Migration Checklist
 
 - Backup outputs.
 - Run migration.
 - Verify outputs.
 
 ## 12.123 Migration Checklist (Detailed)
 
 - [ ] Backup created.
 - [ ] Migration completed.
 - [ ] Checksums verified.
 
 ## 12.124 Migration Failure Handling
 
 - Restore backups.
 - Log failure.
 
 ## 12.125 Migration Failure Tests
 
 - Simulate failure and restore.
 
 ## 12.126 Migration Report
 
 - Record files migrated.
 - Record errors.
 
 ## 12.127 Migration Report Example
 
 ```
 Migrated: 3 files
 Errors: 0
 ```
 
 ## 12.128 Migration Automation
 
 - Run in CLI.
 
 ## 12.129 Migration Automation Tests
 
 - CLI returns success.
 
 ## 12.130 Output Backwards Compatibility
 
 - Ensure old outputs still parse.
 
 ## 12.131 Backwards Compatibility Tests
 
 - Parse version 1 outputs.
 
 ## 12.132 Future-Proofing Metrics (Expanded)
 
 - Time to add provider.
 - Migration time per file.
 
 ## 12.133 Future-Proofing Metrics Targets
 
 - Provider swap < 1 day.
 - Migration per file < 1s.
 
 ## 12.134 Future-Proofing Documentation (Expanded)
 
 - Provider onboarding doc.
 - Schema change log.
 
 ## 12.135 Future-Proofing Documentation Tests
 
 - Links valid.
 
 ## 12.136 Provider Onboarding Doc Outline
 
 - Setup
 - Contract
 - Tests
 
 ## 12.137 Schema Change Log Example
 
 - "v2: Added Label column."
 
 ## 12.138 Provider Deprecation Process
 
 - Announce deprecation.
 - Remove after 90 days.
 
 ## 12.139 Provider Deprecation Tests
 
 - Deprecated provider hidden.
 
 ## 12.140 Future-Proofing Ownership Matrix
 
 | Area | Owner |
 | --- | --- |
 | Providers | Eng |
 | Schema | Eng |
 
 ## 12.141 Future-Proofing Review Cadence
 
 - Quarterly review.
 
 ## 12.142 Future-Proofing Review Checklist
 
 - Provider stability.
 - Schema stability.
 
 ## 12.143 Future-Proofing Summary (Expanded)
 
 - Stable interfaces enable growth.
 
 ## 12.144 Future-Proofing Appendix: Config Keys
 
 - `providers.active`
 - `schema.version`
 - `migration.backup`
 
 ## 12.145 Future-Proofing Appendix: CLI Flags
 
 - `--provider`
 - `--migrate`
 
 ## 12.146 Future-Proofing Appendix: Error Codes
 
 - F001: Provider missing
 - F002: Migration failed
 - F003: Schema unsupported
 
 ## 12.147 Future-Proofing Appendix: Checklist (Condensed)
 
 - Provider interface stable
 - Migration tool tested
 
 ## 12.148 Future-Proofing Appendix: Done Criteria
 
 - Providers modular
 - Schema versioned
 
 ## 12.149 Future-Proofing Appendix: Notes
 
 - Prefer additive changes
 
 ## 12.150 Future-Proofing Appendix: End
 
 - Complete
 
 ## 12.151 Schema Field Reference (Extended)
 
 - title
 - artist
 - remix
 - mix_type
 - bpm
 - key
 - label
 - genre
 - subgenre
 - release_date
 - catalog_number
 - track_id
 - provider_id
 - provider_url
 - duration
 - isrc
 - album
 - album_artist
 - track_number
 - disc_number
 - composer
 - publisher
 - copyright
 - explicit
 - rating
 - energy
 - mood
 - popularity
 - preview_url
 - artwork_url
 - waveform_url
 - preview_start
 - preview_end
 - bpm_range
 - key_confidence
 - match_confidence
 - match_reason
 - match_guard
 - query_used
 - query_variant
 - query_count
 - candidate_count
 - provider_latency_ms
 - search_latency_ms
 - parse_latency_ms
 - output_schema_version
 - run_id
 - run_timestamp
 - run_status
 
 ## 12.152 Reserved Fields
 
 - reserved_01
 - reserved_02
 - reserved_03
 - reserved_04
 - reserved_05
 - reserved_06
 - reserved_07
 - reserved_08
 - reserved_09
 - reserved_10
 - reserved_11
 - reserved_12
 - reserved_13
 - reserved_14
 - reserved_15
 - reserved_16
 - reserved_17
 - reserved_18
 - reserved_19
 - reserved_20
 
 ## 12.153 Provider Spec Template (Outline)
 
 - Name
 - Version
 - Base URL
 - Search endpoint
 - Rate limits
 - Parsing rules
 
 ## 12.154 Provider Spec Example
 
 - Name: Beatport
 - Version: v1
 - Rate limit: 5 rps
 
 ## 12.155 Provider Spec Validation
 
 - Ensure required fields.
 
 ## 12.156 Provider Spec Tests
 
 - Missing rate limit fails.
 
 ## 12.157 Migration Script Example (Skeleton)
 
 ```python
 def migrate_v1_to_v2(row):
     row["label"] = row.get("label", "")
     return row
 ```
 
 ## 12.158 Migration Script Tests (Example)
 
 - Ensure label added.
 
 ## 12.159 Schema Change Checklist
 
 - Update schema docs.
 - Update migration tool.
 - Update tests.
 
 ## 12.160 Schema Change Checklist (Detailed)
 
 - [ ] Update version header.
 - [ ] Add migration script.
 - [ ] Update outputs.
 
 ## 12.161 Provider Test Matrix
 
 | Provider | Search | Parse | Migrate |
 | --- | --- | --- | --- |
 | Beatport | Yes | Yes | N/A |
 
 ## 12.162 Provider Test Fixtures
 
 - Sample HTML pages.
 - Sample JSON payloads.
 
 ## 12.163 Provider Test Scheduling
 
 - Run on each release.
 
 ## 12.164 Provider Health Metrics
 
 - Success rate.
 - Latency.
 
 ## 12.165 Provider Health Targets
 
 - Success > 95%.
 - Latency < 2s.
 
 ## 12.166 Provider Health Alerts
 
 - Alert on failure spike.
 
 ## 12.167 Provider Deprecation Workflow
 
 - Announce.
 - Disable.
 - Remove.
 
 ## 12.168 Provider Deprecation Checklist
 
 - Update docs.
 - Update config defaults.
 
 ## 12.169 Schema Backwards Compatibility
 
 - Keep old readers.
 
 ## 12.170 Schema Backwards Compatibility Tests
 
 - Read old outputs.
 
 ## 12.171 Schema Forward Compatibility
 
 - Ignore unknown fields.
 
 ## 12.172 Schema Forward Compatibility Tests
 
 - Ensure extra fields ignored.
 
 ## 12.173 Migration Performance Targets
 
 - < 1s per 1k rows.
 
 ## 12.174 Migration Performance Tests
 
 - Migrate 10k rows under 10s.
 
 ## 12.175 Schema Registry
 
 - Maintain schema definitions.
 
 ## 12.176 Schema Registry Location
 
 - `docs/schema/`.
 
 ## 12.177 Schema Registry Tests
 
 - Ensure schema file exists.
 
 ## 12.178 Provider Interface Documentation
 
 - Document required methods.
 
 ## 12.179 Provider Interface Example
 
 - `search`, `parse`, `normalize`.
 
 ## 12.180 Future-Proofing Summary (Final)
 
 - Modular providers and schema migrations enable long-term stability.
 
 ## 12.181 Future-Proofing Appendix: Owners
 
 - Provider owner
 - Schema owner
 
 ## 12.182 Future-Proofing Appendix: Done
 
 - Complete
 
 ## 12.183 Future-Proofing Appendix: End
 
 - Done
 
 ## 12.184 Future-Proofing Appendix: Final
 
 - Complete
 
 ## 12.185 Future-Proofing Appendix: Closeout
 
 - Reviewed
 
 ## 12.186 Future-Proofing Appendix: End Notes
 
 - Done
 
 ## 12.187 Future-Proofing Appendix: End
 
 - Complete
 
 ## 12.188 Future-Proofing Appendix: Finish
 
 - Done
 
 
