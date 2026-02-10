 # Step 4: Security and Privacy Design
 
 ## Purpose
 Protect user data, enforce secure defaults, and ensure compliance.
 
 ## Current State
 - Privacy/compliance docs exist in `docs/security` and `docs/policy`.
 - Update system and download flows are implemented.
 
 ## Proposed Implementation
 
 ### 4.1 Threat Model
 - Update tampering and MITM
 - Malformed XML or hostile HTML
 - Log leakage of sensitive paths
 
 ### 4.2 Secure Defaults
 - HTTPS only, retries with backoff, strict timeouts.
 - No telemetry by default.
 - No sensitive data in logs.
 
 ### 4.3 Update Integrity
 - Signed installers and checksums in appcast.
 - Validate signature before install.
 
 ### 4.4 Privacy UX
 - Add an in-app privacy page:
   - Network calls
   - Local storage locations
   - How to clear data
 
 ## Code Touchpoints
 - `src/cuepoint/update/` (update checks and installers)
 - `src/cuepoint/services/logging_service.py`
 - `docs/security/` and `docs/policy/`
 
 ## Example Sanitization
 ```python
 def safe_log_path(path):
     return "[redacted]" if is_sensitive(path) else str(path)
 ```
 
 ## Testing Plan
 - Dependency audit in CI (pip-audit).
 - Manual privacy verification (no PII in logs).
 - Update signature verification tests.
 
 ## Acceptance Criteria
 - Privacy policy matches actual behavior.
 - Updates are cryptographically verified.
 - Logs redact sensitive data.
 
 ---
 
 ## 4.5 Security Principles
 
 - Minimize data collection by default.
 - Always assume external inputs are untrusted.
 - Fail closed for update verification.
 - Prefer least privilege for file access.
 - Keep attack surface minimal.
 
 ## 4.6 Threat Model (Expanded)
 
 ### Threat Categories
 - Update tampering (MITM, malicious releases).
 - Malformed XML inputs (parser crashes).
 - HTML scraping changes (parser crashes).
 - Log leakage of file paths and usage.
 - Cache poisoning (stale or hostile data).
 
 ### Assets to Protect
 - Update channel integrity.
 - User file paths and library metadata.
 - Output files and logs.
 - Application stability.
 
 ### Trust Boundaries
 - Local machine: trusted but sensitive.
 - Network responses: untrusted.
 - Update feed: must be authenticated.
 
 ## 4.7 Secure Defaults
 
 - HTTPS only for network requests.
 - Strict timeouts and retry caps.
 - No telemetry by default.
 - No PII in logs.
 - Output files stored in user-controlled paths.
 
 ## 4.8 Data Minimization
 
 - Collect only required fields for matching.
 - Avoid storing raw HTML long-term.
 - Avoid storing full file paths in logs unless debug mode.
 
 ## 4.9 Update Security (Detailed)
 
 - Verify appcast signature or checksums.
 - Verify installer signatures before execution.
 - Reject updates with invalid signatures.
 - Enforce HTTPS for appcast and downloads.
 
 ## 4.10 Certificate Management
 
 - Store certificates in CI secrets.
 - Rotate keys annually.
 - Revoke keys on compromise.
 
 ## 4.11 Logging Sanitization
 
 - Redact user home directories.
 - Replace XML paths with `[redacted]` by default.
 - Allow opt-in verbose logs.
 
 ## 4.12 Privacy UX (Detailed)
 
 - Add in-app privacy page.
 - Describe network calls.
 - Provide "Clear Cache" and "Clear Logs".
 - Explain data retention.
 
 ## 4.13 Compliance Mapping
 
 - GDPR: opt-in telemetry.
 - CCPA: data deletion request.
 - Local: privacy notice.
 
 ## 4.14 Security Testing Strategy
 
 - Dependency scanning with `pip-audit`.
 - Static analysis with Bandit.
 - Manual review of log outputs.
 
 ## 4.15 Example Redaction Rules
 
 ```python
 def redact_path(path: str) -> str:
     if path.startswith(str(Path.home())):
         return path.replace(str(Path.home()), "~")
     return path
 ```
 
 ## 4.16 Update Verification (Pseudocode)
 
 ```python
 def verify_update(artifact_path, expected_hash):
     if sha256(artifact_path) != expected_hash:
         raise SecurityError("Checksum mismatch")
 ```
 
 ## 4.17 Threat Mitigations Matrix
 
 | Threat | Mitigation |
 | --- | --- |
 | Update tampering | Signature + checksum verification |
 | Malformed XML | Preflight validation + safe parsing |
 | Hostile HTML | Sanitized parsing with guards |
 | Log leakage | Redaction |
 | Cache poisoning | TTL + invalidation |
 
 ## 4.18 Data Retention Policy
 
 - Logs: 7 days (rotating).
 - Cache: 7 days TTL.
 - Outputs: user-controlled.
 
 ## 4.19 Data Deletion UX
 
 - Provide "Clear Cache".
 - Provide "Clear Logs".
 - Provide "Delete Outputs" guidance (manual).
 
 ## 4.20 Privacy Controls
 
 - Opt-in analytics toggle.
 - Crash reporting toggle.
 - Debug logging toggle.
 
 ## 4.21 Security Gate Checklist
 
 - [ ] Dependency scan passes.
 - [ ] Bandit scan passes.
 - [ ] Logs redacted.
 - [ ] Update signatures validated.
 
 ## 4.22 Audit Log Requirements
 
 - Log update checks and results.
 - Log version comparisons.
 - Log verification outcomes.
 
 ## 4.23 Security Error Codes
 
 - S001: Signature invalid
 - S002: Checksum mismatch
 - S003: Appcast invalid
 - S010: Log redaction failure
 
 ## 4.24 Example Privacy Page Copy
 
 - "CuePoint stores your XML and outputs locally only."
 - "No data is sent unless you enable error reporting."
 
 ## 4.25 Privacy Notice Alignment Checklist
 
 - Does privacy notice mention cache?
 - Does privacy notice mention logs?
 - Does privacy notice mention outputs?
 
 ## 4.26 Risk Register (Security)
 
 | Risk | Impact | Likelihood | Mitigation |
 | --- | --- | --- | --- |
 | Unverified updates | High | Low | Signature checks |
 | PII in logs | Medium | Medium | Redaction |
 | Malformed XML crash | Medium | Medium | Validation |
 
 ## 4.27 Example Test Cases
 
 - Appcast missing checksum fails update.
 - Invalid signature blocks install.
 - Logs show redacted paths.
 
 ## 4.28 Open Questions
 
 - Should we store logs in encrypted form?
 - Should crash reports be anonymized client-side?
 
 ## 4.29 Privacy Data Inventory
 
 | Data Type | Stored | Sent | Location |
 | --- | --- | --- | --- |
 | XML path | Yes | No | Config |
 | Outputs | Yes | No | Output dir |
 | Logs | Yes | No | Logs dir |
 | Cache | Yes | No | Cache dir |
 | Update checks | No | Yes | Network |
 
 ## 4.30 Security Architecture Overview
 
 - All external requests go through a network layer.
 - Inputs validated before processing.
 - Update verification before install.
 - Logs redacted by default.
 
 ## 4.31 Secure Network Defaults
 
 - Enforce HTTPS.
 - Validate TLS certs.
 - Reject insecure redirects.
 - Timeout on connect and read.
 
 ## 4.32 Secure Parsing Practices
 
 - Use safe XML parsing.
 - Avoid entity expansion (XXE).
 - Limit XML file size.
 
 ## 4.33 Example Safe XML Parse (Pseudocode)
 
 ```python
 def parse_xml(path):
     parser = SafeParser(disable_entities=True)
     return parser.parse(path)
 ```
 
 ## 4.34 Cache Security
 
 - Store cache in user directory only.
 - Validate cache entry schema.
 - Expire entries on TTL.
 
 ## 4.35 Cache Invalidation Rules
 
 - Expire on schema mismatch.
 - Expire on app version change.
 - Manual clear from UI.
 
 ## 4.36 Update Verification Workflow
 
 1. Download appcast.
 2. Validate appcast signature/checksum.
 3. Download artifact.
 4. Validate artifact checksum.
 5. Verify signature.
 6. Install update.
 
 ## 4.37 Privacy Settings UI
 
 - Toggle: "Send crash reports".
 - Toggle: "Send anonymous usage data".
 - Toggle: "Verbose logging".
 
 ## 4.38 Consent Storage
 
 - Store in config.
 - Do not enable by default.
 
 ## 4.39 Data Deletion Flow
 
 - Provide "Clear Cache" action.
 - Provide "Clear Logs" action.
 - Provide "Open Data Folder" for manual deletion.
 
 ## 4.40 Security Incident Response
 
 - Identify issue.
 - Revoke certificates if needed.
 - Publish hotfix.
 - Update appcast.
 
 ## 4.41 Security Monitoring
 
 - Track dependency vulnerabilities.
 - Monitor update failures.
 - Monitor crash reports (opt-in).
 
 ## 4.42 Example Threat Table (Expanded)
 
 | Threat | Vector | Mitigation |
 | --- | --- | --- |
 | MITM | Update download | HTTPS + signatures |
 | Malformed XML | Input file | Safe parse + size limit |
 | HTML changes | Scraping | Defensive parsing |
 | Log leakage | Logging | Redaction |
 | Cache poisoning | Cache | TTL + validation |
 
 ## 4.43 Security Checklist (Detailed)
 
 - [ ] TLS verification enabled.
 - [ ] Appcast validated.
 - [ ] Artifact checksums validated.
 - [ ] Signature verified.
 - [ ] Logs redacted.
 - [ ] Cache cleared on version change.
 
 ## 4.44 Privacy Checklist (Detailed)
 
 - [ ] Privacy notice updated.
 - [ ] Consent toggles in UI.
 - [ ] Data retention documented.
 - [ ] Data deletion supported.
 
 ## 4.45 Security Testing (Expanded)
 
 - Simulate appcast tampering.
 - Simulate checksum mismatch.
 - Simulate corrupted cache.
 
 ## 4.46 Privacy Testing (Expanded)
 
 - Verify no PII in logs.
 - Verify opt-in toggles disable telemetry.
 
 ## 4.47 Secure Defaults Verification
 
 - Ensure default config disables telemetry.
 - Ensure logs are redacted by default.
 
 ## 4.48 Example Config (Security)
 
 ```yaml
 privacy:
   telemetry_enabled: false
   crash_reporting_enabled: false
   redact_paths: true
 security:
   verify_updates: true
   enforce_https: true
 ```
 
 ## 4.49 Threat Model Review Cadence
 
 - Review quarterly.
 - Update after major feature changes.
 
 ## 4.50 Example Audit Log Entry
 
 ```
 [security] update_verification=success version=1.2.3
 ```
 
 ## 4.51 Security Requirements (Functional)
 
 - Update verification must fail closed.
 - Appcast must be HTTPS and validated.
 - Installer must be signed.
 - Logs must redact paths by default.
 
 ## 4.52 Security Requirements (Non-Functional)
 
 - Verification should add < 3 seconds to update flow.
 - Redaction should not remove non-sensitive diagnostics.
 - Security checks should be deterministic and testable.
 
 ## 4.53 Data Classification
 
 - **Public**: app version, release notes.
 - **Internal**: run metrics, error counts.
 - **Sensitive**: user file paths, playlist names.
 - **Restricted**: certificates, signing keys.
 
 ## 4.54 Data Flow Diagram (Text)
 
 ```
 User XML -> Parser -> Matcher -> Outputs (local)
 Network -> Beatport -> Parser -> Candidates (local)
 Update Feed -> Verifier -> Installer (local)
 ```
 
 ## 4.55 Data Flow Review Questions
 
 - Is any sensitive data leaving the device?
 - Are network requests minimized?
 - Are outputs stored in user-controlled locations?
 
 ## 4.56 Security Controls Inventory
 
 - Input validation
 - Output validation
 - Update verification
 - Logging redaction
 - Dependency scanning
 
 ## 4.57 Secure Update Policy
 
 - Reject unsigned artifacts.
 - Reject checksum mismatch.
 - Require HTTPS download.
 - Require version monotonicity.
 
 ## 4.58 Version Monotonicity
 
 - Do not downgrade unless explicit user action.
 - Beta channel cannot auto-update to stable unless enabled.
 
 ## 4.59 Update Feed Validation Rules
 
 - Entry must include version and URL.
 - URL must be HTTPS.
 - Checksum must be SHA256.
 - Length must match artifact size.
 
 ## 4.60 Security Logging Rules
 
 - Log update verification outcomes.
 - Log appcast parse errors.
 - Do not log full URLs with tokens.
 
 ## 4.61 Token and Secret Handling
 
 - No secrets in logs.
 - No secrets in config by default.
 - If added later, encrypt at rest.
 
 ## 4.62 Local Storage Locations
 
 - Config: OS app config path.
 - Logs: OS logs path.
 - Cache: OS cache path.
 - Outputs: user-selected path.
 
 ## 4.63 Privacy Notice Content Checklist
 
 - Data stored locally.
 - Data transmitted (updates).
 - Optional telemetry details.
 - Instructions for data deletion.
 
 ## 4.64 User Consent Rules
 
 - Opt-in for telemetry.
 - Opt-in for crash reporting.
 - Provide in-app toggle and doc.
 
 ## 4.65 Consent Audit Trail
 
 - Store opt-in timestamp.
 - Store consent version.
 
 ## 4.66 Privacy Settings Defaults
 
 - Telemetry: off.
 - Crash reporting: off.
 - Debug logging: off.
 
 ## 4.67 Privacy UX Copy (Extended)
 
 - "We only send update checks unless you enable telemetry."
 - "You can disable data sharing at any time."
 
 ## 4.68 Privacy Impact Assessment (Checklist)
 
 - Does the feature collect new data?
 - Is consent required?
 - Is storage duration documented?
 
 ## 4.69 Secure Coding Guidelines
 
 - Validate all external inputs.
 - Avoid `eval` or unsafe parsing.
 - Use safe file operations.
 
 ## 4.70 XML Security Hardening
 
 - Disable entity expansion.
 - Limit recursion depth.
 - Cap XML file size.
 
 ## 4.71 HTML Parsing Security
 
 - Strip scripts and event handlers.
 - Avoid executing HTML.
 
 ## 4.72 Network Security
 
 - Set user agent to identify app.
 - Respect rate limits.
 - Backoff on error.
 
 ## 4.73 Cache Security (Extended)
 
 - Only store cache in user data.
 - Validate cache format on read.
 - Clear cache on major version update.
 
 ## 4.74 Cache Validation Example
 
 ```python
 def validate_cache(entry):
     return "version" in entry and "payload" in entry
 ```
 
 ## 4.75 Handling Sensitive Fields
 
 - Mask XML paths in UI if privacy setting enabled.
 - Mask output paths in logs by default.
 
 ## 4.76 Error Reporting Policy
 
 - Crash reports must be opt-in.
 - Reports must be scrubbed of PII.
 - Provide preview before sending (optional).
 
 ## 4.77 Crash Report Payload (Example)
 
 ```json
 {
   "version": "1.2.3",
   "os": "Windows 11",
   "error": "Traceback summary",
   "run_id": "abc123"
 }
 ```
 
 ## 4.78 Update Security Tests (Detailed)
 
 - Tampered checksum fails.
 - Invalid signature fails.
 - Downgrade blocked.
 
 ## 4.79 Log Redaction Tests
 
 - Logs never contain `C:\\Users\\`.
 - Logs never contain `~/`.
 
 ## 4.80 PII Detection Tests
 
 - Scan logs for email patterns.
 - Scan logs for file paths.
 
 ## 4.81 Secure Defaults Tests
 
 - Telemetry off by default.
 - Crash reporting off by default.
 - Update verification on by default.
 
 ## 4.82 Dependency Security
 
 - Use `pip-audit` in CI.
 - Use Dependabot alerts.
 - Pin versions for releases.
 
 ## 4.83 Vulnerability Response
 
 - Triage within 24h.
 - Patch high severity within 7 days.
 - Publish security notes.
 
 ## 4.84 Security Release Checklist
 
 - [ ] Vulnerability scan clean.
 - [ ] Update verification enabled.
 - [ ] Privacy notice updated.
 
 ## 4.85 Threat Modeling Session Notes
 
 - Identify new data flows.
 - Identify new external dependencies.
 - Update mitigation list.
 
 ## 4.86 Policy Links
 
 - `docs/security/security-response-process.md`
 - `docs/policy/privacy-notice.md`
 
 ## 4.87 GDPR/CCPA Compliance Notes
 
 - Provide data deletion instructions.
 - Document data retention.
 - Provide opt-out controls.
 
 ## 4.88 Data Subject Request Handling
 
 - Provide contact path.
 - Provide deletion steps.
 
 ## 4.89 Security Audit Plan
 
 - Annual audit.
 - Review update flow.
 - Review logging and data retention.
 
 ## 4.90 Security Training
 
 - Code review checklist includes security items.
 - Review safe parsing practices.
 
 ## 4.91 Secure Build Pipeline
 
 - Build in isolated CI.
 - Restrict secrets access.
 - Sign only in release workflow.
 
 ## 4.92 Secrets Rotation Plan
 
 - Rotate annually.
 - Rotate on incident.
 
 ## 4.93 Secure Update Failover
 
 - If appcast invalid, show error and stop.
 - If download fails, allow retry.
 
 ## 4.94 Security UX for Errors
 
 - Clear error message when update verification fails.
 - Provide guidance: "Download latest release manually."
 
 ## 4.95 Security Telemetry (If Enabled)
 
 - Aggregate only.
 - No per-user identifiers.
 
 ## 4.96 Privacy-First Analytics Controls
 
 - Opt-in.
 - Disable at any time.
 - Clear data on opt-out.
 
 ## 4.97 Additional Threats
 
 - DLL hijacking on Windows.
 - Path traversal in outputs.
 
 ## 4.98 Mitigation: DLL Hijacking
 
 - Bundle DLLs properly.
 - Ensure safe load paths.
 
 ## 4.99 Mitigation: Path Traversal
 
 - Validate output paths.
 - Reject paths outside allowed directory.
 
 ## 4.100 Security Regression Tests
 
 - Re-run update verification tests.
 - Re-run log redaction tests.
 
 ## 4.101 Secure Defaults Checklist (Expanded)
 
 - [ ] HTTPS enforced
 - [ ] Telemetry disabled
 - [ ] Crash reporting disabled
 - [ ] Redaction enabled
 - [ ] Update verification enabled
 
 ## 4.102 Security Ownership
 
 - Security owner assigned.
 - Backup owner assigned.
 
 ## 4.103 Security Metrics
 
 - Vulnerabilities per release.
 - Time to patch.
 - Update verification failures.
 
 ## 4.104 Privacy Metrics
 
 - Opt-in rate.
 - Crash report volume.
 
 ## 4.105 Security Runbook
 
 - Steps for triage.
 - Steps for rollback.
 - Steps for disclosure.
 
 ## 4.106 Security Checklist (Pre-Release)
 
 - [ ] Dependency scan clean
 - [ ] Update verification on
 - [ ] Logs redacted
 - [ ] Privacy notice updated
 
 ## 4.107 Security Checklist (Post-Release)
 
 - [ ] Monitor update errors
 - [ ] Monitor crash rates
 - [ ] Review logs for sensitive data
 
 ## 4.108 Security Controls Mapping
 
 | Control | Threats Mitigated |
 | --- | --- |
 | HTTPS only | MITM, tampering |
 | Signature verification | Malicious releases |
 | Redaction | PII leakage |
 | Safe XML parse | XML attacks |
 
 ## 4.109 Security Test Cases (Detailed)
 
 - Appcast missing checksum -> update blocked.
 - Appcast invalid signature -> update blocked.
 - Tampered artifact -> update blocked.
 - Log redaction removes user path.
 
 ## 4.110 Privacy Test Cases (Detailed)
 
 - Telemetry off -> no events emitted.
 - Crash reporting off -> no crash sent.
 - Opt-in enabled -> events contain no PII.
 
 ## 4.111 Threat Scenario: Appcast Tampering
 
 - Attack: MITM modifies appcast to point to malicious file.
 - Detection: checksum verification fails.
 - Response: block update and warn user.
 
 ## 4.112 Threat Scenario: Malformed XML
 
 - Attack: XML with huge entity expansion.
 - Detection: safe parser rejects entities.
 - Response: fail preflight with error.
 
 ## 4.113 Threat Scenario: Log Leakage
 
 - Attack: logs include full user paths.
 - Detection: log scan tests.
 - Response: fix redaction rules.
 
 ## 4.114 Threat Scenario: Cache Poisoning
 
 - Attack: invalid cached data used.
 - Detection: schema validation on cache read.
 - Response: invalidate cache entry.
 
 ## 4.115 Secure Config Defaults
 
 - `verify_updates: true`
 - `redact_paths: true`
 - `telemetry_enabled: false`
 - `crash_reporting_enabled: false`
 
 ## 4.116 Secure Config Validation
 
 - Fail if `verify_updates` is disabled in release builds.
 - Warn if `redact_paths` disabled.
 
 ## 4.117 Secure Defaults Enforcement
 
 - Enforce at runtime for release builds.
 - Allow override only in dev builds.
 
 ## 4.118 Privacy UI Placement
 
 - Help menu -> "Privacy".
 - Settings -> "Privacy & Data".
 
 ## 4.119 Privacy Copy Guidelines
 
 - Use plain language.
 - Avoid legal jargon.
 - Link to full notice.
 
 ## 4.120 Privacy Settings UX
 
 - Toggle with short explanation.
 - "Learn more" link.
 - Show data retention policy.
 
 ## 4.121 Security UX for Updates
 
 - Show verification status.
 - If verification fails, explain why update is blocked.
 
 ## 4.122 Logging Categories
 
 - `security`
 - `privacy`
 - `update`
 - `network`
 
 ## 4.123 Logging Example (Redacted)
 
 ```
 [privacy] xml_path=~/Music/rekordbox.xml
 [security] update_signature=valid
 ```
 
 ## 4.124 Security Exceptions
 
 - Define `SecurityError` for verification failures.
 - Handle gracefully in UI.
 
 ## 4.125 Security Error Handling
 
 - Show user-friendly message.
 - Provide link to manual download.
 
 ## 4.126 Audit Trail Requirements
 
 - Log all update checks.
 - Log verification outcomes.
 - Log consent changes.
 
 ## 4.127 Consent Change Logging
 
 ```
 [privacy] telemetry_enabled=false -> true
 ```
 
 ## 4.128 Privacy Data Deletion Steps
 
 - User triggers clear cache/logs.
 - App deletes files.
 - App confirms deletion.
 
 ## 4.129 Secure Update Fallback
 
 - If appcast unreachable, do not update.
 - Provide manual update link.
 
 ## 4.130 Code Touchpoints (Expanded)
 
 - `src/cuepoint/update/update_checker.py`
 - `src/cuepoint/services/logging_service.py`
 - `src/cuepoint/services/config_service.py`
 - `src/cuepoint/data/rekordbox.py`
 
 ## 4.131 Security Test Automation
 
 - Add tests for signature verification.
 - Add tests for checksum mismatch.
 
 ## 4.132 Privacy Test Automation
 
 - Test telemetry disabled by default.
 - Test telemetry payload scrubbing.
 
 ## 4.133 Static Analysis Tools
 
 - Bandit for Python.
 - Safety or pip-audit.
 
 ## 4.134 Static Analysis Rules
 
 - Fail on high severity.
 - Warn on medium severity.
 
 ## 4.135 Secure Code Review Checklist
 
 - [ ] Inputs validated.
 - [ ] Outputs safe.
 - [ ] No secrets in logs.
 - [ ] Update verification intact.
 
 ## 4.136 Secure Build Checklist
 
 - [ ] Secrets stored in CI.
 - [ ] Signing only in CI.
 - [ ] No local signing keys in repo.
 
 ## 4.137 Privacy Review Checklist
 
 - [ ] Consent controls in UI.
 - [ ] Privacy notice updated.
 - [ ] Data retention documented.
 
 ## 4.138 Security Regression Suite
 
 - Update verification tests.
 - Log redaction tests.
 - Privacy opt-in tests.
 
 ## 4.139 Incident Response Playbook
 
 - Identify issue.
 - Contain impact.
 - Remediate.
 - Communicate to users.
 
 ## 4.140 Incident Communication
 
 - Provide clear instructions.
 - Offer patched release.
 - Update documentation.
 
 ## 4.141 Security Bug Bounty (Optional)
 
 - Define scope.
 - Define reporting channel.
 
 ## 4.142 Security Disclosure
 
 - Responsible disclosure policy.
 - Acknowledge reporters.
 
 ## 4.143 Secure Default Testing Matrix
 
 | Setting | Expected | Test |
 | --- | --- | --- |
 | Telemetry | Off | test_telemetry_default |
 | Crash reporting | Off | test_crash_default |
 | Redaction | On | test_redaction_default |
 
 ## 4.144 Path Redaction Rules
 
 - Replace home directory with `~`.
 - Replace drive letters with placeholder.
 
 ## 4.145 Example Redacted Path
 
 - `C:\Users\<username>\Music\rekordbox.xml` -> `~\Music\rekordbox.xml`
 
 ## 4.146 Security by Design Practices
 
 - Threat model every new feature.
 - Add security tests per feature.
 - Update privacy notice when needed.
 
 ## 4.147 Release Security Checklist
 
 - [ ] Appcast validated
 - [ ] Signature verification tested
 - [ ] Privacy notice updated
 
 ## 4.148 Documentation Updates
 
 - Add privacy page in docs.
 - Add security response process link.
 
 ## 4.149 Security Roadmap
 
 - Short-term: stronger verification.
 - Mid-term: optional encryption at rest.
 - Long-term: formal security audit.
 
 ## 4.150 Appendix: Security Config Example
 
 ```yaml
 security:
   enforce_https: true
   verify_updates: true
   reject_unsigned: true
 privacy:
   telemetry_enabled: false
   crash_reporting_enabled: false
 ```
 
 ## 4.151 Privacy Data Flow Details
 
 - XML input read locally only.
 - Beatport queries sent without user identifiers.
 - Outputs stored locally.
 - Logs stored locally.
 
 ## 4.152 Data Flow Review Checklist
 
 - [ ] No PII leaves device.
 - [ ] Network calls documented.
 - [ ] Data retention documented.
 
 ## 4.153 Security Controls by Module
 
 - `update_checker`: verify appcast + signatures.
 - `rekordbox parser`: safe XML parse.
 - `logging_service`: redaction.
 - `cache_service`: TTL + schema validation.
 
 ## 4.154 Security Unit Tests (List)
 
 - `test_redaction_removes_home_path`
 - `test_update_checksum_mismatch_blocks`
 - `test_appcast_invalid_rejected`
 - `test_xml_entities_blocked`
 
 ## 4.155 Privacy Unit Tests (List)
 
 - `test_telemetry_disabled_default`
 - `test_crash_reporting_disabled_default`
 - `test_event_payload_scrubbed`
 
 ## 4.156 Security Integration Tests (List)
 
 - Update check with valid appcast.
 - Update check with tampered appcast.
 - Cache invalidation on version change.
 
 ## 4.157 Security System Tests (List)
 
 - Full update flow with signature validation.
 - Installation with unsigned artifact blocked.
 
 ## 4.158 Threat Model Review Template
 
 - Feature name:
 - New data types:
 - New network calls:
 - Risks:
 - Mitigations:
 
 ## 4.159 Security Risk Scoring
 
 - Impact: Low / Medium / High.
 - Likelihood: Low / Medium / High.
 - Priority = Impact x Likelihood.
 
 ## 4.160 Attack Surface Inventory
 
 - XML parser.
 - Beatport HTML parser.
 - Update feed parser.
 - Installer invocation.
 
 ## 4.161 Security Regression Checklist
 
 - [ ] Run update verification tests.
 - [ ] Run redaction tests.
 - [ ] Run dependency audit.
 
 ## 4.162 Privacy Regression Checklist
 
 - [ ] Telemetry off by default.
 - [ ] Crash reporting off by default.
 - [ ] Privacy notice matches behavior.
 
 ## 4.163 Encryption at Rest (Optional)
 
 - Evaluate encrypting logs and cache.
 - Balance performance and complexity.
 
 ## 4.164 Input Validation Rules (XML)
 
 - Reject invalid tags.
 - Reject invalid characters.
 - Reject extremely large fields.
 
 ## 4.165 Input Validation Rules (HTML)
 
 - Ignore scripts.
 - Ignore inline event handlers.
 
 ## 4.166 Output Validation Rules
 
 - Output filenames sanitized.
 - Output paths restricted to user-chosen directory.
 
 ## 4.167 File Permission Rules
 
 - Use user-level directories.
 - Avoid writing to install directories.
 
 ## 4.168 Process Isolation
 
 - Run processing in worker threads.
 - Avoid executing external scripts in the UI thread.
 
 ## 4.169 Security Headers (If Hosting Feeds)
 
 - `Content-Security-Policy`
 - `X-Content-Type-Options`
 
 ## 4.170 Appcast Hosting Security
 
 - Use HTTPS.
 - Use GitHub Pages or trusted CDN.
 - Prevent unauthorized edits.
 
 ## 4.171 Permissions (macOS)
 
 - Avoid requesting unnecessary permissions.
 - Use standard user directories only.
 
 ## 4.172 Permissions (Windows)
 
 - Avoid requiring admin.
 - Use `%LOCALAPPDATA%`.
 
 ## 4.173 Privacy and UX Alignment
 
 - Consent toggles match docs.
 - Privacy settings discoverable.
 
 ## 4.174 Security Logging Fields
 
 - `event`
 - `version`
 - `result`
 
 ## 4.175 Privacy Logging Fields
 
 - `consent_change`
 - `old_value`
 - `new_value`
 
 ## 4.176 Structured Log Example
 
 ```json
 {"event": "update_check", "result": "ok", "version": "1.2.3"}
 ```
 
 ## 4.177 Security Gates in CI
 
 - `pip-audit` must pass.
 - `bandit` must pass.
 - `validate_appcast` must pass.
 
 ## 4.178 Release Security Validation Steps
 
 - Validate signatures.
 - Validate checksums.
 - Validate appcast.
 
 ## 4.179 Security Owner Responsibilities
 
 - Review threat model quarterly.
 - Ensure security tests pass.
 - Coordinate incident response.
 
 ## 4.180 Privacy Owner Responsibilities
 
 - Maintain privacy notice.
 - Review telemetry payloads.
 
 ## 4.181 Security Logging Retention
 
 - Rotate logs weekly.
 - Limit log size.
 
 ## 4.182 Security Controls for CI
 
 - Secret scanning in CI.
 - Restricted access to release workflows.
 
 ## 4.183 Secret Scanning Tools
 
 - GitHub secret scanning.
 - Custom regex checks.
 
 ## 4.184 Secret Scanning Rules
 
 - Block commits with keys.
 - Alert on potential tokens.
 
 ## 4.185 Supply Chain Security
 
 - Pin dependencies.
 - Validate hashes.
 - Verify build provenance.
 
 ## 4.186 Supply Chain Tests
 
 - Verify `requirements.txt` pinned.
 - Verify hashes present.
 
 ## 4.187 Data Residency
 
 - All data stored locally.
 - No remote storage by default.
 
 ## 4.188 Security for Auto-Update
 
 - Use secure channel.
 - Verify signature.
 - Provide manual override only when safe.
 
 ## 4.189 Privacy for Auto-Update
 
 - Update checks do not include identifiers.
 
 ## 4.190 Security UX for Update Errors
 
 - Provide error codes.
 - Provide retry button.
 
 ## 4.191 Documentation Requirements (Security)
 
 - Update security response doc.
 - Update privacy notice.
 - Document update verification.
 
 ## 4.192 Training and Awareness
 
 - Security checklist for PRs.
 - Privacy checklist for PRs.
 
 ## 4.193 Security QA Checklist
 
 - [ ] Update checks secure
 - [ ] Logs redacted
 - [ ] No PII in outputs
 
 ## 4.194 Privacy QA Checklist
 
 - [ ] Consent toggles function
 - [ ] No data sent without opt-in
 
 ## 4.195 Security Test Data
 
 - Malformed XML samples.
 - Tampered appcast sample.
 
 ## 4.196 Privacy Test Data
 
 - Synthetic XML without PII.
 
 ## 4.197 Security Acceptance Criteria (Expanded)
 
 - Update verification always enforced.
 - Logs contain no PII.
 - Privacy notice updated.
 
 ## 4.198 Privacy Acceptance Criteria (Expanded)
 
 - Telemetry opt-in only.
 - Data deletion documented.
 
 ## 4.199 Security Metrics (Targets)
 
 - Time to patch < 7 days.
 - Vulnerabilities per release < 1.
 
 ## 4.200 Privacy Metrics (Targets)
 
 - Telemetry opt-in < 30% (privacy-first).
 
 ## 4.201 Security Documentation Outline
 
 - Overview
 - Threat model
 - Update security
 - Logging and redaction
 - Incident response
 
 ## 4.202 Privacy Documentation Outline
 
 - What data is collected
 - Where data is stored
 - How to delete data
 
 ## 4.203 Update Verification Edge Cases
 
 - Appcast missing entry for current version.
 - Appcast includes duplicate versions.
 - Appcast version format invalid.
 
 ## 4.204 Appcast Parser Hardening
 
 - Strict XML validation.
 - Reject unknown tags if required.
 - Fail closed if missing checksum.
 
 ## 4.205 Artifact Verification Edge Cases
 
 - Artifact size mismatch.
 - Signature valid but checksum mismatch.
 
 ## 4.206 Privacy UX Edge Cases
 
 - User opts in, then opts out.
 - User opts out while app running.
 
 ## 4.207 Security Event Taxonomy
 
 - `update_check`
 - `update_verify`
 - `update_install`
 - `security_error`
 
 ## 4.208 Privacy Event Taxonomy
 
 - `consent_enabled`
 - `consent_disabled`
 - `data_cleared`
 
 ## 4.209 Security Event Payload (Example)
 
 ```json
 {
   "event": "update_verify",
   "result": "failed",
   "reason": "checksum_mismatch"
 }
 ```
 
 ## 4.210 Privacy Event Payload (Example)
 
 ```json
 {
   "event": "consent_enabled",
   "type": "telemetry"
 }
 ```
 
 ## 4.211 Encryption Considerations
 
 - Evaluate encrypting logs and cache.
 - If encryption added, document key storage.
 
 ## 4.212 Secure File Deletion
 
 - Delete cache and logs with standard OS delete.
 - Avoid leaving temp files.
 
 ## 4.213 Temporary File Handling
 
 - Create temp files in user temp directory.
 - Delete on completion.
 
 ## 4.214 Security for Temp Files
 
 - Avoid writing PII to temp.
 - Use random filenames.
 
 ## 4.215 Privacy and Logs
 
 - Avoid logging full track names.
 - Use hashed identifiers in logs if needed.
 
 ## 4.216 Hashing Strategy
 
 - Use SHA256 for identifiers.
 - Never hash with reversible scheme.
 
 ## 4.217 Privacy for Support Bundles
 
 - Scrub PII from bundle.
 - Show bundle contents before export.
 
 ## 4.218 Support Bundle Policy
 
 - User consent required.
 - Document what's included.
 
 ## 4.219 Threat: Insecure Dependencies
 
 - Mitigation: pin versions, audit.
 
 ## 4.220 Threat: Supply Chain Attack
 
 - Mitigation: verify hashes, SBOM.
 
 ## 4.221 Threat: Compromised Update Key
 
 - Mitigation: key rotation, revoke releases.
 
 ## 4.222 Threat: Cache Disclosure
 
 - Mitigation: store cache locally only, allow clear.
 
 ## 4.223 Threat: Log Leakage
 
 - Mitigation: redaction, log review.
 
 ## 4.224 Threat: Excessive Permissions
 
 - Mitigation: least privilege, avoid admin.
 
 ## 4.225 Security Design Review Checklist
 
 - [ ] Threat model updated
 - [ ] Data flow reviewed
 - [ ] Update verification implemented
 - [ ] Logging redaction verified
 
 ## 4.226 Privacy Design Review Checklist
 
 - [ ] Consent required
 - [ ] Data retention documented
 - [ ] Deletion steps available
 
 ## 4.227 Privacy Settings Storage
 
 - Store in config file.
 - Encrypt if sensitive.
 
 ## 4.228 Privacy Settings Migration
 
 - Ensure config migrations keep defaults.
 
 ## 4.229 Privacy Toggle UI States
 
 - Enabled
 - Disabled
 - Disabled (policy locked)
 
 ## 4.230 Policy Lock (Enterprise)
 
 - Allow admin to disable telemetry in managed environments.
 
 ## 4.231 Security of Managed Config
 
 - Read-only config file.
 - Avoid override by user.
 
 ## 4.232 Privacy Compliance Review
 
 - Review before each major release.
 
 ## 4.233 Security Testing Cadence
 
 - Weekly dependency audit.
 - Per-release verification tests.
 
 ## 4.234 Security Test Automation (Expanded)
 
 - Run `pip-audit` in CI.
 - Run `bandit` in CI.
 
 ## 4.235 Privacy Test Automation (Expanded)
 
 - Scan logs in CI.
 - Scan telemetry payload in tests.
 
 ## 4.236 Security Fail Fast Rules
 
 - Fail release if verification disabled.
 
 ## 4.237 Security Logging Levels
 
 - Info: update checks.
 - Warning: verification failed.
 - Error: security error.
 
 ## 4.238 Privacy Logging Levels
 
 - Info: consent changes.
 
 ## 4.239 Security Code Patterns
 
 - Use `SecurityError`.
 - Wrap update verification in try/except with clear error.
 
 ## 4.240 Security Code Example
 
 ```python
 try:
     verify_update(path, checksum)
 except SecurityError as exc:
     log_security_error(exc)
     show_error("Update verification failed.")
 ```
 
 ## 4.241 Privacy Code Example
 
 ```python
 if not config.telemetry_enabled:
     return
 send_event(event)
 ```
 
 ## 4.242 Dependency Governance
 
 - Prefer maintained libraries.
 - Remove unused deps.
 
 ## 4.243 Dependency Update Policy
 
 - Monthly updates.
 - Security patches ASAP.
 
 ## 4.244 Security Exceptions Process
 
 - Document exception.
 - Add expiration date.
 
 ## 4.245 Privacy Exceptions Process
 
 - Document new data collection.
 - Update privacy notice.
 
 ## 4.246 Incident Severity Levels
 
 - Sev1: update compromise.
 - Sev2: PII leakage.
 - Sev3: minor security bug.
 
 ## 4.247 Incident SLA
 
 - Sev1 response < 2h.
 - Sev2 response < 24h.
 
 ## 4.248 Security Incident Runbook (Outline)
 
 - Detect
 - Contain
 - Eradicate
 - Recover
 
 ## 4.249 Security Notification Templates
 
 - User notification for critical updates.
 - Internal notification for incident.
 
 ## 4.250 Security Postmortem Template
 
 - Impact
 - Root cause
 - Resolution
 - Preventive actions
 
